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

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'daycost_dev_secret_key_999') {
    throw new Error('JWT_SECRET must be set in production.');
}

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
            // Tags migration
            db.run("ALTER TABLE records ADD COLUMN tags TEXT DEFAULT ''", (err) => { });
            // Depreciation migration
            db.run("ALTER TABLE records ADD COLUMN depreciation_method TEXT DEFAULT 'straight_line'", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN expected_lifespan INTEGER DEFAULT 1095", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN expected_salvage REAL DEFAULT 0", (err) => { });

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

// Centralized Tree-Aware Filtering Engine
function getFilteredTreeRecords(userId, queryParams, db) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM records WHERE user_id = ? AND is_deleted = 0`, [userId], (err, rows) => {
            if (err) return reject(err);

            const { q, status, statsType, statsValue } = queryParams;
            const searchQuery = q ? q.toLowerCase() : null;
            const statusFilter = status && status !== 'all' ? status : null;

            // 1. Calculate individual costs
            const processedRecords = rows.map(record => {
                const purchaseDate = new Date(record.purchase_date);
                purchaseDate.setHours(0, 0, 0, 0);

                let endDate = new Date();
                const recordStatus = record.status || 'active';

                if (recordStatus !== 'active' && record.end_date) {
                    endDate = new Date(record.end_date);
                }
                endDate.setHours(0, 0, 0, 0);

                const timeDiff = Math.max(0, endDate.getTime() - purchaseDate.getTime());
                let daysUsed = Math.floor(timeDiff / (1000 * 3600 * 24));
                const actualDaysForCalc = daysUsed + 1;

                let finalCost = record.price;
                if (recordStatus === 'sold') {
                    finalCost = Math.max(0, record.price - (record.resale_price || 0));
                }

                let currentValue = record.price;
                if (recordStatus === 'sold') {
                    currentValue = record.resale_price || 0;
                } else if (recordStatus === 'broken') {
                    currentValue = 0;
                } else {
                    const depMethod = record.depreciation_method || 'straight_line';
                    const lifespan = record.expected_lifespan || 1095;
                    const salvage = record.expected_salvage || 0;
                    
                    if (depMethod === 'straight_line') {
                        const dailyDep = (record.price - salvage) / lifespan;
                        currentValue = Math.max(salvage, record.price - (dailyDep * actualDaysForCalc));
                    } else if (depMethod === 'double_declining') {
                        const dailyRate = 2 / lifespan;
                        currentValue = record.price * Math.pow(1 - dailyRate, actualDaysForCalc);
                        currentValue = Math.max(salvage, currentValue);
                    }
                }

                return {
                    ...record,
                    _dailyCost: finalCost / actualDaysForCalc,
                    _days: actualDaysForCalc,
                    _finalCost: finalCost,
                    _currentValue: currentValue
                };
            });

            // 2. Build tree and aggregate
            const topLevelMap = {};
            const childrenMap = {};

            processedRecords.forEach(r => {
                if (r.parent_id) {
                    if (!childrenMap[r.parent_id]) childrenMap[r.parent_id] = [];
                    childrenMap[r.parent_id].push(r);
                } else {
                    r._aggDailyCost = r._dailyCost;
                    r._aggFinalCost = r._finalCost;
                    r._aggPrice = r.price;
                    r._aggCurrentValue = r._currentValue;
                    r._aggDays = r._days;
                    topLevelMap[r.id] = r;
                }
            });

            // Handle orphans (children whose parent is deleted)
            processedRecords.forEach(r => {
                if (r.parent_id && !topLevelMap[r.parent_id]) {
                    r._aggDailyCost = r._dailyCost;
                    r._aggFinalCost = r._finalCost;
                    r._aggPrice = r.price;
                    r._aggCurrentValue = r._currentValue;
                    r._aggDays = r._days;
                    topLevelMap[r.id] = r; // Promote to top-level
                }
            });

            // Aggregate children into parents
            Object.values(topLevelMap).forEach(parent => {
                const children = childrenMap[parent.id] || [];
                children.forEach(child => {
                    parent._aggDailyCost += child._dailyCost;
                    parent._aggFinalCost += child._finalCost;
                    parent._aggPrice += child.price;
                    parent._aggCurrentValue += child._currentValue;
                    if (child._days > parent._aggDays) parent._aggDays = child._days;
                });
            });

            // 3. Filter (Tree-Aware: keep parent if it OR ANY child matches)
            const matchesStatsFilter = (member, parent) => {
                if (!statsType || !statsValue) return true;

                if (statsType === 'status') {
                    return (member.status || 'active') === statsValue;
                }

                if (statsType === 'tag') {
                    const tags = (member.tags || '')
                        .split(/[,，\s]+/)
                        .map(t => t.trim().replace(/^#/, '').toLowerCase())
                        .filter(Boolean);
                    return tags.includes(String(statsValue).toLowerCase().replace(/^#/, ''));
                }

                if (statsType === 'group') {
                    return String(parent.id) === String(statsValue) || String(member.parent_id || '') === String(statsValue);
                }

                if (statsType === 'month') {
                    return typeof member.purchase_date === 'string' && member.purchase_date.startsWith(statsValue);
                }

                return true;
            };

            let matchedTopLevelIds = new Set();
            Object.values(topLevelMap).forEach(parent => {
                const family = [parent, ...(childrenMap[parent.id] || [])];
                let matches = false;
                for (const member of family) {
                    let matchSearch = !searchQuery || member.item_name.toLowerCase().includes(searchQuery) || (member.tags && member.tags.toLowerCase().includes(searchQuery));
                    let matchStatus = !statusFilter || member.status === statusFilter;
                    let matchStats = matchesStatsFilter(member, parent);
                    if (matchSearch && matchStatus && matchStats) {
                        matches = true;
                        break;
                    }
                }
                if (matches) matchedTopLevelIds.add(parent.id);
            });

            const filteredTopLevel = Object.values(topLevelMap).filter(p => matchedTopLevelIds.has(p.id));
            
            // Generate all matching flat records for charts/stats
            const allMatchedRecords = [];
            filteredTopLevel.forEach(parent => {
                allMatchedRecords.push(parent);
                if (childrenMap[parent.id]) {
                    allMatchedRecords.push(...childrenMap[parent.id]);
                }
            });

            resolve({ filteredTopLevel, childrenMap, allMatchedRecords });
        });
    });
}

// Get User Records (Active) with Pagination and Sorting
app.get('/api/records', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const sortBy = req.query.sortBy || 'created_at';
        const sortOrder = (req.query.sortOrder || 'DESC').toUpperCase();

        const { filteredTopLevel, childrenMap } = await getFilteredTreeRecords(req.user.id, req.query, db);

        // 4. Sort Top-Level
        filteredTopLevel.sort((a, b) => {
            let valA, valB;
            if (sortBy === 'price') { valA = a._aggPrice; valB = b._aggPrice; }
            else if (sortBy === 'dailyCost') { valA = a._aggDailyCost; valB = b._aggDailyCost; }
            else if (sortBy === 'days') { valA = a._aggDays; valB = b._aggDays; }
            else if (sortBy === 'item_name') { valA = a.item_name; valB = b.item_name; }
            else { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }

            if (valA < valB) return sortOrder === 'ASC' ? -1 : 1;
            if (valA > valB) return sortOrder === 'ASC' ? 1 : -1;
            return 0;
        });

        // 5. Paginate Top-Level
        const paginatedTopLevel = filteredTopLevel.slice(offset, offset + limit);

        // 6. Assemble Final Data (Parents + Their Children)
        const finalData = [];
        paginatedTopLevel.forEach(parent => {
            finalData.push(parent);
            const children = childrenMap[parent.id] || [];
            
            // Sort children too
            children.sort((a, b) => {
                let valA, valB;
                if (sortBy === 'price') { valA = a.price; valB = b.price; }
                else if (sortBy === 'dailyCost') { valA = a._dailyCost; valB = b._dailyCost; }
                else if (sortBy === 'days') { valA = a._days; valB = b._days; }
                else if (sortBy === 'item_name') { valA = a.item_name; valB = b.item_name; }
                else { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }
                if (valA < valB) return sortOrder === 'ASC' ? -1 : 1;
                if (valA > valB) return sortOrder === 'ASC' ? 1 : -1;
                return 0;
            });
            
            finalData.push(...children);
        });

        res.json({
            total: filteredTopLevel.length, // Total is now number of top-level families!
            page,
            limit,
            hasMore: offset + paginatedTopLevel.length < filteredTopLevel.length,
            data: finalData
        });
    } catch (err) {
        console.error("API Records Error:", err);
        res.status(500).json({ error: '查询失败' });
    }
});

// New API: Get Aggregated Stats (Backend calculation)
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const { filteredTopLevel, allMatchedRecords } = await getFilteredTreeRecords(req.user.id, req.query, db);

        let total_daily_cost = 0;
        let total_price = 0;
        
        filteredTopLevel.forEach(p => {
            total_daily_cost += p._aggDailyCost;
            total_price += p._aggPrice;
        });

        const statusCounts = { active: 0, broken: 0, sold: 0 };
        const tagStats = {};

        allMatchedRecords.forEach(row => {
            const status = row.status || 'active';
            statusCounts[status] = (statusCounts[status] || 0) + 1;

            if (row.tags) {
                const tagsArr = row.tags.split(/[,，\s]+/).map(t => t.trim()).filter(t => t);
                tagsArr.forEach(t => {
                    const cleanTag = t.startsWith('#') ? t.substring(1) : t;
                    if (!cleanTag) return;
                    if (!tagStats[cleanTag]) {
                        tagStats[cleanTag] = { total_price: 0, daily_cost: 0 };
                    }
                    tagStats[cleanTag].total_price += row.price;
                    tagStats[cleanTag].daily_cost += row._dailyCost;
                });
            }
        });

        res.json({
            total_daily_cost,
            total_price,
            total_count: allMatchedRecords.length,
            status_counts: statusCounts,
            tag_stats: tagStats
        });
    } catch (err) {
        console.error("API Stats Error:", err);
        res.status(500).json({ error: '统计计算失败' });
    }
});

// Legacy duplicate /api/records POST. Disabled so the complete implementation below handles all fields.
/*
// Add Record
app.post('/api/records', authenticateToken, (req, res) => {
    const { item_name, price, purchase_date, parent_id, tags } = req.body;

    if (price == null || !purchase_date) return res.status(400).json({ error: '花费金额和购买日期必填' });

    db.run(
        `INSERT INTO records (user_id, item_name, price, purchase_date, parent_id, tags) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, item_name, price, purchase_date, parent_id || null, tags || ''],
        function (err) {
            if (err) return res.status(500).json({ error: '保存失败' });
            res.json({ id: this.lastID, message: '记录已保存' });
        }
    );
});

