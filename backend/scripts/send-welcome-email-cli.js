/**
 * Send the transactional welcome email to one or more addresses.
 * Uses user name / account / phone from Mongo when the user exists; otherwise placeholders.
 *
 * Usage (from backend/):
 *   node scripts/send-welcome-email-cli.js shamsoup@gmail.com ozarxhr@gmail.com
 */
import '../config/load-env.js';
import userRepo from '../modules/users/user.repository.js';
import { sendWelcomeEmail } from '../modules/email/welcome-email.js';

const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase()).filter(Boolean);
if (!emails.length) {
  console.error('Usage: node scripts/send-welcome-email-cli.js <email> [<email> ...]');
  process.exit(1);
}

async function main() {
  for (const email of emails) {
    let fullName = 'Trader';
    let accountNo = '—';
    let phone = null;
    try {
      const user = await userRepo.findByEmail(email);
      if (user) {
        fullName = user.name || fullName;
        accountNo = user.accountNo || accountNo;
        phone = user.phone || null;
      } else {
        console.warn(`[welcome-cli] No user in DB for ${email} — sending with placeholder account details.`);
      }
    } catch (e) {
      console.warn(`[welcome-cli] DB lookup failed (${e.message}) — sending with placeholders.`);
    }
    const r = await sendWelcomeEmail({ to: email, fullName, accountNo, phone });
    if (r.sent) {
      console.log('Sent welcome email to', email);
    } else {
      console.error('Failed:', email, r.error || 'unknown');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
