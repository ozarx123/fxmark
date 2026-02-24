/**
 * Print URL-encoded password for use in MongoDB CONNECTION_STRING.
 * Usage: set ENCODE_PASSWORD=yourpassword then run:
 *   node scripts/encode-password.js
 * Or (PowerShell): $env:ENCODE_PASSWORD="yourpassword"; node scripts/encode-password.js
 */
import 'dotenv/config';

const raw = process.env.ENCODE_PASSWORD;
if (!raw) {
  console.error('Set ENCODE_PASSWORD env var with your DB password, then run this script.');
  console.error('Example (PowerShell): $env:ENCODE_PASSWORD="p@ss#word"; node scripts/encode-password.js');
  process.exit(1);
}

console.log(encodeURIComponent(raw));
