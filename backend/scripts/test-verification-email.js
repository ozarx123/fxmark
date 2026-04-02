/**
 * Send a real verification email via the same path as production (Zoho / nodemailer).
 *
 * From backend/:
 *   node scripts/test-verification-email.js you@example.com
 *     → resend for an existing unverified user
 *   node scripts/test-verification-email.js you@example.com --register YourPassword1
 *     → register (fails if email exists) and send verification + welcome
 *
 * Requires: CONNECTION_STRING, ZOHO_MAIL_USER/PASSWORD (or configured mail),
 * and FRONTEND_URL or API_URL so the link in the email is valid.
 */
import authService from '../modules/auth/auth.service.js';
import { closeMongo } from '../config/mongo.js';

function usage() {
  console.error(
    'Usage:\n  node scripts/test-verification-email.js <email>\n  node scripts/test-verification-email.js <email> --register <password>\n\n' +
      'First form: resend verification (user must exist and not be verified).\n' +
      'Second form: register a new user and send verification (and welcome).'
  );
}

const args = process.argv.slice(2);
const regIdx = args.indexOf('--register');
let email;
let password;

if (regIdx === -1) {
  email = (args[0] || '').trim();
} else {
  email = (args[0] || '').trim();
  password = args[regIdx + 1];
  if (!password) {
    usage();
    process.exit(1);
  }
}

if (!email) {
  usage();
  process.exit(1);
}

const fe = (process.env.FRONTEND_URL || process.env.WEB_APP_URL || '').trim();
const api = (process.env.API_URL || '').trim();
console.log('Link base: FRONTEND_URL/WEB_APP_URL =', fe ? '(set)' : '(empty)', '| API_URL =', api ? '(set)' : '(empty)');

async function main() {
  try {
    if (password) {
      const r = await authService.register({
        email,
        password,
        name: 'Email verify test',
      });
      console.log(
        JSON.stringify(
          {
            verificationEmailSent: r.verificationEmailSent,
            message: r.message,
            userId: r.user?.id,
          },
          null,
          2
        )
      );
      if (!r.verificationEmailSent) {
        process.exitCode = 1;
      }
    } else {
      const r = await authService.resendVerificationEmail(email);
      console.log(JSON.stringify(r, null, 2));
    }
  } catch (e) {
    console.error(e.statusCode ? `[${e.statusCode}]` : '', e.message);
    process.exit(1);
  } finally {
    await closeMongo();
  }
}

await main();