*/

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
app.get('/api/stats/trend', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const range = req.query.range || '30d';

        const { allMatchedRecords } = await getFilteredTreeRecords(userId, req.query, db);

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
            allMatchedRecords.forEach(record => {
                daySum += simulateCostAtDate(record, d);
            });
            points.push(daySum.toFixed(2));
        }

        res.json({ labels, data: points });
    } catch (err) {
        console.error("API Trend Error:", err);
        res.status(500).json({ error: '获取趋势数据失败' });
    }

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

// New API: Get Pie Chart Data (Backend extraction)
app.get('/api/stats/pie', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const parentId = req.query.parent_id || null;

        const { filteredTopLevel, childrenMap } = await getFilteredTreeRecords(userId, req.query, db);

        let dataToShow = [];

        if (!parentId) {
            dataToShow = filteredTopLevel;
        } else {
            const pid = parseInt(parentId);
            const children = childrenMap[pid] || [];
            dataToShow = children.map(c => ({ ...c, _aggDailyCost: c._dailyCost }));
        }

        const sortedForChart = dataToShow.sort((a, b) => b._aggDailyCost - a._aggDailyCost);

        let labels = [];
        let data = [];
        let originalIds = [];
        let hasChildrenArray = [];
        let otherCost = 0;

        sortedForChart.forEach((item, index) => {
            if (item._aggDailyCost <= 0) return;

            if (index < 5) {
                labels.push(item.item_name);
                data.push(item._aggDailyCost.toFixed(2));
                originalIds.push(item.id);
                // Check if it has children in childrenMap
                hasChildrenArray.push(!!childrenMap[item.id] && childrenMap[item.id].length > 0);
            } else {
                otherCost += item._aggDailyCost;
            }
        });

        if (otherCost > 0) {
            labels.push('其他项并集');
            data.push(otherCost.toFixed(2));
            originalIds.push(null);
            hasChildrenArray.push(false);
        }

        let parentName = null;
        if (parentId) {
            db.get(`SELECT item_name FROM records WHERE id = ?`, [parentId], (err, row) => {
                if (row) parentName = row.item_name;
                res.json({ labels, data, originalIds, hasChildrenArray, parentName });
            });
        } else {
            res.json({ labels, data, originalIds, hasChildrenArray, parentName: null });
        }
    } catch (err) {
        console.error("API Pie Error:", err);
        res.status(500).json({ error: '获取图表数据失败' });
    }
});

