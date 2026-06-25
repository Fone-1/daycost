# 安全审计报告：DayCost 应用

**审计日期**: 2026-06-25  
**审计范围**: 全栈安全评估 (Node.js/Express + SQLite + 前端)  
**风险等级**: 🔴 高风险 / 🟠 中风险 / 🟢 低风险 / ℹ️ 信息

---

## 一、系统架构概览

| 组件 | 技术栈 | 安全措施 |
|------|--------|----------|
| 后端框架 | Express 5.2.1 | Helmet, CORS, Rate Limiting |
| 数据库 | SQLite3 | 参数化查询, WAL模式 |
| 认证 | JWT + bcrypt | Token版本控制, 密码哈希 |
| 文件上传 | Multer | Magic Byte验证, 大小限制 |
| TOTP | AES-256-GCM | 加密存储, 认证标签 |
| 部署 | Docker + docker-compose | 容器隔离 |

---

## 二、安全优势（已实施的良好实践）

✅ **Helmet安全头** - 完整的CSP、HSTS、X-Frame-Options等  
✅ **速率限制** - 认证端点5次/15分钟，API 100次/分钟  
✅ **XSS防护** - 自定义中间件清理所有输入  
✅ **密码哈希** - bcrypt cost factor 10  
✅ **JWT安全** - Token版本控制支持失效  
✅ **TOTP加密** - AES-256-GCM认证加密  
✅ **文件验证** - Magic Byte验证防止伪造扩展名  
✅ **SQL注入防护** - 全部使用参数化查询  
✅ **审计日志** - 敏感操作记录  
✅ **软删除** - 30天自动清理回收站  

---

## 三、发现的安全漏洞

### 🔴 严重 (Critical) - 3个

#### C1: Dockerfile和docker-compose.yml中硬编码JWT密钥

**位置**: 
- `Dockerfile:29` - `JWT_SECRET=change_this_to_something_secure_in_azure_portal`
- `docker-compose.yml:11` - `JWT_SECRET=PLEASE_CHANGE_THIS_SECRET_IN_PRODUCTION`

**风险**: 如果部署时未覆盖环境变量，所有JWT令牌可被预测和伪造，导致完全的身份认证绕过。

**影响**: 攻击者可伪造任意用户（包括管理员）的JWT令牌，完全控制所有账户。

**修复方案**:
```yaml
# docker-compose.yml - 使用secrets或环境变量文件
services:
  app:
    environment:
      - JWT_SECRET=${JWT_SECRET}  # 从.env文件或Docker secrets读取
    secrets:
      - jwt_secret

secrets:
  jwt_secret:
    file: ./secrets/jwt_secret.txt  # 或使用Docker secrets
```

```dockerfile
# Dockerfile - 移除默认值，强制要求设置
ENV JWT_SECRET=
# 在entrypoint脚本中检查是否设置
```

---

#### C2: TOTP加密密钥从JWT_SECRET派生

**位置**: `src/config/env.js:9`
```javascript
const TOTP_ENCRYPTION_KEY = process.env.TOTP_KEY || JWT_SECRET.padEnd(32, '0').slice(0, 32);
```

**风险**: 如果JWT_SECRET被泄露（见C1），所有用户的TOTP密钥也会被泄露。攻击者可生成有效的TOTP代码，绕过双因素认证。

**影响**: 所有用户的TOTP密钥可被解密，双因素认证完全失效。

**修复方案**:
```javascript
// src/config/env.js
const TOTP_ENCRYPTION_KEY = process.env.TOTP_KEY;

if (!TOTP_ENCRYPTION_KEY || Buffer.byteLength(TOTP_ENCRYPTION_KEY, 'utf8') !== 32) {
    if (IS_PRODUCTION) {
        throw new Error('TOTP_KEY must be set in production and must be exactly 32 UTF-8 bytes.');
    }
    // 开发环境使用随机密钥（每次重启都会变化，仅用于开发）
    console.warn('WARNING: Using random TOTP key for development. TOTP secrets will not persist across restarts.');
    const randomKey = require('crypto').randomBytes(32).toString('hex').slice(0, 32);
    return { JWT_SECRET, PORT, HTTPS_PORT, DB_PATH, CORS_ORIGIN, TOTP_ENCRYPTION_KEY: randomKey };
}
```

