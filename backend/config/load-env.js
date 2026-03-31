/**
 * Load `backend/.env` into `process.env` before other modules read env (Zoho, Mongo URI, JWT, etc.).
 *
 * Import this first from `src/index.js`, and from `config/mongo.js` so any entry point that uses
 * Mongo also loads the same file (scripts that import `mongo.js` get env without relying on cwd).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultEnv = path.resolve(__dirname, '../.env');
const stagingEnv = path.resolve(__dirname, '../.env.staging');
const requestedEnvFile = (process.env.BACKEND_ENV_FILE || '').trim();
const backendEnv = requestedEnvFile
  ? path.resolve(__dirname, '..', requestedEnvFile)
  : process.env.NODE_ENV === 'staging'
    ? stagingEnv
    : defaultEnv;
const result = dotenv.config({ path: backendEnv });
if (result.error && result.error.code !== 'ENOENT') {
  console.warn('[env] Could not load backend/.env:', result.error.message);
}

export const BACKEND_ENV_PATH = backendEnv;
