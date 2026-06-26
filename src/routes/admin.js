const express = require('express');
const crypto = require('crypto');
const { promisify } = require('util');
const db = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const { log, getClientIp } = require('../utils/auditLog');

const router = express.Router();

// Promisified db helpers for async/await usage
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

// Get Users List (enhanced with is_disabled)
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
    const query = `
        SELECT
            u.id,
            u.username,
            u.role,
            u.is_disabled,
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

// System Overview — refactored to async/await (S1)
router.get('/overview', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const totalUsersRow = await dbGet('SELECT COUNT(*) as total FROM users');
        const totalRecordsRow = await dbGet('SELECT COUNT(*) as total FROM records WHERE is_deleted = 0');
        const activeUsersRow = await dbGet('SELECT COUNT(*) as active FROM users WHERE is_disabled = 0');

        // User registration trend (last 30 days)
        const trend = await dbAll(`
            SELECT date(created_at) as date, COUNT(*) as count
            FROM users
            WHERE created_at >= datetime('now', '-30 days')
            GROUP BY date(created_at)
            ORDER BY date ASC
        `);

        const pkg = require('../../package.json');
        const fs = require('fs');
        const dbPath = require('../config/env').DB_PATH;
        let dbSize = 'unknown';
        try {
            const stat = fs.statSync(dbPath);
            dbSize = (stat.size / (1024 * 1024)).toFixed(2) + ' MB';
        } catch (_) { /* ignore if file not accessible */ }

        res.json({
            stats: {
                totalUsers: totalUsersRow.total,
                activeUsers: activeUsersRow.active,
                totalRecords: totalRecordsRow.total
            },
            trend: trend || [],
            system: {
                nodeVersion: process.version,
                dbSize,
                version: pkg.version || '1.0.0',
                env: process.env.NODE_ENV || 'development',
                uptime: Math.floor(process.uptime() / 86400) + ' 天'
            }
        });
    } catch (err) {
        console.error('Admin overview error:', err);
        res.status(500).json({ error: '查询失败' });
    }
});

// Get Audit Logs
router.get('/logs', authenticateToken, requireAdmin, (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;
    const action = req.query.action || '';
    const user = req.query.user || '';

    let where = 'WHERE 1=1';
    const params = [];
    if (action) { where += ' AND action = ?'; params.push(action); }
    if (user) { where += ' AND username LIKE ?'; params.push(`%${user}%`); }

    db.get(`SELECT COUNT(*) as total FROM audit_logs ${where}`, params, (err, countRow) => {
        if (err) return res.status(500).json({ error: '查询日志失败' });
        const total = countRow.total;
        const pages = Math.ceil(total / limit);

        db.all(
            `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset],
            (err2, rows) => {
                if (err2) return res.status(500).json({ error: '查询日志失败' });
                res.json({ data: rows, total, page, pages });
            }
        );
    });
});

// Toggle User Role
router.put('/user/:id/role', authenticateToken, requireAdmin, (req, res) => {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === parseInt(req.user.id, 10)) {
        return res.status(400).json({ error: '不能修改自己的角色' });
    }

    db.get(`SELECT role FROM users WHERE id = ?`, [targetId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: '用户不存在' });
        const newRole = user.role === 'admin' ? 'user' : 'admin';
        db.run(`UPDATE users SET role = ? WHERE id = ?`, [newRole, targetId], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: '更新角色失败' });
            log(req.user.id, req.user.username, 'admin_role_change', `${user.role} → ${newRole}, 用户ID: ${targetId}`, getClientIp(req));
            res.json({ message: `角色已更新为 ${newRole === 'admin' ? '管理员' : '普通用户'}`, role: newRole });
        });
    });
});

