const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;
const JWT_SECRET = process.env.JWT_SECRET || 'daycost_dev_secret_key_999';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');
        // Initialize tables
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                item_name TEXT,
                price REAL NOT NULL,
                purchase_date TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`);
            
            // Safe Migrations (Errors ignored if columns already exist)
            db.run("ALTER TABLE records ADD COLUMN status TEXT DEFAULT 'active'", (err) => {});
            db.run("ALTER TABLE records ADD COLUMN end_date TEXT", (err) => {});
            db.run("ALTER TABLE records ADD COLUMN resale_price REAL DEFAULT 0", (err) => {});
            db.run("ALTER TABLE records ADD COLUMN parent_id INTEGER DEFAULT NULL", (err) => {});
        });
    }
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) return res.status(401).json({ error: '请先登录' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: '登录态已过期，请重新登录' });
        req.user = user;
        next();
    });
};

// --- AUTH APIs ---

// Register
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, [username, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: '用户名已存在' });
                }
                return res.status(500).json({ error: '注册失败' });
            }
            res.json({ message: '注册成功！请登录' });
        });
    } catch (err) {
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: '服务器错误' });
        if (!user) return res.status(400).json({ error: '用户不存在或密码错误' });

        try {
            if (await bcrypt.compare(password, user.password_hash)) {
                const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
                res.json({ token, username: user.username });
            } else {
                res.status(400).json({ error: '用户不存在或密码错误' });
            }
        } catch (err) {
            res.status(500).json({ error: '服务器内部错误' });
        }
    });
});

// Change Password
app.put('/api/auth/password', authenticateToken, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写完整信息' });

    db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], async (err, user) => {
        if (err) return res.status(500).json({ error: '服务器错误' });
        if (!user) return res.status(404).json({ error: '用户不存在' });

        try {
            const match = await bcrypt.compare(oldPassword, user.password_hash);
            if (!match) return res.status(400).json({ error: '原密码错误' });

            const hashed = await bcrypt.hash(newPassword, 10);
            db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashed, req.user.id], function(updateErr) {
                if (updateErr) return res.status(500).json({ error: '更新密码失败' });
                res.json({ message: '密码修改成功，请重新登录' });
            });
        } catch (e) {
            res.status(500).json({ error: '服务器内部错误' });
        }
    });
});

// --- RECORDS APIs ---

// Get User Records
app.get('/api/records', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM records WHERE user_id = ? ORDER BY created_at DESC`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: '查询失败' });
        res.json(rows);
    });
});

// Add Record
app.post('/api/records', authenticateToken, (req, res) => {
    const { item_name, price, purchase_date, parent_id } = req.body;
    
    if (price == null || !purchase_date) return res.status(400).json({ error: '花费金额和购买日期必填' });

    db.run(
        `INSERT INTO records (user_id, item_name, price, purchase_date, parent_id) VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, item_name, price, purchase_date, parent_id || null],
        function(err) {
            if (err) return res.status(500).json({ error: '保存失败' });
            res.json({ id: this.lastID, message: '记录已保存' });
        }
    );
});

// Delete Record
app.delete('/api/records/:id', authenticateToken, (req, res) => {
    const recordId = req.params.id;
    
    db.get(`SELECT COUNT(*) as count FROM records WHERE parent_id = ?`, [recordId], (err, row) => {
        if (err) return res.status(500).json({ error: '服务器错误' });
        if (row.count > 0) return res.status(400).json({ error: `无法删除：该物品下还包含 ${row.count} 个子零件，请先删除子零件或将它们解绑！` });

        // Check if the record belongs to the user
        db.run(`DELETE FROM records WHERE id = ? AND user_id = ?`, [recordId, req.user.id], function(deleteErr) {
            if (deleteErr) return res.status(500).json({ error: '删除失败' });
            if (this.changes === 0) return res.status(404).json({ error: '记录不存在或无权限删除' });
            res.json({ message: '记录已删除' });
        });
    });
});

// Update Record (Full Edit)
app.put('/api/records/:id', authenticateToken, (req, res) => {
    const recordId = req.params.id;
    const { item_name, price, purchase_date, status, end_date, resale_price, parent_id } = req.body;

    if (!item_name || price == null || !purchase_date) {
        return res.status(400).json({ error: '请填写完整的物品名称、金额和买入日期' });
    }

    if (!['active', 'broken', 'sold'].includes(status)) {
        return res.status(400).json({ error: '无效的状态' });
    }

    // Protect against multi-level recursion (cannot assign a parent if the item already has children)
    if (parent_id) {
        db.get(`SELECT COUNT(*) as count FROM records WHERE parent_id = ?`, [recordId], (err, row) => {
            if (row && row.count > 0) return res.status(400).json({ error: '该组合内已包含子零件，无法再将其挂归属到其他物品下（仅支持一级嵌套）！' });
            executeUpdate();
        });
    } else {
        executeUpdate();
    }

    function executeUpdate() {
        db.run(
            `UPDATE records SET item_name = ?, price = ?, purchase_date = ?, status = ?, end_date = ?, resale_price = ?, parent_id = ? WHERE id = ? AND user_id = ?`,
            [item_name, price, purchase_date, status, end_date || null, resale_price || 0, parent_id || null, recordId, req.user.id],
            function(err) {
                if (err) return res.status(500).json({ error: '更新失败' });
                if (this.changes === 0) return res.status(404).json({ error: '记录不存在或无权限' });
                res.json({ message: '记录已更新' });
            }
        );
    }
});

// Import Records (Restore / Append)
app.post('/api/records/import', authenticateToken, (req, res) => {
    const { mode, records } = req.body;
    if (!Array.isArray(records)) {
        return res.status(400).json({ error: '无效的数据格式' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION;');

        if (mode === 'overwrite') {
            db.run('DELETE FROM records WHERE user_id = ?', [req.user.id]);
        }

        const oldToNewMap = {};
        const parents = records.filter(r => !r.parent_id);
        const children = records.filter(r => r.parent_id);

        const insertRecord = (r, newParentId, callback) => {
            const sql = `
                INSERT INTO records (user_id, item_name, price, purchase_date, status, end_date, resale_price, parent_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            db.run(sql, [
                req.user.id,
                r.item_name || '未命名',
                r.price || 0,
                r.purchase_date,
                r.status || 'active',
                r.end_date || null,
                r.resale_price || 0,
                newParentId || null
            ], function(err) {
                if (err) return callback(err);
                callback(null, this.lastID);
            });
        };

        const processParents = (index, done) => {
            if (index >= parents.length) return done();
            const p = parents[index];
            insertRecord(p, null, (err, newId) => {
                if (err) {
                    db.run('ROLLBACK;');
                    return res.status(500).json({ error: '父组件导入失败' });
                }
                oldToNewMap[p.id] = newId;
                processParents(index + 1, done);
            });
        };

        const processChildren = (index, done) => {
            if (index >= children.length) return done();
            const c = children[index];
            const mappedParentId = oldToNewMap[c.parent_id] || null;
            insertRecord(c, mappedParentId, (err, newId) => {
                if (err) {
                    db.run('ROLLBACK;');
                    return res.status(500).json({ error: '子组件导入失败' });
                }
                processChildren(index + 1, done);
            });
        };

        processParents(0, () => {
            processChildren(0, () => {
                db.run('COMMIT;', (err) => {
                    if (err) return res.status(500).json({ error: '提交事务失败' });
                    res.json({ message: '导入成功' });
                });
            });
        });
    });
});

// Catch-all route for sending index.html
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
