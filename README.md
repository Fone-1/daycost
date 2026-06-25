<p align="center">
  <img src="public/icon-512.png" alt="DayCost Logo" width="150">
</p>

<h1 align="center">DayCost</h1>

<p align="center">
  <strong>买得起，不一定用得起；放着吃灰，才是最昂贵的代价。</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#api-概览">API</a> •
  <a href="#docker-部署">Docker</a> •
  <a href="#贡献">贡献</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-ISC-green" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js">
  <img src="https://img.shields.io/badge/SQLite-3-blue" alt="SQLite">
</p>

---

## 什么是 DayCost？

DayCost 是一款极简风格的个人资产追踪与日均成本分析工具。它不只是记账——它帮你直面一个扎心的事实：**你买来的每一件东西，每天到底在花你多少钱？**

通过「微积分摊销」的核心算法，配合生命周期管理、树形组合嵌套和可视化统计，DayCost 为你呈现一份实时更新的、极其真实的个人财务报表。

---

## 功能特性

### ⚡ 核心算法

- **日均成本追踪** — 购买总价 ÷ 实际拥有天数 = 日均耗散率（￥/天）
- **折旧计算** — 支持直线法与双倍余额递减法，SQL 视图实时计算
- **树形组合** — 支持父子层级关系（如：显卡、CPU → 归属到「电脑」），实时聚合

### 🎯 生命周期管理

| 状态 | 说明 |
|------|------|
| 🟢 使用中 | 正常计费，时间同步流逝 |
| 🔴 已损坏 | 成本锁定，沉没成本不再摊薄 |
| 🟡 已售出 | 填入回血金额，自动计算净花费与真实日均 |

### 📊 可视化仪表盘

- **资金总投入** — 你在所有资产上砸了多少钱
- **当前每日总耗** — 每天无形中蒸发多少
- **趋势折线图** — 日均成本随时间的变化曲线
- **分类饼图** — 各类资产的资金占比

### 🔧 实用功能

- **回收站** — 误删可恢复，30 天后自动清理
- **数据导入导出** — 支持 CSV 导出与 JSON 备份/恢复
- **TOTP 验证器** — 内置 TOTP 管理功能，支持二维码扫描
- **管理员后台** — RBAC 权限管理，管理员可查看和删除用户
- **PWA 支持** — 可添加到手机主屏幕，离线可用
- **主题切换** — 深色/浅色/跟随系统

---

## 快速开始

### 本地开发

```bash
# 克隆项目
git clone <your-repo-url> daycost
cd daycost

# 安装依赖
npm install

# 启动服务（默认端口 80，可通过 PORT 环境变量修改）
PORT=3000 npm start
```

浏览器访问 `http://localhost:3000`，注册账号即可使用。

### Docker 部署（推荐）

```bash
docker-compose up -d --build
```

服务将在 `http://localhost:4567` 启动。数据库文件持久化在 `./data` 目录。

> **首次部署请务必修改 `JWT_SECRET`！**

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | HTML5 / Vanilla JavaScript (ES6+) / CSS3 / Chart.js / Clusterize.js |
| 后端 | Node.js + Express 5 |
| 数据库 | SQLite3 (WAL 模式) |
| 认证 | JWT + bcrypt |
| 安全 | Helmet / express-rate-limit / XSS 清洗 / CORS |
| 容器化 | Docker + Docker Compose |

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `80` | 服务监听端口 |
| `JWT_SECRET` | `daycost_dev_secret_key_999` | JWT 签名密钥（生产环境**必须**修改） |
| `DB_PATH` | `./data.db` | SQLite 数据库文件路径 |
| `CORS_ORIGIN` | `*` | 允许的跨域来源 |
| `NODE_ENV` | — | 设为 `production` 时强制要求 `JWT_SECRET` 非默认值 |
| `TOTP_KEY` | 由 JWT_SECRET 派生 | AES-256 加密密钥，用于 TOTP 密钥加密存储 |

---

## API 概览

### 认证

```bash
# 注册
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123456"}'

# 登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123456"}'
```

### 资产记录

