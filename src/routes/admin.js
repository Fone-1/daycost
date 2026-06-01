const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const { log, getClientIp } = require('../utils/auditLog');

const router = express.Router();

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

// System Overview
router.get('/overview', authenticateToken, requireAdmin, (req, res) => {
    const result = {};

    db.get(`SELECT COUNT(*) as total FROM users`, [], (err, row) => {
        if (err) return res.status(500).json({ error: '查询失败' });
        result.totalUsers = row.total;

        db.get(`SELECT COUNT(*) as total FROM records WHERE is_deleted = 0`, [], (err2, row2) => {
            if (err2) return res.status(500).json({ error: '查询失败' });
            result.totalRecords = row2.total;

            db.get(`SELECT COUNT(*) as active FROM users WHERE is_disabled = 0`, [], (err3, row3) => {
                if (err3) return res.status(500).json({ error: '查询失败' });
                result.activeUsers = row3.active;

                // User registration trend (last 30 days)
                db.all(`
                    SELECT date(created_at) as date, COUNT(*) as count
                    FROM users
                    WHERE created_at >= datetime('now', '-30 days')
                    GROUP BY date(created_at)
                    ORDER BY date ASC
                `, [], (err4, trend) => {
                    if (err4) return res.status(500).json({ error: '查询失败' });

                    const pkg = require('../../package.json');
                    const fs = require('fs');
                    const dbPath = require('../config/env').DB_PATH;
                    let dbSize = 'unknown';
                    try {
                        const stat = fs.statSync(dbPath);
                        dbSize = (stat.size / (1024 * 1024)).toFixed(2) + ' MB';
                    } catch (_) {}

                    res.json({
                        stats: {
                            totalUsers: result.totalUsers,
                            activeUsers: result.activeUsers,
                            totalRecords: result.totalRecords
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
                });
            });
        });
    });
});

// Get Audit Logs
router.get('/logs', authenticateToken, requireAdmin, (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
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
    const targetId = parseInt(req.params.id);
    if (targetId === parseInt(req.user.id)) {
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
    const targetId = parseInt(req.params.id);
    if (targetId === parseInt(req.user.id)) {
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
    const targetId = parseInt(req.params.id);
    const bcrypt = require('bcrypt');
    const tempPassword = crypto.randomBytes(4).toString('hex');

    db.get(`SELECT username FROM users WHERE id = ?`, [targetId], async (err, user) => {
        if (err || !user) return res.status(404).json({ error: '用户不存在' });

        try {
            const hashed = await bcrypt.hash(tempPassword, 10);
            db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashed, targetId], (updateErr) => {
                if (updateErr) return res.status(500).json({ error: '重置密码失败' });
                log(req.user.id, req.user.username, 'admin_reset_pwd', `用户: ${user.username}`, getClientIp(req));
                res.json({ message: '密码已重置', tempPassword, username: user.username });
            });
        } catch (e) {
            res.status(500).json({ error: '服务器内部错误' });
        }
    });
});

// Delete User (existing, enhanced with audit log)
router.delete('/user/:id', authenticateToken, requireAdmin, (req, res) => {
    const targetUserId = req.params.id;

    if (parseInt(targetUserId) === parseInt(req.user.id)) {
        return res.status(400).json({ error: '操作驳回：你不能处决你自己' });
    }

    db.get(`SELECT username FROM users WHERE id = ?`, [targetUserId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: '用户不存在' });

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            db.run("DELETE FROM records WHERE user_id = ?", [targetUserId], (delErr) => {
                if (delErr) { db.run("ROLLBACK"); return res.status(500).json({ error: '清理用户账单数据失败' }); }
                db.run("DELETE FROM users WHERE id = ?", [targetUserId], function (delErr2) {
                    if (delErr2 || this.changes === 0) { db.run("ROLLBACK"); return res.status(500).json({ error: '铲除目标用户主体失败' }); }
                    db.run("COMMIT");
                    log(req.user.id, req.user.username, 'admin_delete_user', `用户: ${user.username}`, getClientIp(req));
                    res.json({ message: '处决成功，关联记录已全线销毁。' });
                });
            });
        });
    });
});

module.exports = router;