// Toggle User Disable/Enable
router.put('/user/:id/disable', authenticateToken, requireAdmin, (req, res) => {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === parseInt(req.user.id, 10)) {
        return res.status(400).json({ error: '不能禁用自己的账号' });
    }

    db.get(`SELECT is_disabled, username FROM users WHERE id = ?`, [targetId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: '用户不存在' });
        const newState = user.is_disabled ? 0 : 1;
        db.run(`UPDATE users SET is_disabled = ? WHERE id = ?`, [newState, targetId], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: '操作失败' });
            const action = newState ? 'admin_disable' : 'admin_enable';
            log(req.user.id, req.user.username, action, `用户: ${user.username}`, getClientIp(req));
            res.json({ message: newState ? '账号已禁用' : '账号已启用', is_disabled: newState });
        });
    });
});

// Reset User Password
router.post('/user/:id/reset-password', authenticateToken, requireAdmin, (req, res) => {
    const targetId = parseInt(req.params.id, 10);
    const bcrypt = require('bcrypt');
    // Generate strong temporary password: 16 bytes = 128 bits entropy (32 hex chars)
    const tempPassword = crypto.randomBytes(16).toString('hex');

    db.get(`SELECT username FROM users WHERE id = ?`, [targetId], async (err, user) => {
        if (err || !user) return res.status(404).json({ error: '用户不存在' });

        try {
            const hashed = await bcrypt.hash(tempPassword, 10);
            db.run(`UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?`, [hashed, targetId], (updateErr) => {
                if (updateErr) return res.status(500).json({ error: '重置密码失败' });
                log(req.user.id, req.user.username, 'admin_reset_pwd', `用户: ${user.username}`, getClientIp(req));
                res.json({ message: '密码已重置', tempPassword, username: user.username });
            });
        } catch (e) {
            res.status(500).json({ error: '服务器内部错误' });
        }
    });
});

// --- Phase 2: User Detail ---
router.get('/users/:id/detail', authenticateToken, requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    try {
        const user = await dbGet(`
            SELECT u.id, u.username, u.role, u.is_disabled, u.created_at,
                   COUNT(r.id) as total_items,
                   SUM(CASE WHEN r.is_deleted = 0 THEN r.price ELSE 0 END) as total_spent
            FROM users u
            LEFT JOIN records r ON u.id = r.user_id
            WHERE u.id = ?
            GROUP BY u.id
        `, [userId]);
        if (!user) return res.status(404).json({ error: '用户不存在' });

        const recentLogs = await dbAll(`
            SELECT action, detail, created_at FROM audit_logs
            WHERE username = ? ORDER BY created_at DESC LIMIT 20
        `, [user.username]);

        const recentRecords = await dbAll(`
            SELECT name, price, created_at FROM records
            WHERE user_id = ? AND is_deleted = 0
            ORDER BY created_at DESC LIMIT 10
        `, [userId]);

        res.json({ user, recentLogs, recentRecords });
    } catch (err) {
        console.error('User detail error:', err);
        res.status(500).json({ error: '查询用户详情失败' });
    }
});

