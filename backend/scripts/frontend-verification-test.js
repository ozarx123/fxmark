/**
 * Prepare a real browser test for the email verification page (frontend-web).
 * 1) Registers a temporary user and leaves them unverified.
 * 2) Prints URLs to open in the browser (Vite dev server on 5173).
 *
 * Prerequisites: backend running (npm run dev), MongoDB. Do NOT run if you rely on
 * a fixed test user — this creates a new user each time.
 *
 * Usage (backend/): node scripts/frontend-verification-test.js
 * Then open the printed URL while `npm run dev` is running in frontend-web/.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const BASE = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
/** Local Vite dev server — use this for opening the verification page in a browser. */
const FRONTEND_DEV = (process.env.FRONTEND_DEV_URL || 'http://localhost:5173').replace(/\/$/, '');
const FRONTEND_PROD = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
const email = `fe_verify_${Date.now()}@example.com`;
const password = 'FeVerify1!';

async function main() {
  console.log('=== Frontend verification page — test link ===\n');

  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'FE Verify Test' }),
  });
  const regData = await reg.json().catch(() => ({}));
  if (!reg.ok) {
    console.error('Register failed:', reg.status, regData);
    console.error('\nStart API: cd backend && npm run dev');
    process.exit(1);
  }

  const { getDb } = await import('../config/mongo.js');
  const db = await getDb();
  const user = await db.collection('users').findOne({ email });
  const token = user?.emailVerificationToken;
  if (!token) {
    console.error('No token on user document.');
    process.exit(1);
  }

  const q = `token=${encodeURIComponent(token)}`;
  console.log('Test user (do not use for production):');
  console.log('  Email:   ', email);
  console.log('  Password:', password);
  console.log('');
  console.log('Start the frontend (separate terminal):');
  console.log('  cd frontend-web && npm run dev');
  console.log('');
  console.log('Open ONE of these in your browser (should show Verifying → Success):');
  console.log('');
  console.log(`  ${FRONTEND_DEV}/verify-email?${q}`);
  console.log(`  ${FRONTEND_DEV}/auth/verify-email?${q}`);
  if (FRONTEND_PROD && FRONTEND_PROD !== FRONTEND_DEV) {
    console.log('');
    console.log('Optional — same token on deployed site (if it points at this API):');
    console.log(`  ${FRONTEND_PROD}/verify-email?${q}`);
  }
  console.log('');
  console.log('If the page errors, ensure Vite proxy targets port 3000 (see vite.config.js).');
  console.log('If you use VITE_API_URL, it must point at the same API as the backend.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