```bash
# 添加资产
curl -X POST http://localhost:3000/api/records \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"item_name":"MacBook Pro","price":14999,"purchase_date":"2024-01-15"}'

# 获取列表
curl http://localhost:3000/api/records \
  -H "Authorization: Bearer <token>"
```

### 完整 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/register` | 注册 |
| `POST` | `/api/auth/login` | 登录 |
| `PUT` | `/api/auth/password` | 修改密码 |
| `GET` | `/api/records` | 获取资产列表（支持过滤与排序） |
| `POST` | `/api/records` | 新增资产 |
| `PUT` | `/api/records/:id` | 更新资产 |
| `DELETE` | `/api/records/:id` | 删除资产（移入回收站） |
| `POST` | `/api/records/import` | 批量导入 |
| `GET` | `/api/records/trash` | 查看回收站 |
| `POST` | `/api/records/restore/:id` | 恢复 |
| `DELETE` | `/api/records/purge/:id` | 永久删除 |
| `GET` | `/api/stats` | 全局统计数据 |
| `GET` | `/api/stats/trend` | 日均成本趋势 |
| `GET` | `/api/stats/pie` | 分类占比 |
| `GET` | `/api/totp` | 获取 TOTP 列表 |
| `GET` | `/api/totp/codes` | 获取当前验证码 |
| `POST` | `/api/totp` | 添加 TOTP |
| `GET` | `/api/admin/users` | 用户列表（管理员） |
| `DELETE` | `/api/admin/user/:id` | 删除用户（管理员） |

---

## Docker 部署详解

`docker-compose.yml` 采用了挂载策略，方便开发和热更新：

- `./data:/data` — 数据库持久化
- `./public:/usr/src/app/public` — 前端文件热更新（无需重建镜像）
- `./src:/usr/src/app/src` — 后端源码热更新（`docker-compose restart app` 即可生效）
- `/usr/src/app/node_modules` — 保护容器内编译的原生依赖不被覆盖

### Azure 部署

- **Azure App Service**：在环境变量中设置 `JWT_SECRET`，通过 Azure Files 挂载持久化数据库
- **Azure VM**：直接拉取代码，`docker-compose up -d` 即可

---

## 项目结构

```
daycost/
├── server.js                # Express 应用入口
├── src/
│   ├── config/
│   │   ├── env.js           # 环境变量集中管理
│   │   └── db.js            # SQLite 连接、Schema 建表、自动迁移
│   ├── middlewares/
│   │   ├── auth.js          # JWT 认证 + RBAC 权限中间件
│   │   ├── xssClean.js      # XSS 输入清洗
│   │   └── rateLimit.js     # 接口限流
│   ├── routes/
│   │   ├── auth.js          # 注册 / 登录 / 改密
│   │   ├── records.js       # 资产 CRUD / 回收站 / 导入
│   │   ├── stats.js         # 统计数据 / 趋势 / 饼图
│   │   ├── admin.js         # 管理员用户管理
│   │   └── totp.js          # TOTP 验证器 CRUD
│   └── utils/
│       └── treeHelper.js    # 树形结构过滤与成本聚合引擎
├── public/
│   ├── index.html           # 单页应用入口
│   ├── script.js            # 前端核心逻辑
│   ├── style.css            # 样式（Financial Noir 琥珀金主题）
│   ├── js/
│   │   ├── toast.js         # Toast 通知系统
│   │   ├── state-manager.js # 状态管理
│   │   ├── quick-add.js     # 快速添加组件
│   │   ├── inline-editor.js # 内联编辑器
│   │   └── batch-manager.js # 批量操作管理器
│   └── sw.js                # Service Worker（PWA 离线支持）
├── docker-compose.yml       # Docker 编排配置
├── Dockerfile               # Docker 镜像构建
└── data.db                  # SQLite 数据库（运行时生成）
```

---

## 贡献

欢迎贡献！请遵循以下步骤：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

请确保：
- 代码通过 ESLint 检查 (`npm run lint`)
- 新功能有对应的测试
- 更新相关文档

---

## 许可证

[ISC](LICENSE) © DayCost
