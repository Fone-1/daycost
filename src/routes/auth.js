const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { JWT_SECRET } = require('../config/env');
const { authLimiter } = require('../middlewares/rateLimit');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();

// Avatar upload config
const avatarDir = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarDir),
    filename: (req, _file, cb) => cb(null, `${req.user.id}.webp`)
});
const avatarUpload = multer({
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        cb(null, allowed.includes(file.mimetype));
    }
});

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
    const { log, getClientIp } = require('../utils/auditLog');

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: '服务器错误' });
        if (!user) return res.status(400).json({ error: '用户不存在或密码错误' });

        if (user.is_disabled) {
            return res.status(403).json({ error: '账号已被禁用，请联系管理员' });
        }

        try {
            if (await bcrypt.compare(password, user.password_hash)) {
                const userRole = user.role || 'user';
                const token = jwt.sign({ id: user.id, username: user.username, role: userRole }, JWT_SECRET, { expiresIn: '7d' });
                log(user.id, user.username, 'login', '', getClientIp(req));
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

// Get Profile
router.get('/profile', authenticateToken, (req, res) => {
    db.get(`SELECT id, username, nickname, avatar, email, bio, role, created_at FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: '服务器错误' });
        if (!user) return res.status(404).json({ error: '用户不存在' });

        // Get stats
        db.get(`SELECT
            (SELECT COUNT(*) FROM records WHERE user_id = ? AND is_deleted = 0) as totalAssets,
            (SELECT COUNT(*) FROM records WHERE user_id = ? AND is_deleted = 0 AND status = 'active') as activeAssets
        `, [req.user.id, req.user.id], (statsErr, stats) => {
            if (statsErr) return res.status(500).json({ error: '统计查询失败' });

            const createdDate = new Date(user.created_at);
            const daysSince = Math.max(1, Math.floor((Date.now() - createdDate.getTime()) / 86400000));

            const avatarUrl = user.avatar ? `${user.avatar}?t=${Date.now()}` : '';

            res.json({
                username: user.username,
                nickname: user.nickname || '',
                avatar: avatarUrl,
                email: user.email || '',
                bio: user.bio || '',
                role: user.role || 'user',
                created_at: user.created_at,
                stats: {
                    daysSinceRegistration: daysSince,
                    totalAssets: stats.totalAssets || 0,
                    activeAssets: stats.activeAssets || 0
                }
            });
        });
    });
});

// Update Profile
router.put('/profile', authenticateToken, (req, res) => {
    const { nickname, email, bio } = req.body;
    db.run(`UPDATE users SET nickname = ?, email = ?, bio = ? WHERE id = ?`,
        [nickname || '', email || '', bio || '', req.user.id],
        function (err) {
            if (err) return res.status(500).json({ error: '更新失败' });
            res.json({ message: '个人资料已更新' });
        }
    );
});

// Upload Avatar
router.post('/avatar', authenticateToken, (req, res) => {
    avatarUpload.single('avatar')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '头像文件不能超过 2MB' });
            return res.status(400).json({ error: '上传失败' });
        }
        if (err || !req.file) return res.status(400).json({ error: '请上传 jpg/png/webp 格式的图片' });

        const avatarPath = `/uploads/avatars/${req.user.id}.webp`;
        db.run(`UPDATE users SET avatar = ? WHERE id = ?`, [avatarPath, req.user.id], (dbErr) => {
            if (dbErr) return res.status(500).json({ error: '保存头像路径失败' });
            res.json({ avatar: `${avatarPath}?t=${Date.now()}` });
        });
    });
});

// Remove Avatar
router.delete('/avatar', authenticateToken, (req, res) => {
    const filePath = path.join(avatarDir, `${req.user.id}.webp`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.run(`UPDATE users SET avatar = '' WHERE id = ?`, [req.user.id], (err) => {
        if (err) return res.status(500).json({ error: '移除头像失败' });
        res.json({ message: '头像已移除' });
    });
});

module.exports = router;
