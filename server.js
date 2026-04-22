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
        
        // --- PERFORMANCE: Enable WAL Mode ---
        db.run('PRAGMA journal_mode = WAL');

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

            // Safe Migrations
            db.run("ALTER TABLE records ADD COLUMN status TEXT DEFAULT 'active'", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN end_date TEXT", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN resale_price REAL DEFAULT 0", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN parent_id INTEGER DEFAULT NULL", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN is_deleted INTEGER DEFAULT 0", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN deleted_at DATETIME DEFAULT NULL", (err) => { });
            
            // User role migration
            db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", (err) => { });

            // --- PERFORMANCE: Create Indexes ---
            db.run("CREATE INDEX IF NOT EXISTS idx_records_user_list ON records(user_id, is_deleted, created_at)");
            db.run("CREATE INDEX IF NOT EXISTS idx_records_parent ON records(parent_id)");
        });
    }
});

// --- BACKGROUND TASK: Auto-purge Recycle Bin entries older than 30 days ---
setInterval(() => {
    console.log('Running background auto-purge task...');
    db.run(`DELETE FROM records WHERE is_deleted = 1 AND deleted_at < datetime('now', '-30 days')`, (err) => {
        if (err) console.error('Background auto-purge failed', err);
        else console.log('Background auto-purge completed.');
    });
}, 3600000); // Once every hour

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

const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: '权限不足：仅管理员可执行此操作' });
    }
};

// --- AUTH APIs ---