---

#### C3: 管理员密码重置生成弱临时密码

**位置**: `src/routes/admin.js:152`
```javascript
const tempPassword = crypto.randomBytes(4).toString('hex'); // 仅8个十六进制字符 = 32位熵
```

**风险**: 32位熵的密码可在合理时间内被暴力破解（约40亿种可能，现代GPU可在数小时内破解）。

**影响**: 管理员账户可能被暴力破解。

**修复方案**:
```javascript
// 增加到16字节 = 128位熵
const tempPassword = crypto.randomBytes(16).toString('hex'); // 32个十六进制字符
// 或使用更易读的格式
const tempPassword = crypto.randomBytes(12).toString('base64url'); // 16个URL安全字符
```

---

### 🟠 高危 (High) - 5个

#### H1: CORS在开发环境允许所有来源

**位置**: `src/config/env.js:8`
```javascript
const CORS_ORIGIN = process.env.CORS_ORIGIN || (IS_PRODUCTION ? false : '*');
```

**风险**: 开发环境允许任何来源的跨域请求，如果开发服务器暴露在网络上，可被利用进行CSRF攻击。

**修复方案**:
```javascript
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000'; // 明确指定开发端口
```

---

#### H2: 无验证码/邮箱验证的注册端点

**位置**: `src/routes/auth.js:55-81`

**风险**: 攻击者可批量注册虚假账户，消耗系统资源，可能用于垃圾信息或滥用。

**修复方案**:
1. 添加验证码（reCAPTCHA或hCaptcha）
2. 实现邮箱验证
3. 添加IP级别的注册频率限制

---

#### H3: JWT令牌有效期过长（7天）

**位置**: `src/routes/auth.js:103`
```javascript
const token = jwt.sign(
    { id: user.id, username: user.username, role: userRole, token_version: Number(user.token_version || 0) },
    JWT_SECRET,
    { expiresIn: '7d' }
);
```

**风险**: 令牌被盗后有7天的攻击窗口。

**修复方案**:
```javascript
// 缩短为1天，并实现refresh token机制
{ expiresIn: '1d' }
```

---

#### H4: 静态文件服务配置可能泄露信息

**位置**: `server.js:39`
```javascript
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
```

**风险**: 如果uploads目录包含敏感文件，或目录遍历漏洞存在，可能泄露用户上传的文件。

**修复方案**:
```javascript
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    dotfiles: 'deny',        // 拒绝访问点文件
    index: false,            // 禁止目录列表
    etag: true,              // 启用ETag缓存
    lastModified: true,      // 启用Last-Modified
    maxAge: '1d',            // 缓存1天
    setHeaders: (res, path) => {
        // 防止MIME类型嗅探
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));
```

---

#### H5: 数据库迁移静默忽略错误

**位置**: `src/config/db.js:34-57`
```javascript
db.run("ALTER TABLE records ADD COLUMN status TEXT DEFAULT 'active'", (_err) => { });
```

**风险**: 迁移失败时静默忽略错误，可能导致数据不一致或功能异常。

**修复方案**:
```javascript
db.run("ALTER TABLE records ADD COLUMN status TEXT DEFAULT 'active'", (err) => {
    // 忽略 "duplicate column name" 错误（这是正常的幂等操作）
    if (err && !err.message.includes('duplicate column name')) {
        console.error('Migration error:', err);
    }
});
```

---

### 🟢 中危 (Medium) - 4个

#### M1: IP欺骗绕过速率限制

**位置**: `src/middlewares/rateLimit.js` + `src/utils/auditLog.js:11`
```javascript
return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
```

**风险**: 攻击者可通过伪造X-Forwarded-For头绕过IP级别的速率限制。

**修复方案**:
```javascript
// 在Express配置中正确设置trust proxy
app.set('trust proxy', 1); // 仅信任第一层代理

// 速率限制器应使用req.ip（已由Express根据trust proxy设置正确解析）
```

---

