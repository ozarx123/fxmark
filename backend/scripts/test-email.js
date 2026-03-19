/**
 * Send one test message using configured Gmail (GMAIL_USER + GMAIL_APP_PASSWORD).
 *
 * Usage: node scripts/test-email.js recipient@example.com
 * From repo root: node backend/scripts/test-email.js recipient@example.com
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env'), override: true });

const recipient = (process.argv[2] || '').trim();
if (!recipient) {
  console.error('Usage: node scripts/test-email.js <recipient-email>');
  process.exit(1);
}

if (!(process.env.GMAIL_USER || '').trim() || !(process.env.GMAIL_APP_PASSWORD || '').trim()) {
  console.error('Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env');
  process.exit(1);
}

const { sendMail } = await import('../modules/email/email.service.js');

const r = await sendMail({
  to: recipient,
  subject: 'FXMark — Gmail test',
  text: 'If you received this, Gmail SMTP is configured correctly.',
  html: '<p>If you received this, Gmail SMTP is configured correctly.</p>',
});

if (r.sent) {
  console.log('Email sent successfully. Check inbox/spam for:', recipient);
  process.exit(0);
}
console.error('Failed:', r.error || 'unknown');
process.exit(1);
