const express = require('express');
const db = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

const router = express.Router();

// Get Macro Users List
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
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
router.delete('/user/:id', authenticateToken, requireAdmin, (req, res) => {
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
            db.run("DELETE FROM users WHERE id = ?", [targetUserId], function (err) {
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

module.exports = router;
