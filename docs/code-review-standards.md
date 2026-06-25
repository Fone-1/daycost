# DayCost 代码审查标准与流程

> 本文档定义了 DayCost 项目的代码审查规范、流程和质量标准，适用于所有贡献者和审查者。

---

## 一、审查流程

### 1.1 提交前（作者自查）

提交 PR 前，作者**必须**完成以下自查：

```bash
# 1. 代码检查
npm run lint

# 2. 确保无语法错误
node --check server.js
node --check src/**/*.js

# 3. 手动冒烟测试
PORT=3001 npm start
# → 注册/登录、增删改查记录、查看统计图表
```

### 1.2 PR 规范

| 要素 | 要求 |
|------|------|
| 标题 | 简明扼要，格式：`[类型] 简述`，如 `[Fix] 修复回收站恢复后排序丢失` |
| 类型 | `Feat` / `Fix` / `Refactor` / `Docs` / `Chore` / `Perf` / `Security` |
| 描述 | 说明改动动机、方案选择理由、影响范围 |
| 关联 | 关联 Issue 编号（如有） |
| 截图 | UI 改动需附截图或录屏 |

### 1.3 审查节奏

```
作者提交 PR
  → 自动检查通过 (lint / 语法)
  → 审查者 48h 内完成首轮 Review
  → 作者回复评论 / 修改代码
  → 审查者确认 → 合并
```

- **小 PR 优先**：单个 PR 改动控制在 300 行以内
- **功能完整**：一个 PR 完成一个完整功能，避免半成品合并
- **向后兼容**：API 变更需说明迁移方案

---

## 二、审查标准

### 2.1 优先级定义

| 标记 | 含义 | 处理方式 |
|------|------|----------|
| 🔴 **Blocker** | 必须修复才能合并 | 阻塞合并 |
| 🟡 **Suggestion** | 强烈建议修改 | 可讨论后合并 |
| 💭 **Nit** | 锦上添花 | 作者自行决定 |

### 2.2 审查维度

#### 🔴 安全性（Security）

**SQL 注入防护**
- ✅ 所有 SQL 必须使用参数化查询 `?` 占位符
- ❌ 绝不允许字符串拼接 SQL

```javascript
// ✅ 正确
db.run('SELECT * FROM records WHERE user_id = ?', [userId], callback);

// ❌ 危险 — SQL 注入
db.run(`SELECT * FROM records WHERE user_id = ${userId}`, callback);
```

**认证与授权**
- 所有 `/api/*` 路由必须经过 `authenticateToken` 中间件
- 管理员接口必须额外使用 `requireAdmin` 中间件
- 数据操作必须校验 `user_id`，防止越权访问

```javascript
// ✅ 正确 — 只操作当前用户的数据
db.run('UPDATE records SET ... WHERE id = ? AND user_id = ?', [id, req.user.id]);

// ❌ 危险 — 未校验 user_id，可越权修改他人记录
db.run('UPDATE records SET ... WHERE id = ?', [id]);
```

**输入验证**
- 所有用户输入必须在**使用前**进行类型检查和范围验证
- 价格、日期等字段必须校验格式和合理性
- 枚举值必须白名单校验

```javascript
// ✅ 正确
if (!['active', 'broken', 'sold'].includes(status)) {
    return res.status(400).json({ error: '无效的状态' });
}

// ❌ 危险 — 直接使用未校验的输入
db.run('UPDATE records SET status = ?', [status]);
```

**XSS 防护**
- `xssClean` 中间件已全局应用于 `/api` 路由
- 前端渲染用户输入内容时，必须使用 `textContent` 而非 `innerHTML`

**敏感数据**
- JWT_SECRET 在生产环境必须强制修改（`env.js` 已有检查）
- TOTP 密钥必须加密存储（项目已实现 AES-256-GCM）
- API 响应中不得泄露密码哈希、密钥原文等敏感字段

#### 🔴 正确性（Correctness）

**错误处理**
- 所有数据库回调必须处理 `err` 参数
- 异步函数必须有 `try/catch` 或 `.catch()`
- 错误响应必须使用恰当的 HTTP 状态码

```javascript
// ✅ 正确 — 完整的错误处理链
db.get(sql, params, (err, row) => {
    if (err) return res.status(500).json({ error: '查询失败' });
    if (!row) return res.status(404).json({ error: '记录不存在' });
    // ... 业务逻辑
});

// ❌ 危险 — 忽略错误
db.get(sql, params, (err, row) => {
    res.json(row); // err 被忽略，row 可能为 undefined
});
```

**事务一致性**
- 多表操作必须使用事务（`BEGIN` / `COMMIT` / `ROLLBACK`）
- 事务中任何一步失败，必须回滚