// --- Phase 2: Batch Operations ---
router.post('/users/batch', authenticateToken, requireAdmin, async (req, res) => {
    const { action, userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: '请选择至少一个用户' });
    }
    const selfId = parseInt(req.user.id, 10);
    const safeIds = userIds.map(id => parseInt(id, 10)).filter(id => id !== selfId);
    if (safeIds.length === 0) {
        return res.status(400).json({ error: '操作列表中仅包含你自己，已自动跳过' });
    }

    try {
        const placeholders = safeIds.map(() => '?').join(',');
        if (action === 'disable') {
            await new Promise((resolve, reject) => {
                db.run(`UPDATE users SET is_disabled = 1 WHERE id IN (${placeholders}) AND id != ?`, [...safeIds, selfId], function(err) {
                    if (err) reject(err); else resolve(this.changes);
                });
            });
            log(req.user.id, req.user.username, 'admin_disable', `批量禁用 ${safeIds.length} 个用户`, getClientIp(req));
            res.json({ message: `已禁用 ${safeIds.length} 个用户` });
        } else if (action === 'enable') {
            await new Promise((resolve, reject) => {
                db.run(`UPDATE users SET is_disabled = 0 WHERE id IN (${placeholders})`, safeIds, function(err) {
                    if (err) reject(err); else resolve(this.changes);
                });
            });
            log(req.user.id, req.user.username, 'admin_enable', `批量启用 ${safeIds.length} 个用户`, getClientIp(req));
            res.json({ message: `已启用 ${safeIds.length} 个用户` });
        } else if (action === 'delete') {
            let deletedCount = 0;
            for (const uid of safeIds) {
                await new Promise((resolve, reject) => {
                    db.serialize(() => {
                        db.run('BEGIN TRANSACTION');
                        db.run('DELETE FROM records WHERE user_id = ?', [uid], (err1) => {
                            if (err1) { db.run('ROLLBACK'); return reject(err1); }
                            db.run('DELETE FROM totp_entries WHERE user_id = ?', [uid], (err2) => {
                                if (err2) { db.run('ROLLBACK'); return reject(err2); }
                                db.run('DELETE FROM users WHERE id = ?', [uid], function(err3) {
                                    if (err3) { db.run('ROLLBACK'); return reject(err3); }
                                    db.run('COMMIT', (commitErr) => {
                                        if (commitErr) { db.run('ROLLBACK'); return reject(commitErr); }
                                        deletedCount++;
                                        resolve();
                                    });
                                });
                            });
                        });
                    });
                });
            }
            log(req.user.id, req.user.username, 'admin_delete_user', `批量删除 ${deletedCount} 个用户`, getClientIp(req));
            res.json({ message: `已删除 ${deletedCount} 个用户及其数据` });
        } else {
            res.status(400).json({ error: '不支持的操作类型' });
        }
    } catch (err) {
        console.error('Batch operation error:', err);
        res.status(500).json({ error: '批量操作失败' });
    }
});

// Delete User (existing, enhanced with audit log)
// B1 fix: COMMIT now properly awaits callback before sending response
router.delete('/user/:id', authenticateToken, requireAdmin, (req, res) => {
    const targetUserId = parseInt(req.params.id, 10);

    if (targetUserId === parseInt(req.user.id, 10)) {
        return res.status(400).json({ error: '操作驳回：你不能处决你自己' });
    }

    db.get(`SELECT username FROM users WHERE id = ?`, [targetUserId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: '用户不存在' });

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run('DELETE FROM records WHERE user_id = ?', [targetUserId], (delErr) => {
                if (delErr) { db.run('ROLLBACK'); return res.status(500).json({ error: '清理用户账单数据失败' }); }
                db.run('DELETE FROM totp_entries WHERE user_id = ?', [targetUserId], (totpErr) => {
                    if (totpErr) { db.run('ROLLBACK'); return res.status(500).json({ error: '清理用户 TOTP 数据失败' }); }
                    db.run('DELETE FROM users WHERE id = ?', [targetUserId], function (delErr2) {
                        if (delErr2 || this.changes === 0) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: '铲除目标用户主体失败' });
                        }
                        db.run('COMMIT', (commitErr) => {
                            if (commitErr) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: '提交事务失败' });
                            }
                            log(req.user.id, req.user.username, 'admin_delete_user', `用户: ${user.username}`, getClientIp(req));
                            res.json({ message: '处决成功，关联记录已全线销毁。' });
                        });
                    });
                });
            });
        });
    });
});

// ============================================================
// PHASE 3: DATA ANALYTICS ENDPOINTS
// ============================================================

/**
 * Helper: compute date range offset for SQL based on range param.
 * Returns an object { dailyInterval, monthlyInterval } for use in queries.
 */
function getRangeIntervals(range) {
    switch (range) {
        case '7d':  return { dailyInterval: '-7 days',   monthlyInterval: '-3 months' };
        case '90d': return { dailyInterval: '-90 days',  monthlyInterval: '-12 months' };
        case '12m': return { dailyInterval: '-365 days', monthlyInterval: '-12 months' };
        case '30d':
        default:    return { dailyInterval: '-30 days',  monthlyInterval: '-12 months' };
    }
}

