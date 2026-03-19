# Email verification and notifications (Gmail)

The backend uses **Gmail SMTP** (via Nodemailer, `service: 'gmail'`) for:

1. **Email verification** — On signup, users receive a “Verify your email” message with a link. Login requires verified email. Resend is available via `POST /api/auth/resend-verification-email`.
2. **Notifications** — The notification service can send emails when the channel is `'email'`.

## Configuration

Set these in `.env` (`backend/.env` and/or repo root `.env`; root overrides shared keys when both load):

| Variable | Required | Description |
|----------|----------|-------------|
| `GMAIL_USER` | Yes | Gmail address that sends mail |
| `GMAIL_APP_PASSWORD` | Yes | Google [App Password](https://support.google.com/accounts/answer/185833) (16 characters; spaces are stripped automatically) |
| `API_URL` | Yes for verification | Backend base URL used in verification links |
| `FROM_EMAIL` | No | From address (defaults to `GMAIL_USER`) |
| `FROM_NAME` | No | Display name (default: `FXMARK`) |

## Gmail App Password

1. Google Account → **Security** → enable **2-Step Verification**.
2. **Security** → **App passwords** → create one for Mail.
3. Put the 16-character password in `GMAIL_APP_PASSWORD` (with or without spaces).

## How to test

1. Set `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `API_URL`.
2. Start the API — look for `[env] Gmail: … (configured)`.
3. **Send test:**  
   `node backend/scripts/test-email.js you@example.com`  
   or from `backend/`: `npm run test:email -- you@example.com`

## Verification flow

- **Register** → verification email (if Gmail is configured).
- **Verify** → `GET /api/auth/verify-email?token=...`
- **Resend** → `POST /api/auth/resend-verification-email` with `{ "email": "..." }`

If `GMAIL_USER` or `GMAIL_APP_PASSWORD` is missing, verification emails are skipped (registration still succeeds).

## Notifications

`notification.service.js` uses the same Gmail transport when the channel is `'email'`.
