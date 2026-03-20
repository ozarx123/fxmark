# FXMARK web client (Vite + React)

## Dev

```bash
cd frontend-web
npm install
npm run dev
```

Opens **http://localhost:5173**. API calls use `/api` → proxied to **http://localhost:3000** (see `vite.config.js`). Start the backend first:

```bash
cd backend
npm run dev
```

## Test email verification page

1. Backend running on port **3000**, MongoDB reachable.
2. Generate a one-time link (from **backend** folder):

   ```bash
   cd ../backend
   npm run test:frontend-verify
   ```

3. Start (or keep) the frontend: `npm run dev` in `frontend-web/`.
4. Copy the printed URL (`http://localhost:5173/verify-email?token=...`) into the browser.
5. You should see **Verifying…** then **success** (or sign-in prompt if not logged in).

Optional: set `VITE_API_URL=http://localhost:3000/api` in `frontend-web/.env.local` if you don’t use the Vite proxy.

## Build

```bash
npm run build
npm run preview
```