// GET /api/admin/analytics/growth — User growth analysis
router.get('/analytics/growth', authenticateToken, requireAdmin, async (req, res) => {
    const range = req.query.range || '30d';
    const { dailyInterval, monthlyInterval } = getRangeIntervals(range);

    try {
        // Daily new users for the selected range
        const daily = await dbAll(`
            SELECT date(created_at) as date, COUNT(*) as count
            FROM users
            WHERE created_at >= datetime('now', ?)
            GROUP BY date(created_at)
            ORDER BY date ASC
        `, [dailyInterval]);

        // Monthly growth for last 12 months
        const monthly = await dbAll(`
            SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
            FROM users
            WHERE created_at >= datetime('now', ?)
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY month ASC
        `, [monthlyInterval]);

        // Total user count
        const totalRow = await dbGet('SELECT COUNT(*) as total FROM users');
        const totalUsers = totalRow ? totalRow.total : 0;

        // Growth rate: new users in current period vs prior period (simple approximation)
        const currentPeriodCount = daily.reduce((sum, d) => sum + d.count, 0);
        const daysInRange = range === '7d' ? 7 : range === '90d' ? 90 : range === '12m' ? 365 : 30;

        // Get prior period count for comparison
        const priorPeriodRow = await dbGet(`
            SELECT COUNT(*) as count FROM users
            WHERE created_at >= datetime('now', ? || ' days')
              AND created_at < datetime('now', ? || ' days')
        `, [String(-daysInRange * 2), String(-daysInRange)]);
        const priorCount = priorPeriodRow ? priorPeriodRow.count : 0;

        let growthRate = '--';
        if (priorCount > 0) {
            const pct = Math.round(((currentPeriodCount - priorCount) / priorCount) * 100);
            growthRate = (pct >= 0 ? '+' : '') + pct + '%';
        } else if (currentPeriodCount > 0) {
            growthRate = '+100%';
        }

        res.json({ daily, monthly, totalUsers, growthRate });
    } catch (err) {
        console.error('Analytics growth error:', err);
        res.status(500).json({ error: '用户增长数据查询失败' });
    }
});

// GET /api/admin/analytics/activity — User activity stats
router.get('/analytics/activity', authenticateToken, requireAdmin, async (req, res) => {
    const range = req.query.range || '30d';
    const { dailyInterval } = getRangeIntervals(range);

    try {
        // Active (non-disabled) users
        const activeRow = await dbGet('SELECT COUNT(*) as active FROM users WHERE is_disabled = 0');
        const activeUsers = activeRow ? activeRow.active : 0;

        // Daily active users (users who created records in the date range)
        const dailyActive = await dbAll(`
            SELECT date(created_at) as date, COUNT(DISTINCT user_id) as active_count
            FROM records
            WHERE created_at >= datetime('now', ?)
            GROUP BY date(created_at)
            ORDER BY date ASC
        `, [dailyInterval]);

        // Activity distribution by action type from audit_logs
        const actionDistribution = await dbAll(`
            SELECT action, COUNT(*) as count
            FROM audit_logs
            WHERE created_at >= datetime('now', ?)
            GROUP BY action
            ORDER BY count DESC
        `, [dailyInterval]);

        // Peak hours: records created per hour-of-day
        const peakHours = await dbAll(`
            SELECT strftime('%H', created_at) as hour, COUNT(*) as count
            FROM records
            WHERE created_at >= datetime('now', ?)
            GROUP BY strftime('%H', created_at)
            ORDER BY hour ASC
        `, [dailyInterval]);

        res.json({ activeUsers, dailyActive, actionDistribution, peakHours });
    } catch (err) {
        console.error('Analytics activity error:', err);
        res.status(500).json({ error: '活跃度数据查询失败' });
    }
});

