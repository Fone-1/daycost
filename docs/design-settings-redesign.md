# Settings Page Redesign — Design Document

## Overview

Redesign DayCost's settings page from a minimal 3-card layout to a "Personal Center" style with a profile card, editable user info, and structured settings groups.

## Layout

### Profile Card (top)

```
┌─────────────────────────────────────────┐
│  ┌──────┐                               │
│  │ 头像  │  昵称 / 用户名               │
│  │(圆形) │  个性签名（灰色小字）         │
│  └──────┘                               │
│                                         │
│  [使用天数]  [总资产数]  [服役中物品]    │
│    123天        45件        28件         │
│                                         │
│                    [编辑资料] 按钮       │
└─────────────────────────────────────────┘
```

- Avatar: 80x80px circle, shows user-uploaded image or initial-character fallback
- Stats: three equal columns, large numbers + small labels
- Edit button: bottom-right of card

### Settings Groups (below card)

```
┌─ 账号安全 ─────────────────────────┐
│  🔒 修改密码                        │
└────────────────────────────────────┘

┌─ 外观 ─────────────────────────────┐
│  🎨 主题模式      [跟随系统 ▾]      │
└────────────────────────────────────┘

┌─ 数据管理 ─────────────────────────┐
│  📤 导出 CSV 报表                   │
│  💾 导出 .daycost 备份              │
│  📥 导入 .daycost 备份              │
└────────────────────────────────────┘

┌─ 关于 ─────────────────────────────┐
│  ℹ️  DayCost v1.0.0                │
│  GitHub → Fone-1/daycost            │
└────────────────────────────────────┘
```

## Edit Profile Modal

```
┌─ 编辑个人资料 ────────────────────────┐
│       ┌──────┐                         │
│       │ 头像  │  [更换头像] [移除头像]  │
│       └──────┘                         │
│  昵称    [________________]            │
│  邮箱    [________________]            │
│  个性签名 [________________]            │
│            [取消]  [保存]              │
└────────────────────────────────────────┘
```

## Avatar Handling

1. Click "更换头像" → file picker (jpg/png/webp, max 2MB)
2. Frontend compresses to 200x200 → uploads to `POST /api/auth/avatar`
3. Backend stores as `./uploads/avatars/{user_id}.webp`
4. Fallback: initial character from nickname/username, colored by name hash from a 6-color warm palette
5. Avatar URL includes timestamp cache-buster

## Database Changes

New columns on `users` table (inline migration, same pattern as existing):

```sql
ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN email TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN bio TEXT DEFAULT '';
```

## API Endpoints

All in `src/routes/auth.js`, using existing `authenticateToken` middleware.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/profile` | Get current user profile + stats |
| `PUT` | `/api/auth/profile` | Update nickname/email/bio |
| `POST` | `/api/auth/avatar` | Upload avatar (multipart/form-data) |
| `DELETE` | `/api/auth/avatar` | Remove avatar |

### `GET /api/auth/profile` Response

```json
{
  "username": "fhj",
  "nickname": "风华绝代",
  "avatar": "/uploads/avatars/1.webp?t=1716700000",
  "email": "fhj@example.com",
  "bio": "买得起，不一定用得起",
  "role": "admin",
  "created_at": "2024-01-15",
  "stats": {
    "daysSinceRegistration": 497,
    "totalAssets": 45,
    "activeAssets": 28
  }
}
```

## Frontend Module: `public/settings.js`

Responsibilities:
- `initSettings()` — page init, fetch profile, render card
- `renderProfileCard(user)` — render avatar, nickname, stats
- `openEditProfileModal()` — modal logic, form fill & submit
- `handleAvatarUpload(file)` — validate, compress, upload
- `getInitialAvatar(name)` — generate initial-character avatar DOM
- `renderSettingsGroups()` — render 4 setting group cards

Loaded via `<script src="settings.js">`, key functions on `window` for `script.js` to call.

## Non-Goals

- No email verification flow
- No password recovery
- No notification system
- TOTP stays as a separate top-level tab
- No account deletion

## Decision Log

| # | Decision | Alternatives | Rationale |
|---|----------|-------------|-----------|
| 1 | Personal center layout | Pure tool, App settings | Balance features vs complexity |
| 2 | Profile Card + list | Sidebar, optimize existing cards | Clear visual hierarchy |
| 3 | All 4 profile fields | Partial fields | User explicitly requested all |
| 4 | Upload + initial fallback | Preset only, initial only | Flexibility + lightweight fallback |
| 5 | Modal editing | Inline, per-field | Complete flow, avoids misclicks |
| 6 | TOTP stays independent tab | Merge into settings | Avoid bloating settings page |
| 7 | Split settings.js | Single file, full split | Separation of concerns, backend too small to split |
| 8 | Extend auth.js | New profile.js | Auth route is light, profile belongs to user module |
| 9 | 4 setting groups | 3, none | "About" has value at near-zero cost |
| 10 | File system for avatars | DB BLOB | Better for binary objects, avoids DB bloat |
