# Email verification and notifications (Gmail)

The backend uses **Gmail SMTP** (via Nodemailer, `service: 'gmail'`) for:

1. **Email verification** — On signup, users receive a “Verify your email” message with a link. Login requires verified email. Resend is available via **`POST /api/auth/resend-verification`** (not GET — opening the URL in a browser will show 405).
2. **Notifications** — The notification service can send emails when the channel is `'email'`.

## Configuration

Set these in **`backend/.env`**. The API server loads **only** `backend/.env` (there is no repo-root `.env` for the backend).

| Variable | Required | Description |
|----------|----------|-------------|
| `GMAIL_USER` | Yes | Gmail address that sends mail |
| `GMAIL_APP_PASSWORD` | Yes | Google [App Password](https://support.google.com/accounts/answer/185833) (16 characters; spaces are stripped automatically) |
| `FRONTEND_URL` | **Yes in production** | Public site origin (no trailing slash), e.g. `https://fxmarktrade.com`. Verification emails link to `{FRONTEND_URL}/verify-email?token=…`. In development defaults to `http://localhost:5173`. |
| `WEB_APP_URL` | No | Alias for `FRONTEND_URL` if you prefer that name |
| `API_URL` | Yes | Backend base URL (e.g. `http://localhost:3000`) — used for API clients, **not** for the verification link in email |
| `EMAIL_VERIFICATION_EXPIRY_MS` | No | Token lifetime in ms (default `3600000` = 1 hour) |
| `FROM_EMAIL` | No | From address (defaults to `GMAIL_USER`) |
| `FROM_NAME` | No | Display name (default: `FXMARK`) |

## Gmail App Password

1. Google Account → **Security** → enable **2-Step Verification**.
2. **Security** → **App passwords** → create one for Mail.
3. Put the 16-character password in `GMAIL_APP_PASSWORD` (with or without spaces).

## How to test

1. Set `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `API_URL`, and `FRONTEND_URL` (production: your real domain).
2. Start the API — look for `[env] Gmail: … (configured)`.
3. **Send test:**  
   `node backend/scripts/test-email.js you@example.com`  
   or from `backend/`: `npm run test:email -- you@example.com`

### Resend verification from Windows PowerShell

Do **not** use `curl ... -d "{\"email\":...}"` — PowerShell often corrupts the JSON (`Expected property name or '}' at position 1`) and line breaks can trigger `curl: (3) URL rejected: Bad hostname`.

**Option A — helper script**

From **repo root** (`fxmark`):

```powershell
.\scripts\resend-verification-local.ps1 -Email "you@example.com"
```

From **`backend/`**:

```powershell
.\scripts\resend-verification-local.ps1 -Email "you@example.com"
```

**Option B — `Invoke-RestMethod`:**

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/resend-verification" `
  -ContentType "application/json; charset=utf-8" `
  -Body '{"email":"you@example.com"}'
```

**Option C — `curl.exe` with single-quoted JSON (one line, no backslashes):**

```powershell
curl.exe -X POST http://localhost:3000/api/auth/resend-verification -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

## Verification flow

- **Register** → email contains **`{FRONTEND_URL}/verify-email?token=…`** (opens the web app).
- **SPA** → `POST /api/auth/verify-email` with JSON `{ "token": "…" }` (the page does this automatically).
- **Old links** that pointed at `GET /api/auth/verify-email?token=…` → server **302 redirects** to the same path on `FRONTEND_URL`.
- **Resend** → `POST /api/auth/resend-verification` with `{ "email": "..." }` (issues a new token on the user record and sends a new email).

If `GMAIL_USER` or `GMAIL_APP_PASSWORD` is missing, verification emails are skipped (registration still succeeds).

## Notifications

`notification.service.js` uses the same Gmail transport when the channel is `'email'`.