// GET /api/admin/analytics/assets — Asset distribution
router.get('/analytics/assets', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // Top spenders (top 20)
        const topSpenders = await dbAll(`
            SELECT u.username,
                   SUM(CASE WHEN r.is_deleted = 0 THEN r.price ELSE 0 END) as total_spent,
                   COUNT(r.id) as total_items
            FROM users u
            LEFT JOIN records r ON u.id = r.user_id
            GROUP BY u.id
            ORDER BY total_spent DESC
            LIMIT 20
        `);

        // Average / max / min spend per user
        const statsRow = await dbGet(`
            SELECT
                AVG(total_spent) as avg,
                MAX(total_spent) as max,
                MIN(total_spent) as min
            FROM (
                SELECT SUM(CASE WHEN r.is_deleted = 0 THEN r.price ELSE 0 END) as total_spent
                FROM users u
                LEFT JOIN records r ON u.id = r.user_id
                GROUP BY u.id
            )
        `);

        // Spend distribution by price range
        const spendDistribution = await dbAll(`
            SELECT
                CASE
                    WHEN total_spent < 100    THEN '0-100'
                    WHEN total_spent < 500    THEN '100-500'
                    WHEN total_spent < 1000   THEN '500-1000'
                    WHEN total_spent < 5000   THEN '1000-5000'
                    ELSE '5000+'
                END as range,
                COUNT(*) as count
            FROM (
                SELECT SUM(CASE WHEN r.is_deleted = 0 THEN r.price ELSE 0 END) as total_spent
                FROM users u
                LEFT JOIN records r ON u.id = r.user_id
                GROUP BY u.id
            )
            GROUP BY range
        `);

        // Ensure a canonical sort order for the range buckets
        const rangeOrder = ['0-100', '100-500', '500-1000', '1000-5000', '5000+'];
        const sortedDist = rangeOrder
            .map(r => spendDistribution.find(d => d.range === r) || { range: r, count: 0 });

        res.json({
            topSpenders,
            stats: {
                avg: statsRow ? statsRow.avg || 0 : 0,
                max: statsRow ? statsRow.max || 0 : 0,
                min: statsRow ? statsRow.min || 0 : 0
            },
            spendDistribution: sortedDist
        });
    } catch (err) {
        console.error('Analytics assets error:', err);
        res.status(500).json({ error: '资产分布数据查询失败' });
    }
});

// POST /api/admin/analytics/export — Export analytics report as CSV
router.post('/analytics/export', authenticateToken, requireAdmin, async (req, res) => {
    const { type = 'full' } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    const filename = `daycost-analytics-${today}.csv`;

    try {
        const csvParts = [];

        const buildGrowthCsv = async () => {
            const daily = await dbAll(`
                SELECT date(created_at) as date, COUNT(*) as count
                FROM users
                WHERE created_at >= datetime('now', '-30 days')
                GROUP BY date(created_at) ORDER BY date ASC
            `);
            csvParts.push('=== 用户增长 (近30天) ===');
            csvParts.push('日期,新增用户数');
            daily.forEach(d => csvParts.push(`${d.date},${d.count}`));
            csvParts.push('');
        };

        const buildActivityCsv = async () => {
            const actionDist = await dbAll(`
                SELECT action, COUNT(*) as count
                FROM audit_logs
                WHERE created_at >= datetime('now', '-30 days')
                GROUP BY action ORDER BY count DESC
            `);
            const peakHours = await dbAll(`
                SELECT strftime('%H', created_at) as hour, COUNT(*) as count
                FROM records
                WHERE created_at >= datetime('now', '-30 days')
                GROUP BY strftime('%H', created_at) ORDER BY hour ASC
            `);
            csvParts.push('=== 操作类型分布 (近30天) ===');
            csvParts.push('操作类型,次数');
            actionDist.forEach(d => csvParts.push(`${d.action},${d.count}`));
            csvParts.push('');
            csvParts.push('=== 活跃时段 (近30天) ===');
            csvParts.push('小时,操作数');
            peakHours.forEach(d => csvParts.push(`${d.hour}:00,${d.count}`));
            csvParts.push('');
        };

        const buildAssetsCsv = async () => {
            const topSpenders = await dbAll(`
                SELECT u.username,
                       SUM(CASE WHEN r.is_deleted = 0 THEN r.price ELSE 0 END) as total_spent,
                       COUNT(r.id) as total_items
                FROM users u
                LEFT JOIN records r ON u.id = r.user_id
                GROUP BY u.id ORDER BY total_spent DESC LIMIT 20
            `);
            csvParts.push('=== 消费排行 Top 20 ===');
            csvParts.push('用户名,总投入(¥),物品数');
            topSpenders.forEach(s => csvParts.push(`${s.username},${(s.total_spent || 0).toFixed(2)},${s.total_items || 0}`));
            csvParts.push('');
        };

        if (type === 'growth' || type === 'full') await buildGrowthCsv();
        if (type === 'activity' || type === 'full') await buildActivityCsv();
        if (type === 'assets' || type === 'full') await buildAssetsCsv();

        const csv = '\uFEFF' + csvParts.join('\n'); // UTF-8 BOM for Excel compatibility
        log(req.user.id, req.user.username, 'admin_export', `导出分析报表: ${type}`, getClientIp(req));
        res.json({ csv, filename });
    } catch (err) {
        console.error('Analytics export error:', err);
        res.status(500).json({ error: '导出报表失败' });
    }
});

