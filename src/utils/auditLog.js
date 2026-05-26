const db = require('../config/db');

function log(userId, username, action, detail, ip) {
    db.run(
        `INSERT INTO audit_logs (user_id, username, action, detail, ip) VALUES (?, ?, ?, ?, ?)`,
        [userId || null, username || '', action, detail || '', ip || '']
    );
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
}

module.exports = { log, getClientIp };