/*
app.post('/api/records', authenticateToken, (req, res) => {
    const { item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage } = req.body;

    if (!item_name || price == null || !purchase_date) {
        return res.status(400).json({ error: '请填写完整的物品名称、金额和买入日期' });
    }

    if (parent_id) {
        db.get(`SELECT COUNT(*) as count FROM records WHERE id = ?`, [parent_id], (err, row) => {
            if (!row || row.count === 0) return res.status(400).json({ error: '指定的组合本体不存在' });
            executeInsert();
        });
    } else {
        executeInsert();
    }

    function executeInsert() {
        db.run(
            `INSERT INTO records (user_id, item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, item_name, price, purchase_date, status || 'active', end_date || null, resale_price || 0, parent_id || null, tags || '', depreciation_method || 'straight_line', expected_lifespan || 1095, expected_salvage || 0],
            function (err) {
                if (err) return res.status(500).json({ error: '添加失败' });
                res.json({ message: '添加成功', id: this.lastID });
            }
        );
    }
});

*/

app.post('/api/records', authenticateToken, (req, res) => {
    const { item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage } = req.body;
    const normalizedStatus = status || 'active';
    const normalizedPrice = Number(price);
    const normalizedResale = Number(resale_price || 0);
    const normalizedLifespan = Number(expected_lifespan || 1095);
    const normalizedSalvage = Number(expected_salvage || 0);

    if (!item_name || price == null || !purchase_date) {
        return res.status(400).json({ error: 'Please provide item name, price and purchase date.' });
    }
    if (!['active', 'broken', 'sold'].includes(normalizedStatus)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }
    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
        return res.status(400).json({ error: 'Price must be a non-negative number.' });
    }
    if (!Number.isFinite(normalizedResale) || normalizedResale < 0 || normalizedResale > normalizedPrice) {
        return res.status(400).json({ error: 'Resale price must be between 0 and item price.' });
    }
    if (!Number.isFinite(normalizedLifespan) || normalizedLifespan < 1) {
        return res.status(400).json({ error: 'Expected lifespan must be at least 1 day.' });
    }
    if (!Number.isFinite(normalizedSalvage) || normalizedSalvage < 0 || normalizedSalvage > normalizedPrice) {
        return res.status(400).json({ error: 'Expected salvage must be between 0 and item price.' });
    }
    if ((normalizedStatus === 'broken' || normalizedStatus === 'sold') && !end_date) {
        return res.status(400).json({ error: 'End date is required for broken or sold records.' });
    }
    if (end_date && new Date(end_date) < new Date(purchase_date)) {
        return res.status(400).json({ error: 'End date cannot be earlier than purchase date.' });
    }

    const executeInsert = () => {
        db.run(
            `INSERT INTO records (user_id, item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, item_name, normalizedPrice, purchase_date, normalizedStatus, end_date || null, normalizedResale, parent_id || null, tags || '', depreciation_method || 'straight_line', normalizedLifespan, normalizedSalvage],
            function (err) {
                if (err) return res.status(500).json({ error: 'Failed to add record.' });
                res.json({ message: 'Record added.', id: this.lastID });
            }
        );
    };

    if (!parent_id) return executeInsert();

    db.get(`SELECT id, parent_id FROM records WHERE id = ? AND user_id = ? AND is_deleted = 0`, [parent_id, req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Failed to validate parent record.' });
        if (!row) return res.status(400).json({ error: 'Parent record does not exist.' });
        if (row.parent_id) return res.status(400).json({ error: 'Only one nested level is supported.' });
        executeInsert();
    });
});

/*
// Update Record (Full Edit)
app.put('/api/records/:id', authenticateToken, (req, res) => {
    const recordId = req.params.id;
    const { item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage, cascadeAction } = req.body;

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
        db.serialize(() => {
            db.run('BEGIN TRANSACTION;');
            db.run(
                `UPDATE records SET item_name = ?, price = ?, purchase_date = ?, status = ?, end_date = ?, resale_price = ?, parent_id = ?, tags = ?, depreciation_method = ?, expected_lifespan = ?, expected_salvage = ? WHERE id = ? AND user_id = ?`,
                [item_name, price, purchase_date, status, end_date || null, resale_price || 0, parent_id || null, tags || '', depreciation_method || 'straight_line', expected_lifespan || 1095, expected_salvage || 0, recordId, req.user.id]
            );

            if (cascadeAction === 'bundle') {
                db.run(
                    `UPDATE records SET status = ?, end_date = ?, resale_price = 0 WHERE parent_id = ? AND user_id = ?`,
                    [status, end_date || null, recordId, req.user.id]
                );
            } else if (cascadeAction === 'orphan') {
                db.run(
                    `UPDATE records SET parent_id = NULL WHERE parent_id = ? AND user_id = ?`,
                    [recordId, req.user.id]
                );
            }

            db.run('COMMIT;', function(err) {
                if (err) {
                    db.run('ROLLBACK;');
                    return res.status(500).json({ error: '更新失败' });
                }
                res.json({ message: '记录已更新' });
            });
        });
    }
});

*/

// Update Record (Full Edit)
app.put('/api/records/:id', authenticateToken, (req, res) => {
    const recordId = Number(req.params.id);
    const { item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage, cascadeAction } = req.body;
    const normalizedPrice = Number(price);
    const normalizedResale = Number(resale_price || 0);
    const normalizedLifespan = Number(expected_lifespan || 1095);
    const normalizedSalvage = Number(expected_salvage || 0);
    const normalizedParentId = parent_id ? Number(parent_id) : null;

    if (!item_name || price == null || !purchase_date) {
        return res.status(400).json({ error: 'Please provide item name, price and purchase date.' });
    }
    if (!['active', 'broken', 'sold'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }
    if (!Number.isFinite(recordId) || recordId < 1) {
        return res.status(400).json({ error: 'Invalid record id.' });
    }
    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
        return res.status(400).json({ error: 'Price must be a non-negative number.' });
    }
    if (!Number.isFinite(normalizedResale) || normalizedResale < 0 || normalizedResale > normalizedPrice) {
        return res.status(400).json({ error: 'Resale price must be between 0 and item price.' });
    }
    if (!Number.isFinite(normalizedLifespan) || normalizedLifespan < 1) {
        return res.status(400).json({ error: 'Expected lifespan must be at least 1 day.' });
    }
    if (!Number.isFinite(normalizedSalvage) || normalizedSalvage < 0 || normalizedSalvage > normalizedPrice) {
        return res.status(400).json({ error: 'Expected salvage must be between 0 and item price.' });
    }
    if ((status === 'broken' || status === 'sold') && !end_date) {
        return res.status(400).json({ error: 'End date is required for broken or sold records.' });
    }
    if (end_date && new Date(end_date) < new Date(purchase_date)) {
        return res.status(400).json({ error: 'End date cannot be earlier than purchase date.' });
    }
    if (normalizedParentId === recordId) {
        return res.status(400).json({ error: 'A record cannot be its own parent.' });
    }

    const executeUpdate = () => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION;');
            db.run(
                `UPDATE records SET item_name = ?, price = ?, purchase_date = ?, status = ?, end_date = ?, resale_price = ?, parent_id = ?, tags = ?, depreciation_method = ?, expected_lifespan = ?, expected_salvage = ? WHERE id = ? AND user_id = ?`,
                [item_name, normalizedPrice, purchase_date, status, end_date || null, normalizedResale, normalizedParentId, tags || '', depreciation_method || 'straight_line', normalizedLifespan, normalizedSalvage, recordId, req.user.id],
                function (err) {
                    if (err) {
                        db.run('ROLLBACK;');
                        return res.status(500).json({ error: 'Failed to update record.' });
                    }
                    if (this.changes === 0) {
                        db.run('ROLLBACK;');
                        return res.status(404).json({ error: 'Record not found.' });
                    }

                    const finish = () => {
                        db.run('COMMIT;', (commitErr) => {
                            if (commitErr) {
                                db.run('ROLLBACK;');
                                return res.status(500).json({ error: 'Failed to commit record update.' });
                            }
                            res.json({ message: 'Record updated.' });
                        });
                    };

                    if (cascadeAction === 'bundle') {
                        db.run(
                            `UPDATE records SET status = ?, end_date = ?, resale_price = 0 WHERE parent_id = ? AND user_id = ?`,
                            [status, end_date || null, recordId, req.user.id],
                            (cascadeErr) => {
                                if (cascadeErr) {
                                    db.run('ROLLBACK;');
                                    return res.status(500).json({ error: 'Failed to update child records.' });
                                }
                                finish();
                            }
                        );
                    } else if (cascadeAction === 'orphan') {
                        db.run(
                            `UPDATE records SET parent_id = NULL WHERE parent_id = ? AND user_id = ?`,
                            [recordId, req.user.id],
                            (orphanErr) => {
                                if (orphanErr) {
                                    db.run('ROLLBACK;');
                                    return res.status(500).json({ error: 'Failed to detach child records.' });
                                }
                                finish();
                            }
                        );
                    } else {
                        finish();
                    }
                }
            );
        });
    };

    if (!normalizedParentId) return executeUpdate();

    db.get(`SELECT COUNT(*) as count FROM records WHERE parent_id = ? AND user_id = ? AND is_deleted = 0`, [recordId, req.user.id], (childErr, childRow) => {
        if (childErr) return res.status(500).json({ error: 'Failed to validate child records.' });
        if (childRow && childRow.count > 0) {
            return res.status(400).json({ error: 'A record with children cannot be nested under another record.' });
        }

        db.get(`SELECT id, parent_id FROM records WHERE id = ? AND user_id = ? AND is_deleted = 0`, [normalizedParentId, req.user.id], (parentErr, parentRow) => {
            if (parentErr) return res.status(500).json({ error: 'Failed to validate parent record.' });
            if (!parentRow) return res.status(400).json({ error: 'Parent record does not exist.' });
            if (parentRow.parent_id) return res.status(400).json({ error: 'Only one nested level is supported.' });
            executeUpdate();
        });
    });
});

/*
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



*/

// Import Records (Restore / Append)
app.post('/api/records/import', authenticateToken, (req, res) => {
    const { mode, records } = req.body;
    if (!['append', 'overwrite'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid import mode.' });
    }
    if (!Array.isArray(records)) {
        return res.status(400).json({ error: 'Invalid import records.' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION;');

        const rollback = (message) => {
            db.run('ROLLBACK;');
            return res.status(500).json({ error: message });
        };

        const startImport = () => {
            const oldToNewMap = {};
            const parents = records.filter(r => !r.parent_id);
            const children = records.filter(r => r.parent_id);

            const insertRecord = (r, newParentId, callback) => {
                const normalizedStatus = ['active', 'broken', 'sold'].includes(r.status) ? r.status : 'active';
                const normalizedPrice = Number(r.price || 0);
                const normalizedResale = Number(r.resale_price || 0);
                const normalizedLifespan = Number(r.expected_lifespan || 1095);
                const normalizedSalvage = Number(r.expected_salvage || 0);

                if (!r.purchase_date) return callback(new Error('Record is missing purchase_date.'));
                if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) return callback(new Error('Invalid price.'));
                if (!Number.isFinite(normalizedResale) || normalizedResale < 0 || normalizedResale > normalizedPrice) return callback(new Error('Invalid resale price.'));
                if (!Number.isFinite(normalizedLifespan) || normalizedLifespan < 1) return callback(new Error('Invalid lifespan.'));
                if (!Number.isFinite(normalizedSalvage) || normalizedSalvage < 0 || normalizedSalvage > normalizedPrice) return callback(new Error('Invalid salvage value.'));

                const sql = `
                    INSERT INTO records (user_id, item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                db.run(sql, [
                    req.user.id,
                    r.item_name || 'Untitled',
                    normalizedPrice,
                    r.purchase_date,
                    normalizedStatus,
                    r.end_date || null,
                    normalizedResale,
                    newParentId || null,
                    r.tags || '',
                    r.depreciation_method || 'straight_line',
                    normalizedLifespan,
                    normalizedSalvage
                ], function (err) {
                    if (err) return callback(err);
                    callback(null, this.lastID);
                });
            };

            const processParents = (index, done) => {
                if (index >= parents.length) return done();
                const parent = parents[index];
                insertRecord(parent, null, (err, newId) => {
                    if (err) return rollback('Failed to import parent records.');
                    oldToNewMap[parent.id] = newId;
                    processParents(index + 1, done);
                });
            };

            const processChildren = (index, done) => {
                if (index >= children.length) return done();
                const child = children[index];
                const mappedParentId = oldToNewMap[child.parent_id] || null;
                insertRecord(child, mappedParentId, (err) => {
                    if (err) return rollback('Failed to import child records.');
                    processChildren(index + 1, done);
                });
            };

            processParents(0, () => {
                processChildren(0, () => {
                    db.run('COMMIT;', (err) => {
                        if (err) return rollback('Failed to commit import.');
                        res.json({ message: 'Import completed.' });
                    });
                });
            });
        };

        if (mode === 'overwrite') {
            db.run('DELETE FROM records WHERE user_id = ?', [req.user.id], (deleteErr) => {
                if (deleteErr) return rollback('Failed to clear existing records.');
                startImport();
            });
        } else {
            startImport();
        }
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