// ============================================================
// PHASE 4: SYSTEM SETTINGS ENDPOINTS
// ============================================================

// GET /api/admin/settings — Get all system settings + system info
router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const rows = await dbAll('SELECT key, value, updated_at, updated_by FROM system_settings ORDER BY key ASC');
        const settings = {};
        rows.forEach(r => { settings[r.key] = r.value; });
        // Get system info
        const pkg = require('../../package.json');
        const fs = require('fs');
        const dbPath = require('../config/env').DB_PATH;
        let dbSize = 'unknown';
        try {
            const stat = fs.statSync(dbPath);
            dbSize = (stat.size / (1024 * 1024)).toFixed(2) + ' MB';
        } catch (_) {}
        // Get disk usage for backups directory
        const path = require('path');
        const backupDir = path.join(path.dirname(dbPath), 'backups');
        let backupCount = 0;
        let backupSize = '0 MB';
        try {
            const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
            backupCount = backups.length;
            let totalSize = 0;
            backups.forEach(f => {
                try { totalSize += fs.statSync(path.join(backupDir, f)).size; } catch(_) {}
            });
            backupSize = (totalSize / (1024 * 1024)).toFixed(2) + ' MB';
        } catch (_) {}

        res.json({
            settings,
            system: {
                version: pkg.version || '1.0.0',
                nodeVersion: process.version,
                dbSize,
                uptime: Math.floor(process.uptime()) + 's',
                env: process.env.NODE_ENV || 'development',
                backupCount,
                backupSize,
                memoryUsage: Math.round(process.memoryUsage().rss / (1024 * 1024)) + ' MB'
            }
        });
    } catch (err) {
        console.error('Settings fetch error:', err);
        res.status(500).json({ error: '获取设置失败' });
    }
});

