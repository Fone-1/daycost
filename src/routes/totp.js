const express = require('express');
const db = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');
const { encryptSecret, decryptSecret, generateTOTP } = require('../utils/totpHelper');

const router = express.Router();
const DEFAULT_TOTP_DIGITS = 6;
const DEFAULT_TOTP_PERIOD = 30;

function normalizeTotpDigits(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 6 && n <= 8 ? n : DEFAULT_TOTP_DIGITS;
}

function normalizeTotpPeriod(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 10 && n <= 300 ? n : DEFAULT_TOTP_PERIOD;
}

// GET /api/totp/groups - list groups with counts
router.get('/groups', authenticateToken, (req, res) => {
    db.all(
        `SELECT group_name, COUNT(*) as count FROM totp_entries WHERE user_id = ? GROUP BY group_name ORDER BY MIN(created_at)`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: '查询失败' });
            res.json(rows);
        }
    );
});

// PUT /api/totp/group/rename - rename a group
router.put('/group/rename', authenticateToken, (req, res) => {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ error: '新旧分组名必填' });
    if (oldName === newName) return res.json({ success: true });
    db.run(
        'UPDATE totp_entries SET group_name = ? WHERE user_id = ? AND group_name = ? ',
        [newName, req.user.id, oldName],
        function (err) {
            if (err) return res.status(500).json({ error: '重命名失败' });
            res.json({ success: true, affected: this.changes });
        }
    );
});

// DELETE /api/totp/group/:name - delete group (moves entries to 默认分组)
router.delete('/group/:name', authenticateToken, (req, res) => {
    const groupName = decodeURIComponent(req.params.name);
    if (groupName === '默认分组') return res.status(400).json({ error: '不能删除默认分组' });
    db.run(
        "UPDATE totp_entries SET group_name = '默认分组' WHERE user_id = ? AND group_name = ?",
        [req.user.id, groupName],
        function (err) {
            if (err) return res.status(500).json({ error: '删除分组失败' });
            res.json({ success: true, moved: this.changes });
        }
    );
});

// GET /api/totp - list entries (no secrets), optional ?group= filter
router.get('/', authenticateToken, (req, res) => {
    const { group } = req.query;
    let sql = 'SELECT id, label, issuer, digits, period, group_name, created_at FROM totp_entries WHERE user_id = ?';
    const params = [req.user.id];
    if (group) {
        sql += ' AND group_name = ?';
        params.push(group);
    }
    sql += ' ORDER BY created_at DESC';
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: '查询失败' });
        res.json(rows);
    });
});

// GET /api/totp/codes - generate current codes for all entries, optional ?group= filter
router.get('/codes', authenticateToken, (req, res) => {
    const { group } = req.query;
    let sql = 'SELECT id, label, issuer, secret_enc, iv, auth_tag, digits, period, group_name FROM totp_entries WHERE user_id = ?';
    const params = [req.user.id];
    if (group) {
        sql += ' AND group_name = ?';
        params.push(group);
    }
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: '查询失败' });
        const codes = rows.map(r => {
            try {
                const secret = decryptSecret(r.secret_enc, r.iv, r.auth_tag);
                const digits = normalizeTotpDigits(r.digits);
                const period = normalizeTotpPeriod(r.period);
                const { code, remaining } = generateTOTP(secret, period, digits);
                return { id: r.id, label: r.label, issuer: r.issuer, code, remaining, digits, period, group: r.group_name };
            } catch (e) {
                return { id: r.id, label: r.label, issuer: r.issuer, code: 'ERROR', remaining: 0, digits: DEFAULT_TOTP_DIGITS, period: DEFAULT_TOTP_PERIOD, group: r.group_name };
            }
        });
        res.json(codes);
    });
});

