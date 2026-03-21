/**
 * Verify Zoho-related variables are present in backend/.env (via config/load-env.js).
 * Usage (from backend/): node scripts/check-zoho-env.js
 */
import '../config/load-env.js';

const user = (process.env.ZOHO_MAIL_USER || '').trim();
const pass = (process.env.ZOHO_MAIL_PASSWORD || '').replace(/\s+/g, '').trim();
const host = (process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com').trim();

console.log('backend/.env Zoho check');
console.log('  ZOHO_MAIL_USER:', user ? `${user.slice(0, 2)}***@${user.split('@')[1] || '?'}` : 'MISSING');
console.log('  ZOHO_MAIL_PASSWORD:', pass ? '(set)' : 'MISSING');
console.log('  ZOHO_SMTP_HOST:', host);
if (!user || !pass) {
  console.error('\nSet ZOHO_MAIL_USER and ZOHO_MAIL_PASSWORD in backend/.env (see .env.example).');
  process.exit(1);
}
console.log('\nOK — credentials present (does not test SMTP login).');
process.exit(0);
