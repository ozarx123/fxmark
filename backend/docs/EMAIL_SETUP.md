# Email verification and notifications

The backend uses **Gmail SMTP** (via Nodemailer) for:

1. **Email verification** — On signup, users receive a “Verify your email” message with a link. Login requires verified email. Resend is available via `POST /api/auth/resend-verification-email`.
2. **Notifications** — The notification service can send emails to users (e.g. support tickets, alerts) when the `email` channel is used.

## Configuration

Set these in `.env` (project root or `backend/.env`; root is loaded first, then backend overrides):

| Variable | Required | Description |
|----------|----------|-------------|
| `GMAIL_USER` | Yes | Gmail address that sends mail (e.g. `you@gmail.com`) |
| `GMAIL_APP_PASSWORD` | Yes | Gmail [App Password](https://support.google.com/accounts/answer/185833) (16 chars; spaces are stripped automatically) |
| `API_URL` | Yes for verification | Backend base URL used in verification links (e.g. `http://localhost:3000` or `https://api.yourdomain.com`) |
| `FROM_EMAIL` | No | From address (defaults to `GMAIL_USER`) |
| `FROM_NAME` | No | From display name (default: `FXMARK`) |

## Gmail App Password

1. Google Account → **Security** → enable **2-Step Verification**.
2. **Security** → **2-Step Verification** → **App passwords** → create one for “Mail” / “Other (Custom name)”.
3. Put the 16-character password in `GMAIL_APP_PASSWORD` (with or without spaces; spaces are removed).

## Verification flow

- **Register**: `POST /api/auth/register` → sends verification email (if Gmail is configured).
- **Verify**: User clicks link → `GET /api/auth/verify-email?token=...` → marks email verified.
- **Resend**: `POST /api/auth/resend-verification-email` with body `{ "email": "user@example.com" }`.

If `GMAIL_USER` or `GMAIL_APP_PASSWORD` is missing, verification emails are skipped (registration still succeeds; you can mark users verified manually or via `scripts/verify-email.js`).

## Notifications

`notification.service.js` sends to a user’s email when the channel is `'email'`. Support/ticket flows can call it; no extra env is needed beyond the Gmail vars above.