// PUT /api/admin/settings — Update settings
router.put('/settings', authenticateToken, requireAdmin, async (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: '无效的设置数据' });
    }
    try {
        const allowedKeys = ['site_name', 'registration_enabled', 'max_records_per_user', 'session_timeout', 'maintenance_mode'];
        for (const [key, value] of Object.entries(settings)) {
            if (allowedKeys.includes(key)) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO system_settings (key, value, updated_at, updated_by) VALUES (?, ?, CURRENT_TIMESTAMP, ?)
                         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by`,
                        [key, String(value), req.user.username],
                        function(err) { if (err) reject(err); else resolve(); }
                    );
                });
            }
        }
        log(req.user.id, req.user.username, 'admin_settings_update', `更新系统设置: ${Object.keys(settings).join(', ')}`, getClientIp(req));
        res.json({ message: '设置已保存' });
    } catch (err) {
        console.error('Settings update error:', err);
        res.status(500).json({ error: '保存设置失败' });
    }
});

// POST /api/admin/backup — Create database backup
router.post('/backup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const dbPath = require('../config/env').DB_PATH;
        const backupDir = path.join(path.dirname(dbPath), 'backups');

        // Create backups directory if it doesn't exist
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFilename = `daycost-backup-${timestamp}.db`;
        const backupPath = path.join(backupDir, backupFilename);

        // Use SQLite VACUUM INTO for a consistent snapshot, fallback to file copy
        await new Promise((resolve, reject) => {
            db.run(`VACUUM INTO '${backupPath}'`, (err) => {
                if (err) {
                    // Fallback: simple file copy
                    try {
                        fs.copyFileSync(dbPath, backupPath);
                        resolve();
                    } catch (copyErr) {
                        reject(copyErr);
                    }
                } else {
                    resolve();
                }
            });
        });

        const stat = fs.statSync(backupPath);
        const sizeMB = (stat.size / (1024 * 1024)).toFixed(2) + ' MB';

        log(req.user.id, req.user.username, 'admin_backup_create', `创建备份: ${backupFilename} (${sizeMB})`, getClientIp(req));
        res.json({ message: '备份创建成功', filename: backupFilename, size: sizeMB, created_at: new Date().toISOString() });
    } catch (err) {
        console.error('Backup error:', err);
        res.status(500).json({ error: '备份创建失败' });
    }
});

// GET /api/admin/backup/list — List all backups
router.get('/backup/list', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const dbPath = require('../config/env').DB_PATH;
        const backupDir = path.join(path.dirname(dbPath), 'backups');

        let backups = [];
        if (fs.existsSync(backupDir)) {
            const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
            backups = files.map(f => {
                const filePath = path.join(backupDir, f);
                const stat = fs.statSync(filePath);
                return {
                    filename: f,
                    size: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
                    sizeBytes: stat.size,
                    created_at: stat.mtime.toISOString()
                };
            }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        res.json({ backups, count: backups.length });
    } catch (err) {
        console.error('Backup list error:', err);
        res.status(500).json({ error: '获取备份列表失败' });
    }
});

// DELETE /api/admin/backup/:filename — Delete a backup file
router.delete('/backup/:filename', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const dbPath = require('../config/env').DB_PATH;
        const backupDir = path.join(path.dirname(dbPath), 'backups');
        const filename = path.basename(decodeURIComponent(req.params.filename));

        // Security: ensure filename doesn't contain path traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ error: '无效的文件名' });
        }

        const backupPath = path.join(backupDir, filename);
        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: '备份文件不存在' });
        }

        fs.unlinkSync(backupPath);
        log(req.user.id, req.user.username, 'admin_backup_delete', `删除备份: ${filename}`, getClientIp(req));
        res.json({ message: '备份已删除' });
    } catch (err) {
        console.error('Backup delete error:', err);
        res.status(500).json({ error: '删除备份失败' });
    }
});

// POST /api/admin/cache/clear — Clear cache (SQLite optimization + temp cleanup)
router.post('/cache/clear', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // Run SQLite optimization commands
        await new Promise((resolve, reject) => {
            db.run('PRAGMA optimize', (err) => {
                if (err) reject(err); else resolve();
            });
        });

        // Get database size before and after
        const fs = require('fs');
        const dbPath = require('../config/env').DB_PATH;
        const sizeBefore = fs.statSync(dbPath).size;

        // VACUUM to reclaim space
        await new Promise((resolve, reject) => {
            db.run('VACUUM', (err) => {
                if (err) reject(err); else resolve();
            });
        });

        const sizeAfter = fs.statSync(dbPath).size;
        const freedMB = ((sizeBefore - sizeAfter) / (1024 * 1024)).toFixed(2);

        log(req.user.id, req.user.username, 'admin_cache_clear', `清理缓存: 释放 ${freedMB} MB`, getClientIp(req));
        res.json({
            message: '缓存清理完成',
            freed: freedMB + ' MB',
            dbSizeBefore: (sizeBefore / (1024 * 1024)).toFixed(2) + ' MB',
            dbSizeAfter: (sizeAfter / (1024 * 1024)).toFixed(2) + ' MB'
        });
    } catch (err) {
        console.error('Cache clear error:', err);
        res.status(500).json({ error: '缓存清理失败' });
    }
});

module.exports = router;
