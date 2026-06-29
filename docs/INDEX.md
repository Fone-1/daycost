# DayCost 项目文档索引

> 本索引帮助你快速定位 docs/ 目录下所有设计文档。按类别组织，每个文档附带简要描述。

---

## 架构设计

| 文档 | 描述 |
|------|------|
| [v1.1-architecture-design.md](v1.1-architecture-design.md) | DayCost v1.1 完整架构设计方案，涵盖前后端模块拆分、安全加固、UX 功能规划 |
| [data-flow-design.md](data-flow-design.md) | 数据流设计文档，描述记录 CRUD、统计计算、树形聚合的数据流转 |
| [ux-architecture-overview.md](ux-architecture-overview.md) | 前端 UX 架构总览，模块拆分策略与组件交互关系 |
| [ux-architecture-redesign.md](ux-architecture-redesign.md) | 前端架构重设计方案，ES Module 拆分与 SPA 路由策略 |

## 产品审视

| 文档 | 描述 |
|------|------|
| [product-review.md](product-review.md) | 产品审视报告，分析现有功能痛点与 v1.1 改进方向 |
| [ui-audit-report.html](ui-audit-report.html) | UI 审查报告（HTML 可视化版），列出现有界面问题和改进建议 |

## 管理员设计

| 文档 | 描述 |
|------|------|
| [design-admin-panel.md](design-admin-panel.md) | 管理后台面板设计方案，功能模块与权限模型 |
| [admin-page-redesign.md](admin-page-redesign.md) | 管理员页面重设计细节方案 |
| [design-settings-redesign.md](design-settings-redesign.md) | 设置页面重设计方案，TOTP 管理与个人偏好设置 |

## 安全审计

| 文档 | 描述 |
|------|------|
| [SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md) | 安全审计报告，涵盖 CSRF、密码复杂度、JWT、XSS 等安全加固措施 |

## 代码质量

| 文档 | 描述 |
|------|------|
| [code-review-standards.md](code-review-standards.md) | 代码审查标准与最佳实践 |

## 性能优化

| 文档 | 描述 |
|------|------|
| [optimization_blueprint.md](optimization_blueprint.md) | 性能优化蓝图，前端加载优化与后端查询优化策略 |

## 序列图（Mermaid）

| 文档 | 描述 |
|------|------|
| [sequence-csrf-flow.mermaid](sequence-csrf-flow.mermaid) | CSRF 双重提交 Cookie 流程序列图 |
| [sequence-onboarding.mermaid](sequence-onboarding.mermaid) | 新手引导流程序列图 |
| [sequence-ranking.mermaid](sequence-ranking.mermaid) | 排行榜数据加载与渲染序列图 |
| [sequence-share-card.mermaid](sequence-share-card.mermaid) | 分享卡片生成与导出序列图 |
| [sequence-totp-codes.mermaid](sequence-totp-codes.mermaid) | TOTP 验证码面板交互序列图 |

## 类图与依赖图（Mermaid）

| 文档 | 描述 |
|------|------|
| [class-diagram.mermaid](class-diagram.mermaid) | 后端核心模块类图 |
| [task-dependency-graph.mermaid](task-dependency-graph.mermaid) | 任务依赖关系图 |
