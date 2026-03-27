# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

FXMARK is a forex/CFD broker platform. The active development focus is on the **Flutter mobile app** (`mobile-flutter/`). The desktop/web frontend (`frontend-web/`) is already production-ready.

### Services

| Service | Port | How to start |
|---------|------|-------------|
| MongoDB 7 | 27017 | `sudo mongod --dbpath /data/db --fork --logpath /var/log/mongod.log` |
| Backend API | 3000 | `cd backend && npm run dev` |
| Flutter mobile (web) | 8080 | `cd mobile-flutter && flutter run -d web-server --web-port 8080` |

### Mobile App (Flutter)

- Location: `mobile-flutter/`
- Flutter SDK is installed at `/opt/flutter` and added to PATH via `~/.bashrc`.
- The app is currently a minimal stub (`lib/main.dart`). `pubspec.yaml` includes `http`, `provider`, `shared_preferences`, and `web_socket_channel` for backend integration.
- Run `flutter pub get` in `mobile-flutter/` before any Flutter command.
- **Lint**: `flutter analyze` (zero issues required).
- **Test**: `flutter test` in `mobile-flutter/`.
- **Build web**: `flutter build web` in `mobile-flutter/`.
- **Run web dev**: `flutter run -d web-server --web-port 8080` in `mobile-flutter/`.
- No Android/iOS emulator available in cloud; use the web target (`-d web-server` or `-d chrome`) for testing.

### Backend

- See `backend/.env.example` for all env vars. Copy to `backend/.env` for local dev.
- `CONNECTION_STRING=mongodb://localhost:27017/fxmark` — always local, never production Atlas.
- `npm run setup-db` seeds test users (alice/bob/admin @test.com, password: `password123`). Their `emailVerified` must be set to `true` in MongoDB to allow login.
- `npm run check-mongo` verifies MongoDB connectivity.
- `npm run test:all` runs the API integration test suite (requires backend running + seeded DB).
- Market data APIs (Twelve Data, Finnhub) are optional — the app runs fine without API keys.
- Redis is optional — falls back to in-memory cache when not configured.

### Gotchas

- The `mobile-flutter/` directory originally had only `lib/main.dart` with no `pubspec.yaml`. The project scaffolding (pubspec.yaml, web/, android/, ios/, test/) was created during environment setup.
- `mobile-app/` is a separate JS-based stub (React Native-style), not the Flutter app.
- `apps/mobile/` is a README-only placeholder for a future planned Flutter app.
- Backend `npm run test:all` reports 1 expected failure on `POST /wallet/deposits` (503) because no payment gateway is configured locally.