```javascript
// ✅ 正确的事务模式
db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run(sql1, params1, (err1) => {
        if (err1) { db.run('ROLLBACK'); return res.status(500).json({...}); }
        db.run(sql2, params2, (err2) => {
            if (err2) { db.run('ROLLBACK'); return res.status(500).json({...}); }
            db.run('COMMIT', (commitErr) => {
                if (commitErr) { db.run('ROLLBACK'); return res.status(500).json({...}); }
                res.json({ success: true });
            });
        });
    });
});
```

**数据校验**
- 价格：`Number.isFinite(x) && x >= 0`
- 日期：格式合法，结束日期 ≥ 开始日期
- 分页：`page >= 1`，`limit` 设上限防止一次拉取过多数据
- `parseInt` 必须指定基数：`parseInt(value, 10)`

#### 🟡 可维护性（Maintainability）

**命名规范**
- 变量/函数：`camelCase`
- 常量：`UPPER_SNAKE_CASE`
- 数据库列：`snake_case`
- 命名必须有意义，避免单字母变量（循环变量 `i` 除外）

```javascript
// ✅ 正确
const normalizedPrice = Number(price);
const filteredTopLevel = records.filter(r => !r.parent_id);

// ❌ 含义不清
const p = Number(price);
const ft = records.filter(r => !r.parent_id);
```

**代码结构**
- 单个文件不超过 300 行（当前 `public/script.js` 2500+ 行需逐步拆分）
- 单个函数不超过 50 行
- 回调嵌套不超过 3 层，超过时使用 `async/await` 或提取函数

**DRY 原则**
- 重复超过 2 次的逻辑必须提取为工具函数
- 排序逻辑（当前在 `records.js` 中父子各写一遍）应提取为共享函数

```javascript
// ❌ 重复代码 — records.js 中父级和子级排序逻辑完全相同
filteredTopLevel.sort((a, b) => { /* 15 行排序逻辑 */ });
children.sort((a, b) => { /* 完全相同的 15 行排序逻辑 */ });

// ✅ 提取为共享函数
function sortRecords(records, sortBy, sortOrder) {
    return records.sort((a, b) => {
        // ... 统一的排序逻辑
    });
}
```

**注释**
- 复杂算法（如 `treeHelper.js` 的树形聚合）必须有注释说明思路
- "为什么这样做"比"做了什么"更重要
- TODO 注释必须关联 Issue 编号

#### 🟡 性能（Performance）

**N+1 查询**
- 避免在循环中执行数据库查询
- 使用 `JOIN` 或批量查询替代

```javascript
// ❌ N+1 — 循环中逐条查询
items.forEach(item => {
    db.get('SELECT ... FROM records WHERE parent_id = ?', [item.id], ...);
});

// ✅ 批量查询
const ids = items.map(i => i.id);
db.all(`SELECT ... FROM records WHERE parent_id IN (${ids.map(() => '?').join(',')})`, ids, ...);
```

**内存使用**
- 大列表使用分页，避免一次加载全部数据
- 前端使用 Clusterize.js 虚拟滚动（项目已实现 ✅）

**数据库索引**
- 高频查询字段必须有索引
- 当前已有索引：`idx_records_user_list`、`idx_records_parent`、`idx_audit_logs_time`

#### 💭 代码风格（Style）

**ESLint 规则**
- 已配置规则必须遵守，CI 不通过不予合并
- 重点关注：`eqeqeq`（严格相等）、`no-var`、`prefer-const`

**一致性**
- 同一项目中相同概念使用相同命名
- 错误消息统一使用中文（项目已统一 ✅）
- 响应格式统一：`{ message: '...' }` 或 `{ error: '...' }`

**前端特定**
- 优先使用 `const`，需要重赋值时使用 `let`，禁止 `var`
- 事件监听使用箭头函数保持一致性
- DOM 操作集中处理，避免分散的 `querySelector`

---

## 三、当前代码库审查报告

> 以下是对 DayCost 当前代码的审查结果，作为基准参考。

### ✅ 做得好的地方

| 项目 | 说明 |
|------|------|
| SQL 参数化查询 | 全项目 100% 使用 `?` 占位符，零注入风险 |
| XSS 防护 | 全局中间件 + `xss` 库，递归清洗 body/query/params |
| 认证中间件 | JWT + token_version 机制支持密码修改后自动失效旧 token |
| 软删除 | `is_deleted` + `deleted_at` + 30 天自动清理，用户友好 |
| 文件上传安全 | 头像上传校验 Magic Bytes，防止伪造文件类型 |
| 限流策略 | 登录 5 次/15 分钟，API 100 次/分钟，分层合理 |
| 输入验证 | `records.js` 的新增/更新接口有完整的字段校验 |
| 数据库性能 | WAL 模式 + 合理索引 + SQL 视图计算 |
| 环境变量管理 | `env.js` 集中管理，生产环境强制校验敏感配置 |

