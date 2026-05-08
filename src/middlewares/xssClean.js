const xss = require('xss');

function clean(data) {
    if (typeof data === 'string') {
        return xss(data, {
            whiteList: {}, // 禁止任何 HTML 标签
            stripIgnoreTag: false, // 对非法标签进行 HTML 转义 (例如 <script> 变成 &lt;script&gt;)
            stripIgnoreTagBody: ['script', 'style'] // 彻底移除 script 和 style 的内部代码
        });
    }
    if (Array.isArray(data)) {
        return data.map(item => clean(item));
    }
    if (typeof data === 'object' && data !== null) {
        Object.keys(data).forEach(key => {
            data[key] = clean(data[key]);
        });
    }
    return data;
}

const xssMiddleware = (req, res, next) => {
    if (req.body) req.body = clean(req.body);
    if (req.query) req.query = clean(req.query);
    if (req.params) req.params = clean(req.params);
    next();
};

module.exports = xssMiddleware;
