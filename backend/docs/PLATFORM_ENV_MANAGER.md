# Platform environment manager (internal)

Super Admins can store **environment variable overrides** in MongoDB (`settings` collection, `key: platform_env_overrides`) via **Admin → Environment** in the web app.

## Behavior

1. On process start, `config/load-env.js` loads **`backend/.env`** into `process.env`.
2. After MongoDB pings successfully, the server runs **`applyPlatformEnvOverridesFromDatabase()`** and sets `process.env` for each stored key (same names as normal env vars).
3. **Database values override file values** for matching keys.
4. **`CONNECTION_STRING` / `MONGODB_URI` / `MONGO_URL`** cannot be managed here (bootstrap).

## API (Super Admin JWT only)

| Method | Path | Body |
|--------|------|------|
| `GET` | `/api/admin/platform-env` | — |
| `PUT` | `/api/admin/platform-env` | `{ "key": "FINNHUB_API_KEY", "value": "..." }` |

- Empty `value` **removes** the database row for that key and **`delete`s `process.env[key]`**. It does **not** re-read `.env` until the next process restart.
- Removing an override when none exists returns **400**.

## Security

- **Super Admin** role only (`superadmin` / `super_admin`).
- List endpoint returns **masked** effective values only.
- Audit log action: `platform_env_set` (key, cleared flag, timestamp — not the secret).

## Operational notes

- **Market feeds** (`runFinnhubWebSocket`, `runTwelveDataWebSocket`, `runQuotePoller`) start **after** overrides are applied on startup, so API keys stored only in the DB still work for those paths.
- Early `console.log` lines in `src/index.js` that run at module load may still reflect **.env only** (before Mongo).
- For keys read once at import time elsewhere, prefer **restart** after changes.

## Key files

- `backend/modules/admin/platform-env.repository.js`
- `backend/modules/admin/platform-env.service.js`
- `backend/modules/admin/admin.controller.js` — `getPlatformEnv`, `putPlatformEnv`
- `backend/modules/admin/admin.routes.js` — `/platform-env` + `requireSuperAdmin`
- `backend/src/index.js` — `applyPlatformEnvOverridesFromDatabase()` after Mongo ping
- `frontend-web/src/pages/admin/AdminPlatformEnv.jsx`
