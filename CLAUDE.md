# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DayCost is a personal asset tracker that calculates daily cost-of-ownership for items. It uses a "micro-calculus amortization" algorithm: purchase price / days owned = daily cost rate. The UI language is Chinese (zh-CN).

## Commands

```bash
npm start                    # Start server (default port 80, or PORT env var)
npm run lint                 # Lint with ESLint
docker-compose up -d --build # Docker deployment (port 4567 externally, 80 internally)
```

No test suite exists (`npm test` just exits with error).

## Architecture

**Stack:** Node.js + Express 5, SQLite3 (WAL mode), vanilla JS frontend, Chart.js for visualization.

### Backend (`server.js` + `src/`)

- `server.js` — Express app setup, middleware chain, route mounting, optional HTTPS
- `src/config/env.js` — Centralized env var config (JWT_SECRET, PORT, DB_PATH, etc.). Throws on startup if `NODE_ENV=production` and JWT_SECRET is default.
- `src/config/db.js` — SQLite connection, schema creation via `CREATE TABLE IF NOT EXISTS` + safe `ALTER TABLE` migrations (idempotent), SQL view `v_records_computed` for computed columns (days, dailyCost, currentValue), indexes, and a 1-hour background job that auto-purges soft-deleted records older than 30 days.
- `src/middlewares/auth.js` — JWT auth (`authenticateToken`) and RBAC (`requireAdmin`)
- `src/middlewares/xssClean.js` — Recursive XSS sanitization on req.body/query/params using the `xss` library
- `src/middlewares/rateLimit.js` — Two tiers: `authLimiter` (5 req/15min, skipSuccessfulRequests) and `apiLimiter` (100 req/min)
- `src/routes/` — auth, records, stats, admin, totp route modules
- `src/utils/treeHelper.js` — Tree-aware filtering engine: builds parent-child hierarchy from flat records, aggregates costs up the tree, and filters while preserving parent-child relationships (keeps parent if any child matches)

### Database Schema (key tables)

- `users` — id, username, password_hash, role (user/admin)
- `records` — id, user_id, item_name, price, purchase_date, status (active/broken/sold), end_date, resale_price, parent_id, is_deleted, deleted_at, tags, depreciation_method, expected_lifespan, expected_salvage
- `totp_entries` — id, user_id, label, secret_enc, iv, auth_tag, issuer, digits, group_name

The `v_records_computed` SQL view handles all date math and depreciation calculations (straight-line and double-declining). Use it instead of computing in JS.

### Frontend (`public/`)

- Single-page app in `public/index.html` + `public/script.js` (2500+ lines, monolithic)
- Uses Clusterize.js for virtual scrolling on large lists
- Global functions declared in ESLint config: `showAppAlert`, `showAppConfirm`, `showAppChoice`, `loadAdminUsers`, `toggleChildren`, `openStatusModal`, `deleteRecord`, `restoreRecord`, `purgeRecord`

## Key Patterns

- **Soft delete:** Records have `is_deleted`/`deleted_at` fields. DELETE endpoint soft-deletes; purge permanently removes.
- **Tree aggregation:** Records support `parent_id` for nesting (e.g., GPU under "PC"). Orphan children (deleted parent) are promoted to top-level. `treeHelper.js` handles all tree-aware filtering and cost aggregation.
- **Depreciation:** Two methods supported — `straight_line` and `double_declining`, calculated in SQL via the `v_records_computed` view.
- **Schema migrations:** Done inline in `db.js` via `ALTER TABLE ADD COLUMN` with error swallowing (idempotent). No migration framework.

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `80` | Server listen port |
| `JWT_SECRET` | `daycost_dev_secret_key_999` | **Must** be set in production |
| `DB_PATH` | `./data.db` | SQLite file path |
| `CORS_ORIGIN` | `*` | Allowed origins |
| `TOTP_KEY` | Derived from JWT_SECRET | 32-char AES key for TOTP encryption |
