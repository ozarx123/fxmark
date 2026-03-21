/**
 * Send one test message using configured Zoho Mail (ZOHO_MAIL_USER + ZOHO_MAIL_PASSWORD).
 *
 * Loads **only** `backend/.env` — same as `src/index.js` (the API does not load repo-root `.env`).
 * If you previously had a repo-root `.env` with different ZOHO_* values, the old script could
 * "pass" while `npm run dev` returned 535; keep all mail vars in `backend/.env`.
 *
 * Usage: node scripts/test-email.js recipient@example.com
 * From repo root: node backend/scripts/test-email.js recipient@example.com
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const recipient = (process.argv[2] || '').trim();
if (!recipient) {
  console.error('Usage: node scripts/test-email.js <recipient-email>');
  process.exit(1);
}

if (!(process.env.ZOHO_MAIL_USER || '').trim() || !(process.env.ZOHO_MAIL_PASSWORD || '').trim()) {
  console.error('Missing ZOHO_MAIL_USER or ZOHO_MAIL_PASSWORD in .env');
  process.exit(1);
}

const { sendMail } = await import('../modules/email/email.service.js');

const r = await sendMail({
  to: recipient,
  subject: 'FXMark — Zoho Mail test',
  text: 'If you received this, Zoho Mail SMTP is configured correctly.',
  html: '<p>If you received this, Zoho Mail SMTP is configured correctly.</p>',
});

if (r.sent) {
  console.log('Email sent successfully. Check inbox/spam for:', recipient);
  process.exit(0);
}
console.error('Failed:', r.error || 'unknown');
process.exit(1);