### 🔴 Blockers — 必须修复

#### B1: 事务回调缩进错误 — 潜在 COMMIT/ROLLBACK 竞争

**文件**: `src/routes/admin.js` 第 186-202 行

```javascript
// 当前代码 — 缩进混乱，嵌套层级不清晰
db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    db.run("DELETE FROM records WHERE user_id = ?", [targetUserId], (delErr) => {
        if (delErr) { db.run("ROLLBACK"); return res.status(500).json({...}); }
        db.run("DELETE FROM totp_entries WHERE user_id = ?", [targetUserId], (totpErr) => {
            if (totpErr) { db.run("ROLLBACK"); return res.status(500).json({...}); }
            db.run("DELETE FROM users WHERE id = ?", [targetUserId], function (delErr2) {
                if (delErr2 || this.changes === 0) { db.run("ROLLBACK"); return res.status(500).json({...}); }
                db.run("COMMIT");  // ← COMMIT 和 log/res.json 在同一层级
                log(...);
                res.json({...});
            });
        });
    });
});
```

**问题**: `COMMIT` 是异步的，但 `log()` 和 `res.json()` 在 `COMMIT` 回调之外执行。如果 `COMMIT` 失败，响应已经发送。

**建议**:
```javascript
db.run("COMMIT", (commitErr) => {
    if (commitErr) { db.run("ROLLBACK"); return res.status(500).json({...}); }
    log(...);
    res.json({...});
});
```

#### B2: CSRF 保护缺失

所有状态变更接口（POST/PUT/DELETE）缺少 CSRF 防护。虽然 JWT 认证提供了一定保护（攻击者无法读取 token），但结合 XSS 漏洞仍可能被利用。

**建议**: 引入 `csurf` 中间件，或确保 CORS 配置在生产环境严格限制 `origin`。

#### B3: 生产环境 CORS 默认 `*`

`env.js` 第 8 行：
```javascript
const CORS_ORIGIN = process.env.CORS_ORIGIN || (IS_PRODUCTION ? false : '*');
```

生产环境默认值为 `false`（即不允许任何跨域），这是安全的。但需确保部署时**显式设置** `CORS_ORIGIN` 环境变量，否则前端可能无法正常工作。

**建议**: 在部署文档中强调此配置，并考虑在 `env.js` 中增加生产环境的警告日志。

### 🟡 Suggestions — 强烈建议

#### S1: 回调地狱 — admin.js overview 接口

**文件**: `src/routes/admin.js` 第 32-85 行，4 层嵌套回调。

```javascript
// 当前：4 层嵌套
db.get(sql1, [], (err, row) => {
    db.get(sql2, [], (err2, row2) => {
        db.get(sql3, [], (err3, row3) => {
            db.all(sql4, [], (err4, trend) => {
                // ... 终于到业务逻辑了
            });
        });
    });
});
```

**建议**: 使用 `util.promisify` 或封装 Promise 版本的 db 查询：
```javascript
const { promisify } = require('util');
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

router.get('/overview', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const totalUsers = await dbGet('SELECT COUNT(*) as total FROM users');
        const totalRecords = await dbGet('SELECT COUNT(*) as total FROM records WHERE is_deleted = 0');
        // ...
    } catch (err) {
        res.status(500).json({ error: '查询失败' });
    }
});
```

#### S2: 排序逻辑重复

**文件**: `src/routes/records.js` 第 21-31 行 和 第 44-54 行，父子记录排序逻辑完全相同。

**建议**: 提取为 `sortRecords(records, sortBy, sortOrder)` 工具函数。

#### S3: parseInt 缺少基数参数

多处使用 `parseInt(req.query.page)` 而未指定基数。

```javascript
// ✅ 正确
const page = parseInt(req.query.page, 10) || 1;
```

虽然现代引擎默认十进制，但明确指定是最佳实践。

#### S4: 缺少测试套件

项目完全没有测试（`npm test` 直接报错退出）。对于涉及金融计算（日均成本、折旧）的系统，测试是必须的。

**优先级建议**:
1. 先写 `treeHelper.js` 的单元测试（核心算法）
2. 再写 `auth` 和 `records` 路由的集成测试
3. 最后补充统计和 TOTP 模块

#### S5: `simulateCostAtDate` 函数位置不当

**文件**: `src/routes/stats.js` 第 104-131 行

该函数定义在路由处理函数内部，每次请求都会重新创建。应提取到 `src/utils/` 或文件顶部。

#### S6: 数据库迁移无版本管理

