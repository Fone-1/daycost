# Contributing to DayCost

> DayCost — 日摊成本计算工具，揭示物品持有期的隐性代价

感谢你对 DayCost 项目的关注！本文档帮助你快速上手开发。

## 开发环境设置

### 前置要求

- **Node.js** ≥ 18（推荐 LTS 版本）
- **npm** ≥ 8
- **Git**

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/daycost/daycost.git
cd daycost

# 安装依赖
npm install

# 配置环境变量
# 1. 创建 .env.local 文件（开发环境专用，不会被 Git 跟踪）
echo "JWT_SECRET=your-dev-secret-change-this" > .env.local
# TOTP_KEY 会在首次启动时自动生成并保存到 .env.local

# 启动开发服务器
npm start
# HTTP 服务默认运行在 http://localhost:80
# HTTPS 服务默认运行在 https://localhost:3443（需要 cert.pem 和 key.pem）
```

### 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `JWT_SECRET` | 是 | 无 | JWT 签名密钥，生产环境必须设置 |
| `TOTP_KEY` | 生产必填 | 自动生成 | AES-256-GCM 加密密钥，必须是 32 UTF-8 字节 |
| `PORT` | 否 | 80 | HTTP 端口 |
| `HTTPS_PORT` | 否 | 3443 | HTTPS 端口 |
| `DB_PATH` | 否 | data.db | SQLite 数据库路径 |
| `NODE_ENV` | 否 | development | 环境标识 |
| `CORS_ORIGIN` | 否 | http://localhost:3000 | CORS 允许源 |

## 代码风格约定

项目使用 **ESLint + Prettier** 保证代码一致性和可读性。

- ESLint 配置：`eslint-config-prettier` 兼容模式，避免格式规则冲突
- Prettier 配置：项目默认配置（2-space 缩进、单引号、无分号尾逗号）
- 格式化命令：`npm run format`
- 检查命令：`npm run lint`

**Pre-commit Hook**（Husky + lint-staged）会在每次 `git commit` 时自动：
1. 对 `src/**/*.js` 和 `public/js/**/*.js` 运行 ESLint --fix + Prettier --write
2. 不通过的代码将被阻止提交

## Git 工作流

### 分支命名

- `main` — 主分支，稳定版本
- `feat/xxx` — 新功能分支
- `fix/xxx` — Bug 修复分支
- `refactor/xxx` — 重构分支
- `docs/xxx` — 文档更新分支

### Commit Message 格式

遵循 Conventional Commits 规范：

```
type(scope): subject

body (optional)
```

**type 类型**：
- `feat`: 新功能
- `fix`: Bug 修复
- `refactor`: 代码重构（不改变功能）
- `docs`: 文档变更
- `style`: 格式调整（不影响逻辑）
- `test`: 测试相关
- `chore`: 构建/工具变更

**示例**：
```
feat(stats): add ranking endpoint
fix(auth): validate password complexity before registration
docs(readme): update installation instructions
```

### 开发流程

```bash
# 1. 从 main 创建功能分支
git checkout main
git pull
git checkout -b feat/my-feature

# 2. 开发 + 测试
npm start    # 启动开发服务器
npm test     # 运行测试

# 3. 提交（husky 自动检查格式）
git add .
git commit -m "feat(my-feature): implement xxx"

# 4. 推送并创建 PR
git push origin feat/my-feature
# 在 GitHub 上创建 Pull Request
```

## 测试

测试框架：**Vitest**

```bash
# 运行所有测试（单次执行）
npm test

# 运行测试（watch 模式，开发时使用）
npm run test:watch
```

- 测试文件位于 `test/` 目录
- 文件命名：`<module-name>.test.js`
- Vitest globals 模式：直接使用 `describe`、`it`、`expect`，无需导入
- 源码引用：`require('../src/utils/xxx')` 或 `require('../src/middlewares/xxx')`
- 测试超时：10 秒（`testTimeout: 10000`）

## PR 提交规范

1. **一个 PR 只做一件事** — 保持变更范围最小化
2. **描述清晰** — PR 标题使用 Conventional Commits 格式，正文说明变更内容和原因
3. **测试覆盖** — 新功能必须附带测试，确保 `npm test` 全部通过
4. **代码格式** — Husky 已在 commit 时自动格式化，无需手动操作
5. **无冲突** — 确保与 main 分支无合并冲突

## 项目结构概要

```
daycost/
├── server.js              # Express 入口
├── vitest.config.js       # 测试配置
├── package.json           # 项目依赖与脚本
├── .env.local             # 开发环境变量（不提交）
├── docs/                  # 设计文档、架构说明
├── public/                # 前端静态文件
│   ├── index.html         # 主页面（ES Module 入口）
│   ├── admin.html         # 管理后台页面
│   ├── css/               # 样式文件
│   │   └── v1.1-features.css  # v1.1 新功能样式
│   └── js/                # 前端 JS（ES Module）
│   │   ├── app.js         # 前端入口模块
│   │   ├── api-client.js  # 统一 HTTP 请求层
│   │   ├── auth-view.js   # 认证视图
│   │   ├── nav-controller.js
│   │   ├── modal-manager.js
│   │   ├── records-view.js
│   │   ├── validators.js  # 前端校验
│   │   ├── onboarding.js  # 新手引导
│   │   ├── empty-state.js # 空状态组件
│   │   ├── ranking-view.js # 排行榜
│   │   ├── share-card.js  # 分享卡片
│   │   └── totp.js        # TOTP 验证码面板
│   └── lib/               # 第三方库（html2canvas 等）
├── src/                   # 后端源码
│   ├── config/
│   │   ├── env.js         # 环境变量配置（JWT、TOTP等）
│   │   └── db.js          # SQLite 数据库连接
│   ├── middlewares/
│   │   ├── auth.js        # JWT 认证中间件
│   │   ├── csrf.js        # Double Submit Cookie CSRF
│   │   ├── rateLimit.js   # 速率限制
│   │   └ xssClean.js      # XSS 清理
│   ├── routes/
│   │   ├── auth.js        # 认证路由（注册/登录/改密）
│   │   ├── records.js     # 记录 CRUD
│   │   ├── stats.js       # 统计/排行榜/趋势
│   │   ├── admin.js       # 管理后台
│   │   ├── totp.js        # TOTP 管理
│   │   └── swagger.js     # Swagger API 文档
│   └── utils/
│       ├── validators.js  # 密码/用户名校验
│       ├── totpHelper.js  # TOTP 生成/加密
│       ├── treeHelper.js  # 树形结构聚合引擎
│       └── auditLog.js    # 操作审计日志
├── test/                  # 测试文件
├── uploads/               # 用户上传（头像等）
└── data.db                # SQLite 数据库文件
```

## 有问题？

- 查看 `docs/` 目录下的架构设计和产品审视文档
- 查看 Swagger API 文档：启动服务器后访问 `/api/docs`
- 提交 Issue：https://github.com/daycost/daycost/issues
