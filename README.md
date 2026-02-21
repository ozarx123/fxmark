# FXMARK

**FXMARK** is a forex trading platform with a Node.js backend, web and admin frontends, and a Flutter mobile app.

## Project structure

| Directory        | Stack        | Description                    |
|-----------------|--------------|--------------------------------|
| `backend/`      | Node.js, Express | API server (finance, ledger, journal) |
| `frontend-web/` | JavaScript   | Web trading client             |
| `frontend-admin/` | JavaScript | Admin portal                   |
| `mobile-flutter/` | Flutter   | Mobile app                     |
| `docs/`         | —            | Full system documentation      |

## How to build

### Backend

```bash
cd backend
npm install
npm start
```

- **Entry point (simple):** `npm start` runs `node src/main.js` (standalone Express).
- **Entry point (full app):** run `node core/server.js` for the full stack (config, routes, auth, modules).  
  API runs at **http://localhost:3000**.

**Endpoints:**

- `GET /` — Health check
- `GET /api/health` — Health (core app)
- `GET /finance/ledger` — Finance ledger
- `POST /finance/journal` — Create journal entry (double-entry)

### Frontend (client website)

`frontend-web` has no build tooling by default. To build and run:

1. **Option A — Add a bundler (recommended)**  
   From repo root:
   ```bash
   cd frontend-web
   npm init -y
   npm install react react-dom
   npm install -D vite @vitejs/plugin-react
   ```
   Add a `vite.config.js` and set `src/index.js` as entry (with a root element). Then:
   ```bash
   npm run dev    # dev server
   npm run build  # production build to dist/
   ```

2. **Option B — Static only**  
   Serve the `frontend-web` folder with any static server (e.g. `npx serve frontend-web`).

### Admin frontend

Same as frontend: add a bundler in `frontend-admin` or serve the folder statically.

### Mobile (Flutter)

```bash
cd mobile-flutter
flutter pub get
flutter run
```

For a release build: `flutter build apk` or `flutter build ios`.

### Docker (full stack)

From repo root:

```bash
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d
```

- Backend: **http://localhost:3000**
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Tech stack

- **Backend:** Express, CORS, JSON body parsing  
- **Web / Admin:** JavaScript  
- **Mobile:** Flutter (Dart)  

## Documentation

See [docs/README.md](docs/README.md) for full system documentation.

---

*FXMARK — Forex trading platform*