当前使用 `ALTER TABLE ADD COLUMN` + 忽略错误的方式做迁移。虽然对 SQLite 项目可接受，但当迁移逻辑复杂化后容易出问题。

**建议**: 考虑引入简单的 schema 版本号机制：
```javascript
const SCHEMA_VERSION = 5;
db.get('PRAGMA user_version', (err, row) => {
    if (row.user_version < SCHEMA_VERSION) {
        // 执行迁移...
        db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }
});
```

#### S7: 前端 `public/script.js` 过于庞大

2500+ 行的单体文件，应按功能拆分：
- `auth.js` — 登录/注册/密码
- `records.js` — 记录 CRUD
- `dashboard.js` — 图表和统计
- `modals.js` — 弹窗逻辑
- `utils.js` — 通用工具函数

### 💭 Nits — 锦上添花

#### N1: 错误消息可统一为常量

```javascript
// src/constants/messages.js
const ERROR_MESSAGES = {
    UNAUTHORIZED: '请先登录',
    FORBIDDEN: '权限不足',
    NOT_FOUND: '记录不存在',
    SERVER_ERROR: '服务器内部错误',
    // ...
};
```

#### N2: console.log 应替换为结构化日志

生产环境使用 `console.log` 不利于日志收集和分析。可考虑引入 `pino` 或 `winston`。

#### N3: `public/script.js` 中的 `fetch` 调用缺少统一的错误处理

多处 `fetch` 调用的错误处理逻辑重复，可提取为 `api.js` 工具模块：
```javascript
async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
        headers: { 'Authorization': `Bearer ${getToken()}`, ...options.headers },
        ...options
    });
    if (!res.ok) throw new ApiError(res.status, await res.json());
    return res.json();
}
```

---

## 四、审查 Checklist 模板

审查者可复制以下模板用于每次 Review：

```markdown
## Code Review — [PR 标题]

### 审查概要
- **改动范围**: [文件列表]
- **改动类型**: Feat / Fix / Refactor / ...
- **总体评价**: [一句话]

### 安全性
- [ ] SQL 全部参数化，无拼接
- [ ] 路由有正确的认证/授权中间件
- [ ] 用户输入有校验
- [ ] 无敏感数据泄露

### 正确性
- [ ] 错误处理完整
- [ ] 事务使用正确
- [ ] 边界条件处理
- [ ] 数据类型正确

### 可维护性
- [ ] 命名清晰
- [ ] 无明显重复代码
- [ ] 函数长度合理
- [ ] 关键逻辑有注释

### 性能
- [ ] 无 N+1 查询
- [ ] 大数据量场景考虑分页
- [ ] 索引覆盖高频查询

### 测试
- [ ] 新功能有对应测试
- [ ] 修复的 Bug 有回归测试

### 评论
[具体问题和建议]
```

---

## 五、快速参考卡片

### 安全清单（每次提交必查）

```
✓ SQL 参数化        — 绝不拼接字符串
✓ 认证中间件        — 所有 /api 路由
✓ 用户 ID 校验      — 只操作自己的数据
✓ 输入类型检查      — 使用前校验
✓ XSS 防护          — textContent > innerHTML
✓ 生产环境配置      — JWT_SECRET 必须修改
```

### 常见反模式（避免）

```javascript
// ❌ 1. 忽略错误
db.run(sql, [], () => {});  // 空回调吞掉错误

// ❌ 2. 同步文件读取在请求处理中
const data = fs.readFileSync(path);  // 阻塞事件循环

// ❌ 3. 全局变量污染
var currentUser = null;  // 并发请求会互相覆盖

// ❌ 4. 硬编码魔法数字
if (password.length < 6) ...  // 应提取为常量 MIN_PASSWORD_LENGTH

// ❌ 5. 深层嵌套回调
db.get(..., (err) => {
    db.get(..., (err) => {
        db.get(..., (err) => {  // 3+ 层 → 用 async/await
```

---

## 六、ESLint 现有规则参考

项目已配置的 ESLint 规则（`.eslintrc.json`）：

| 规则 | 级别 | 说明 |
|------|------|------|
| `eqeqeq` | error | 必须使用 `===` 严格相等 |
| `no-var` | warn | 禁止 `var`，使用 `let`/`const` |
| `prefer-const` | warn | 不重新赋值时使用 `const` |
| `no-undef` | error | 禁止未声明变量 |
| `no-redeclare` | error | 禁止重复声明 |
| `no-unused-vars` | warn | 禁止未使用变量（`_` 前缀除外） |
| `no-throw-literal` | error | 禁止抛出非 Error 对象 |
| `curly` | warn | 多行语句必须用 `{}` |

---

*最后更新: 2026-06-25*
*适用范围: DayCost 项目所有后端 (Node.js/Express) 和前端 (Vanilla JS) 代码*