// Register
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Genesis Admin mechanism
        db.get(`SELECT COUNT(*) as count FROM users`, [], (err, row) => {
            if (err) return res.status(500).json({ error: '系统内部状态检查失败' });
            
            const role = row.count === 0 ? 'admin' : 'user';
            
            db.run(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`, [username, hashedPassword, role], function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: '用户名已存在' });
                    }
                    return res.status(500).json({ error: '注册失败' });
                }
                res.json({ message: role === 'admin' ? '注册成功！你已自动成为首位超级管理员' : '注册成功！请登录' });
            });
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
                // Ensure legacy users without a role fall back to 'user' visually
                const userRole = user.role || 'user'; 
                const token = jwt.sign({ id: user.id, username: user.username, role: userRole }, JWT_SECRET, { expiresIn: '7d' });
                res.json({ token, username: user.username, role: userRole });
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
            db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashed, req.user.id], function (updateErr) {
                if (updateErr) return res.status(500).json({ error: '更新密码失败' });
                res.json({ message: '密码修改成功，请重新登录' });
            });
        } catch (e) {
            res.status(500).json({ error: '服务器内部错误' });
        }
    });
});

// --- RECORDS APIs ---

// Get User Records (Active) with Pagination and Sorting
app.get('/api/records', authenticateToken, (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder || 'DESC';
    const searchQuery = req.query.q ? `%${req.query.q}%` : null;
    const statusFilter = req.query.status && req.query.status !== 'all' ? req.query.status : null;

    // Whitelist valid columns for sorting
    let sqlSortExpression = 'created_at';
    if (sortBy === 'price') sqlSortExpression = 'price';
    else if (sortBy === 'item_name') sqlSortExpression = 'item_name';
    else if (sortBy === 'purchase_date') sqlSortExpression = 'purchase_date';
    else if (sortBy === 'dailyCost') {
        sqlSortExpression = `(CASE 
                WHEN status = 'active' OR status IS NULL THEN price / (julianday('now') - julianday(purchase_date) + 1)
                WHEN status = 'broken' THEN price / (julianday(end_date) - julianday(purchase_date) + 1)
                WHEN status = 'sold' THEN (price - resale_price) / (julianday(end_date) - julianday(purchase_date) + 1)
                ELSE 0 
            END)`;
    } else if (sortBy === 'days') {
        sqlSortExpression = `(CASE 
                WHEN status = 'active' OR status IS NULL THEN (julianday('now') - julianday(purchase_date) + 1)
                WHEN status = 'broken' THEN (julianday(end_date) - julianday(purchase_date) + 1)
                WHEN status = 'sold' THEN (julianday(end_date) - julianday(purchase_date) + 1)
                ELSE 0 
            END)`;
    }
    
    const actualSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let sqlCount = `SELECT COUNT(*) as total FROM records WHERE user_id = ? AND is_deleted = 0`;
    let sqlData = `SELECT * FROM records WHERE user_id = ? AND is_deleted = 0`;
    let params = [req.user.id];

    if (searchQuery) {
        sqlCount += ` AND item_name LIKE ?`;
        sqlData += ` AND item_name LIKE ?`;
        params.push(searchQuery);
    }
    
    if (statusFilter) {
        sqlCount += ` AND status = ?`;
        sqlData += ` AND status = ?`;
        params.push(statusFilter);
    }

    sqlData += ` ORDER BY ${sqlSortExpression} ${actualSortOrder} LIMIT ? OFFSET ?`;

    db.get(sqlCount, params, (err, countRow) => {
        if (err) return res.status(500).json({ error: '查询失败' });
        const total = countRow.total;

        const dataParams = [...params, limit, offset];
        db.all(sqlData, dataParams, (err, rows) => {
                if (err) return res.status(500).json({ error: '查询失败' });
                res.json({
                    total,
                    page,
                    limit,
                    hasMore: offset + rows.length < total,
                    data: rows
                });
            }
        );
    });
});

// New API: Get Aggregated Stats (Backend calculation)
app.get('/api/stats', authenticateToken, (req, res) => {
    const userId = req.user.id;

    const sqlStats = `
        SELECT 
            SUM(CASE 
                WHEN status = 'active' OR status IS NULL THEN price / (julianday('now') - julianday(purchase_date) + 1)
                WHEN status = 'broken' THEN price / (julianday(end_date) - julianday(purchase_date) + 1)
                WHEN status = 'sold' THEN (price - resale_price) / (julianday(end_date) - julianday(purchase_date) + 1)
                ELSE 0 
            END) as total_daily_cost,
            SUM(price) as total_price,
            COUNT(*) as total_count
        FROM records 
        WHERE user_id = ? AND is_deleted = 0
    `;

    const sqlStatusCounts = `
        SELECT status, COUNT(*) as count 
        FROM records 
        WHERE user_id = ? AND is_deleted = 0 
        GROUP BY status
    `;

    db.get(sqlStats, [userId], (err, statsRow) => {
        if (err) return res.status(500).json({ error: '统计计算失败' });

        db.all(sqlStatusCounts, [userId], (err, statusRows) => {
            if (err) return res.status(500).json({ error: '状态统计失败' });

            const statusCounts = { active: 0, broken: 0, sold: 0 };
            statusRows.forEach(row => {
                if (row.status) statusCounts[row.status] = row.count;
            });

            res.json({
                total_daily_cost: statsRow.total_daily_cost || 0,
                total_price: statsRow.total_price || 0,
                total_count: statsRow.total_count || 0,
                status_counts: statusCounts
            });
        });
    });
});

// Add Record
app.post('/api/records', authenticateToken, (req, res) => {
    const { item_name, price, purchase_date, parent_id } = req.body;

    if (price == null || !purchase_date) return res.status(400).json({ error: '花费金额和购买日期必填' });

    db.run(
        `INSERT INTO records (user_id, item_name, price, purchase_date, parent_id) VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, item_name, price, purchase_date, parent_id || null],
        function (err) {
            if (err) return res.status(500).json({ error: '保存失败' });
            res.json({ id: this.lastID, message: '记录已保存' });
        }
    );
});

// Delete Record (Soft Delete)
app.delete('/api/records/:id', authenticateToken, (req, res) => {
    const recordId = req.params.id;

    db.get(`SELECT COUNT(*) as count FROM records WHERE parent_id = ? AND is_deleted = 0`, [recordId], (err, row) => {
        if (err) return res.status(500).json({ error: '服务器错误' });
        if (row.count > 0) return res.status(400).json({ error: `无法删除：该物品下还包含 ${row.count} 个子零件，请先删除子零件或将它们解绑！` });

        db.run(`UPDATE records SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, [recordId, req.user.id], function (err) {
            if (err) return res.status(500).json({ error: '移入废纸篓失败' });
            if (this.changes === 0) return res.status(404).json({ error: '记录不存在或无权限操作' });
            res.json({ message: '记录已移动到废纸篓，可在30天内找回' });
        });
    });
});

// Get Trash Records (Deleted)
app.get('/api/records/trash', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM records WHERE user_id = ? AND is_deleted = 1 ORDER BY deleted_at DESC`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: '查询废纸篓失败' });
        res.json(rows);
    });
});

