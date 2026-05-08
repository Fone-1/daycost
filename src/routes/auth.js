const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET } = require('../config/env');
const { authLimiter } = require('../middlewares/rateLimit');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();

// Register
router.post('/register', authLimiter, async (req, res) => {
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
router.post('/login', authLimiter, (req, res) => {
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
router.put('/password', authenticateToken, (req, res) => {
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

module.exports = router;
