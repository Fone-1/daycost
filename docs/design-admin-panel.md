# Admin Panel Redesign — Design Document

## Overview

Replace the minimal "审计中心" tab with a full-featured, standalone admin panel accessed via hidden route `/admin`. Features: system overview, user management, operation audit logs.

## Architecture

### Entry & Routing

- **URL**: `/admin` (hidden route, not in main nav)
- **Files**: `public/admin.html`, `public/admin.js`, `public/admin.css`
- **Express**: `app.get('/admin', ...)` before catch-all route
- **Auth**: JS checks token + role via `GET /api/auth/profile`, redirects to `/` if not admin

### Layout

```
┌─────────────────────────────────────────────────────┐
│  DayCost 管理面板                    [返回主页] [退出] │
├──────────┬──────────────────────────────────────────┤
│  📊 概览  │                                          │
│  👥 用户  │   （右侧内容区）                          │
│  📋 日志  │                                          │
└──────────┴──────────────────────────────────────────┘
```

- Top bar: title + back to home + logout
- Left sidebar: 3 nav items with active highlight
- Right content area: switches based on sidebar selection
- Visual: Financial Noir dark theme, glass effect, amber accents

## Module 1: System Overview

- 4 stat cards: total users, today's active, total records, uptime
- Chart.js line chart: user registration trend (last 30 days)
- System info: Node.js version, DB size, DayCost version, environment

**Endpoint**: `GET /api/admin/overview`

```json
{
  "stats": { "totalUsers": 12, "todayActive": 3, "totalRecords": 156 },
  "trend": [ { "date": "2026-05-01", "count": 2 }, ... ],
  "system": { "nodeVersion": "v20.12.1", "dbSize": "2.3 MB", "version": "1.0.0", "env": "production" }
}
```

## Module 2: User Management

- Searchable user table with columns: ID, username, role, status, registration date, actions
- Status: 正常 (green) / 已禁用 (red)
- Actions dropdown per row:
  - Reset password → generates 8-char random temp password, displays in modal
  - Disable/enable account
  - Promote/demote admin role
  - Delete user (existing, non-admin only)

**Endpoints**:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/users` | Existing, add `is_disabled` field |
| `PUT` | `/api/admin/user/:id/role` | Toggle role (admin/user) |
| `PUT` | `/api/admin/user/:id/disable` | Toggle disable/enable |
| `POST` | `/api/admin/user/:id/reset-password` | Reset to random temp password |
| `DELETE` | `/api/admin/user/:id` | Existing delete user |

## Module 3: Operation Logs

- Filterable by action type (dropdown) and username (search)
- Columns: time, username, action, detail
- Pagination: 50 per page
- 90-day auto-cleanup (background task)

**Database**: New table `audit_logs`

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    ip TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);
```

**Logged events**:
- `login` — user login success
- `record_create` / `record_update` / `record_delete` — record CRUD
- `admin_reset_pwd` — admin resets user password
- `admin_disable` / `admin_enable` — admin disables/enables account
- `admin_role_change` — admin promotes/demotes user
- `admin_delete_user` — admin deletes user

**Endpoint**: `GET /api/admin/logs?page=1&action=login&user=alice`

```json
{
  "data": [ { "id": 1, "username": "alice", "action": "login", "detail": "", "ip": "192.168.1.1", "created_at": "..." } ],
  "total": 245,
  "page": 1,
  "pages": 5
}
```

## Database Changes

### Users table

```sql
ALTER TABLE users ADD COLUMN is_disabled INTEGER DEFAULT 0;
```

### Audit logs table

```sql
CREATE TABLE IF NOT EXISTS audit_logs ( ... );
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);
```

### Background cleanup

```javascript
setInterval(() => {
    db.run(`DELETE FROM audit_logs WHERE created_at < datetime('now', '-90 days')`);
}, 3600000); // Hourly, same pattern as recycle bin cleanup
```

## Login Guard

In `auth.js` login route, add check:

```javascript
if (user.is_disabled) {
    return res.status(403).json({ error: '账号已被禁用，请联系管理员' });
}
```

## Removal of Old Admin Tab

- Remove `<button class="nav-btn hidden admin-nav-btn" id="navAdminBtn" ...>` from index.html
- Remove `loadAdminUsers()`, `deleteAdminUser()` from script.js
- Remove `#pane-admin` HTML section from index.html
- Remove admin tab visibility logic from `checkAuth()`
- Keep `src/routes/admin.js` and enhance it

## Decision Log

| # | Decision | Alternatives | Rationale |
|---|----------|-------------|-----------|
| 1 | Standalone admin page | SPA embed, modal overlay | Clean separation, no main SPA bloat |
| 2 | Hidden `/admin` route | Nav tab, settings entry | Security, no UI exposure |
| 3 | Sidebar sub-nav | Top tabs, single page | Standard admin layout, extensible |
| 4 | All user key ops logs | Admin-only, full API | Balance audit needs vs data volume |
| 5 | 90-day log retention | Forever, 30 days | Reasonable data lifecycle |
| 6 | 8-char random temp password | No reset, email reset | Simple, no email dependency |
| 7 | `is_disabled` column | Delete account, lock pw | Reversible, preserves data |
| 8 | Reuse Chart.js | New chart lib | Zero extra dependency |