// Restore Record
app.post('/api/records/restore/:id', authenticateToken, (req, res) => {
    const id = req.params.id;
    console.log(`Attempting to restore record ${id} for user ${req.user.id}`);
    db.run(`UPDATE records SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND user_id = ?`, [id, req.user.id], function (err) {
        if (err) {
            console.error('Restore error:', err);
            return res.status(500).json({ error: '服务器内部错误：还原失败' });
        }
        if (this.changes === 0) {
            console.warn(`Restore failed: No changes for record ${id}`);
            return res.status(404).json({ error: '无法还原：该条记录可能已被永久清理或不存在' });
        }
        res.json({ message: '记录已从废纸篓恢复' });
    });
});

// Permanent Purge Record
app.delete('/api/records/purge/:id', authenticateToken, (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM records WHERE id = ? AND user_id = ? AND is_deleted = 1`, [id, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: '销毁失败' });
        if (this.changes === 0) return res.status(404).json({ error: '记录不存在' });
        res.json({ message: '记录已永久销毁' });
    });
});

// New API: Get Trend Data (Backend calculation)
app.get('/api/stats/trend', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const range = req.query.range || '30d';

    db.all(`SELECT * FROM records WHERE user_id = ? AND is_deleted = 0`, [userId], (err, records) => {
        if (err) return res.status(500).json({ error: '获取趋势数据失败' });

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let points = [];
        let labels = [];
        let count = 0;
        let stepDays = 1;

        if (range === '7d') {
            count = 7;
            stepDays = 1;
        } else if (range === '30d') {
            count = 10;
            stepDays = 3;
        } else if (range === '1y') {
            count = 12;
            stepDays = 30;
        } else {
            count = 10;
            stepDays = 3;
        }

        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(now.getTime());
            d.setDate(d.getDate() - i * stepDays);
            
            const dateStr = (range === '1y') ? 
                `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}` : 
                `${(d.getMonth() + 1)}/${d.getDate()}`;
            labels.push(dateStr);

            let daySum = 0;
            records.forEach(record => {
                daySum += simulateCostAtDate(record, d);
            });
            points.push(daySum.toFixed(2));
        }

        res.json({ labels, data: points });
    });

    function simulateCostAtDate(record, targetDate) {
        const purchaseDate = new Date(record.purchase_date);
        purchaseDate.setHours(0, 0, 0, 0);
        
        if (targetDate < purchaseDate) return 0;

        let endDate = new Date(targetDate.getTime());
        const status = record.status || 'active';
        let finalCost = record.price;

        if (status !== 'active' && record.end_date) {
            const itemEndDate = new Date(record.end_date);
            itemEndDate.setHours(0, 0, 0, 0);

            if (targetDate >= itemEndDate) {
                endDate = itemEndDate;
                if (status === 'sold') {
                    finalCost = Math.max(0, record.price - (record.resale_price || 0));
                }
            }
        }

        const timeDiff = Math.max(0, endDate.getTime() - purchaseDate.getTime());
        let daysUsed = Math.floor(timeDiff / (1000 * 3600 * 24));
        const actualDaysForCalc = daysUsed + 1;

        return finalCost / actualDaysForCalc;
    }
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
            function (err) {
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
            ], function (err) {
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



// --- ADMIN APIs ---

// Get Macro Users List
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    const query = `
        SELECT 
            u.id, 
            u.username, 
            u.role, 
            u.created_at,
            COUNT(r.id) as total_items,
            SUM(CASE WHEN r.is_deleted = 0 THEN r.price ELSE 0 END) as total_spent
        FROM users u
        LEFT JOIN records r ON u.id = r.user_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: '无法获取全局用户画像' });
        res.json({ data: rows });
    });
});

// Purge User Data (Death Sentence)
app.delete('/api/admin/user/:id', authenticateToken, requireAdmin, (req, res) => {
    const targetUserId = req.params.id;
    
    // Prevent suicide
    if (parseInt(targetUserId) === parseInt(req.user.id)) {
        return res.status(400).json({ error: '操作驳回：你不能处决你自己' });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("DELETE FROM records WHERE user_id = ?", [targetUserId], (err) => {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: '清理用户账单数据失败' });
            }
            db.run("DELETE FROM users WHERE id = ?", [targetUserId], function(err) {
                if (err || this.changes === 0) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: '铲除目标用户主体失败或用户不存在' });
                }
                db.run("COMMIT");
                res.json({ message: '处决成功，关联记录已全线销毁。' });
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
    console.log(`Server running on port ${PORT}`);
});