// POST /api/totp - add entry
router.post('/', authenticateToken, (req, res) => {
    const { label, secret, issuer, group, digits, period } = req.body;
    if (!label || !secret) return res.status(400).json({ error: '名称和密钥必填' });
    const cleanSecret = secret.replace(/\s/g, '').toUpperCase();
    const normalizedDigits = normalizeTotpDigits(digits);
    const normalizedPeriod = normalizeTotpPeriod(period);
    const { enc, iv, authTag } = encryptSecret(cleanSecret);
    db.run('INSERT INTO totp_entries (user_id, label, secret_enc, iv, auth_tag, issuer, digits, period, group_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, label, enc, iv, authTag, issuer || '', normalizedDigits, normalizedPeriod, group || '默认分组'],
        function (err) {
            if (err) return res.status(500).json({ error: '添加失败' });
            res.json({ id: this.lastID, label, issuer: issuer || '', digits: normalizedDigits, period: normalizedPeriod, group: group || '默认分组' });
        }
    );
});

// PUT /api/totp/:id - update entry metadata
router.put('/:id', authenticateToken, (req, res) => {
    const { label, issuer, group, digits, period } = req.body;
    const fields = [];
    const params = [];
    if (label !== undefined) { fields.push('label = ?'); params.push(label); }
    if (issuer !== undefined) { fields.push('issuer = ?'); params.push(issuer); }
    if (group !== undefined) { fields.push('group_name = ?'); params.push(group); }
    if (digits !== undefined) { fields.push('digits = ?'); params.push(normalizeTotpDigits(digits)); }
    if (period !== undefined) { fields.push('period = ?'); params.push(normalizeTotpPeriod(period)); }
    if (fields.length === 0) return res.status(400).json({ error: '无更新内容' });
    params.push(req.params.id, req.user.id);
    db.run(`UPDATE totp_entries SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, params, function (err) {
        if (err) return res.status(500).json({ error: '更新失败' });
        if (this.changes === 0) return res.status(404).json({ error: '未找到' });
        res.json({ success: true });
    });
});

// DELETE /api/totp/:id
router.delete('/:id', authenticateToken, (req, res) => {
    db.run('DELETE FROM totp_entries WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: '删除失败' });
        res.json({ success: true });
    });
});

// GET /api/totp/export - export all entries as JSON (with decrypted secrets)
router.get('/export', authenticateToken, (req, res) => {
    db.all(
        'SELECT id, label, issuer, secret_enc, iv, auth_tag, digits, period, group_name FROM totp_entries WHERE user_id = ?',
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: '导出失败' });
            const exported = rows.map(r => {
                try {
                    const secret = decryptSecret(r.secret_enc, r.iv, r.auth_tag);
                    return { label: r.label, issuer: r.issuer, secret, digits: normalizeTotpDigits(r.digits), period: normalizeTotpPeriod(r.period), group: r.group_name || '默认分组' };
                } catch (e) {
                    return { label: r.label, issuer: r.issuer, secret: 'DECRYPT_ERROR', digits: normalizeTotpDigits(r.digits), period: normalizeTotpPeriod(r.period), group: r.group_name || '默认分组' };
                }
            });
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="daycost-totp-export-${new Date().toISOString().slice(0,10)}.json"`);
            res.json({ version: 1, type: 'daycost-totp', exported_at: new Date().toISOString(), entries: exported });
        }
    );
});

// POST /api/totp/import - import entries from JSON
router.post('/import', authenticateToken, (req, res) => {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) return res.status(400).json({ error: '导入数据为空' });
    if (entries.length > 200) return res.status(400).json({ error: '单次最多导入 200 条' });

    let imported = 0;
    let skipped = 0;
    const errors = [];

    const stmt = db.prepare('INSERT INTO totp_entries (user_id, label, secret_enc, iv, auth_tag, issuer, digits, period, group_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

    for (const entry of entries) {
        const { label, secret, issuer, group, digits, period } = entry;
        if (!label || !secret) { skipped++; continue; }
        try {
            const cleanSecret = String(secret).replace(/\s/g, '').toUpperCase();
            const { enc, iv, authTag } = encryptSecret(cleanSecret);
            stmt.run(req.user.id, label, enc, iv, authTag, issuer || '', normalizeTotpDigits(digits), normalizeTotpPeriod(period), group || '默认分组');
            imported++;
        } catch (e) {
            errors.push(label);
        }
    }

    stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: '导入写入失败' });
        res.json({ success: true, imported, skipped, errors });
    });
});

module.exports = router;
