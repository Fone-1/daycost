const rateLimit = require('express-rate-limit');

// Rate Limiting - 防止暴力破解
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分钟
    max: 5, // 每个 IP 最多 5 次请求
    handler: (req, res, _next, _options) => {
        const resetTime = req.rateLimit && req.rateLimit.resetTime;
        let msg = '登录/注册失败次数过多，请 15 分钟后再试';
        if (resetTime) {
            const minutesLeft = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 60000));
            msg = `登录/注册失败次数过多，请 ${minutesLeft} 分钟后再试`;
        }
        res.status(429).json({ error: msg });
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // 核心修复：仅计算失败请求
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 分钟
    max: 100, // 每个 IP 最多 100 次请求
    handler: (req, res, _next, _options) => {
        res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    authLimiter,
    apiLimiter
};
