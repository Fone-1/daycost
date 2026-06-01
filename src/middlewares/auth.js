const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET } = require('../config/env');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: '请先登录' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: '登录态已过期，请重新登录' });

        db.get(
            'SELECT id, username, role, is_disabled, token_version FROM users WHERE id = ?',
            [user.id],
            (dbErr, currentUser) => {
                if (dbErr) return res.status(500).json({ error: '登录态校验失败' });
                if (!currentUser) return res.status(403).json({ error: '账号不存在，请重新登录' });
                if (currentUser.is_disabled) return res.status(403).json({ error: '账号已被禁用，请联系管理员' });

                const tokenVersion = Number(user.token_version || 0);
                const currentTokenVersion = Number(currentUser.token_version || 0);
                if (tokenVersion !== currentTokenVersion) {
                    return res.status(403).json({ error: '登录态已失效，请重新登录' });
                }

                req.user = {
                    ...user,
                    id: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role || 'user',
                    token_version: currentTokenVersion
                };
                next();
            }
        );
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: '权限不足：仅管理员可执行此操作' });
    }
};

module.exports = {
    authenticateToken,
    requireAdmin
};