#### M2: 缺少CSRF保护

**风险**: 虽然JWT在Header中提供了一定保护，但如果使用cookie存储token，需要额外的CSRF保护。

**修复方案**:
- 实现CSRF令牌
- 或确保JWT仅通过Authorization头传递，不通过cookie

---

#### M3: 错误信息可能泄露内部信息

**位置**: 多个路由
```javascript
res.status(500).json({ error: '服务器内部错误' });
```

**风险**: 生产环境的错误信息可能包含堆栈跟踪或内部路径。

**修复方案**:
```javascript
// 生产环境使用通用错误信息
if (IS_PRODUCTION) {
    res.status(500).json({ error: '服务器内部错误' });
} else {
    res.status(500).json({ error: err.message, stack: err.stack });
}
```

---

#### M4: 缺少安全审计日志的IP地址验证

**位置**: `src/utils/auditLog.js`

**风险**: 审计日志中的IP地址可能被伪造。

**修复方案**:
- 验证IP地址格式
- 记录原始请求信息用于取证

---

### ℹ️ 低危 (Low) - 3个

#### L1: 缺少HTTP严格传输安全(HSTS)预加载

**位置**: `server.js:14-29` (Helmet配置)

**修复方案**:
```javascript
app.use(helmet({
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));
```

---

#### L2: 缺少安全响应头Permissions-Policy

**修复方案**:
```javascript
app.use(helmet({
    permissionsPolicy: {
        directives: {
            camera: ["'none'"],
            microphone: ["'none'"],
            geolocation: ["'none'"],
            payment: ["'none'"]
        }
    }
}));
```

---

#### L3: 服务版本信息泄露

**位置**: `server.js` 未禁用X-Powered-By头

**修复方案**:
```javascript
app.disable('x-powered-by'); // Helmet默认会处理，但显式禁用更安全
```

---

## 四、修复优先级

| 优先级 | 漏洞 | 预计工作量 | 状态 |
|--------|------|------------|------|
| P0 | C1: 硬编码JWT密钥 | 30分钟 | ⏳ 待修复 |
| P0 | C2: TOTP密钥派生问题 | 1小时 | ⏳ 待修复 |
| P0 | C3: 弱临时密码 | 15分钟 | ⏳ 待修复 |
| P1 | H1: CORS配置 | 15分钟 | ⏳ 待修复 |
| P1 | H3: JWT有效期 | 30分钟 | ⏳ 待修复 |
| P1 | H4: 静态文件服务 | 15分钟 | ⏳ 待修复 |
| P2 | H2: 注册验证码 | 2小时 | ⏳ 待修复 |
| P2 | H5: 迁移错误处理 | 30分钟 | ⏳ 待修复 |
| P2 | M1-M4 | 1-2小时 | ⏳ 待修复 |
| P3 | L1-L3 | 30分钟 | ⏳ 待修复 |

---

## 五、合规性建议

### 数据保护
- ✅ 密码使用bcrypt哈希
- ✅ TOTP密钥使用AES-256-GCM加密
- ⚠️ 建议添加数据加密传输（已支持HTTPS）

### 访问控制
- ✅ 基于角色的访问控制(RBAC)
- ✅ JWT令牌版本控制
- ⚠️ 建议添加会话管理功能

### 审计追踪
- ✅ 敏感操作审计日志
- ✅ 日志自动清理（90天）
- ⚠️ 建议增加日志导出功能

---

## 六、总结

DayCost应用已经实施了许多良好的安全实践，特别是：
- 参数化查询防止SQL注入
- bcrypt密码哈希
- JWT令牌版本控制
- XSS输入清理
- 速率限制
- 审计日志

主要的安全风险集中在：
1. **部署配置安全** - 硬编码的密钥是最大的风险
2. **加密密钥管理** - TOTP密钥不应从JWT密钥派生
3. **认证安全** - 需要更强的临时密码和更短的令牌有效期

建议按优先级立即修复P0级别的漏洞，然后在下一个迭代周期处理P1和P2级别的问题。

---

**审计工程师**: Security Engineer  
**报告生成时间**: 2026-06-25 15:55 GMT+8
