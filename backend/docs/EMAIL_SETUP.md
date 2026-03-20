# Email verification and notifications (Zoho Mail)

The backend uses **Zoho Mail SMTP** (via Nodemailer) for:

1. **Email verification** — On signup, “Verify your email” links (`FRONTEND_URL/verify-email?token=…`). Resend: `POST /api/auth/resend-verification`.
2. **Notifications** — When the notification channel is `'email'`.
3. **Any other mail** sent through `email.service.js` (e.g. admin flows using `sendMail`).

## Configuration

Set these in **`backend/.env`**. The API loads only `backend/.env`.

| Variable | Required | Description |
|----------|----------|-------------|
| `ZOHO_MAIL_USER` | Yes | Full Zoho mailbox address that sends mail (e.g. `noreply@yourdomain.com`) |
| `ZOHO_MAIL_PASSWORD` | Yes | Zoho account password, or an **App Password** if you use 2FA (spaces in `.env` are stripped) |
| `ZOHO_SMTP_HOST` | No | Default `smtp.zoho.com`. Use `smtp.zoho.eu` (EU) or `smtp.zoho.in` (India) if your account is in that region |
| `ZOHO_SMTP_PORT` | No | Default `465` (SSL). Use `587` with TLS if your firewall requires it |
| `FRONTEND_URL` | Yes in production | Public site origin for verification links |
| `FROM_EMAIL` | No | From address (defaults to `ZOHO_MAIL_USER`) |
| `FROM_NAME` | No | Display name (default: `FXMARK`) |

## Zoho: enable SMTP and credentials

1. Log in to [Zoho Mail](https://www.zoho.com/mail/) as the sending account (or admin).
2. Ensure **SMTP access** is allowed for that mailbox (Zoho Mail → Settings → Mail Accounts → **Outgoing SMTP** / IMAP access — follow Zoho’s current UI for “SMTP configuration” or “Application-specific passwords”).
3. If **two-factor authentication** is on, create an **App Password** for SMTP and put it in `ZOHO_MAIL_PASSWORD`.
4. Use the **same email** in `ZOHO_MAIL_USER` as the mailbox authorized to send.

### Ports

- **465** + SSL (`secure: true`) — default in this project.
- **587** + STARTTLS — set `ZOHO_SMTP_PORT=587` (the app sets `requireTLS` for port 587).

## How to test

1. Set `ZOHO_MAIL_USER`, `ZOHO_MAIL_PASSWORD`, `FRONTEND_URL` (and `API_URL` as needed).
2. Start the API — look for `[env] Zoho Mail: … (configured)`.
3. **Send test:**  
   `node backend/scripts/test-email.js you@example.com`  
   or from `backend/`: `npm run test:email -- you@example.com`

### Resend verification from Windows PowerShell

See repo `scripts/resend-verification-local.ps1` or `Invoke-RestMethod` to `POST /api/auth/resend-verification`.

## Verification flow

- **Register** → email contains `{FRONTEND_URL}/verify-email?token=…`
- **SPA** → `POST /api/auth/verify-email` with `{ "token": "…" }`
- **Old API links** → `GET /api/auth/verify-email?token=…` redirects to the SPA

If `ZOHO_MAIL_USER` or `ZOHO_MAIL_PASSWORD` is missing, outbound mail is disabled (registration may still succeed; check logs).

## Notifications

`notification.service.js` uses the same Zoho transport when the channel is `'email'`.

## Deliverability — mail going to **Spam / Junk**

Inbox vs spam is mostly decided by **your domain’s DNS** and **who you send as**, not by Node code alone.

### 1. Align “From” with Zoho

- Set **`FROM_EMAIL`** to the **same address as `ZOHO_MAIL_USER`**, or to an address Zoho has explicitly allowed as an **alias** for that mailbox.
- If `FROM_EMAIL` is a different domain than your Zoho mailbox, **SPF/DKIM alignment** often breaks and Gmail/Outlook may file mail as spam. The server logs a one-time warning when `FROM_EMAIL` ≠ `ZOHO_MAIL_USER`.

### 2. DNS: SPF, DKIM, DMARC (required for production)

In **Zoho Mail** (admin) for your domain:

1. **SPF** — Add the TXT record Zoho gives you (usually includes `include:zoho.com` / regional includes).
2. **DKIM** — Enable DKIM in Zoho, add the **CNAME** records they show, then wait for DNS to propagate (often up to 48h).
3. **DMARC** — After SPF+DKIM work, add a DMARC TXT (e.g. `_dmarc.yourdomain.com`) — start with `p=none` to monitor, then tighten.

Use Zoho’s own wizard: **Mail Admin → Domains → your domain → SPF / DKIM / DMARC**.

### 3. Domain reputation

- New domains and new IPs warm up slowly; first messages often hit spam until reputation builds.
- Avoid spammy subjects (e.g. “FREE!!!”, all caps). Keep verification subjects clear and short.

### 4. Recipients

- Ask testers to **“Not spam” / “Report not junk”** once — it trains the mailbox.
- Sending **to the same domain** you send **from** (internal test) can still hit spam until DNS is correct — test with Gmail/Outlook **consumer** addresses too.

### 5. Links in mail

- Use **HTTPS** `FRONTEND_URL` in production (already used for verification links). Mixed or broken links can hurt trust scores.
