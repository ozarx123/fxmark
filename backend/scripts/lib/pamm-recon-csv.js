/**
 * Shared Bull Run reconciliation CSV: repo root `recon_010426` / `recon_010426.csv` or RECON_CSV_PATH.
 * Columns: user_id, pamm_actual (target on-book stake after recon).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root from this file: backend/scripts/lib → ../../../ */
export function repoRootPath() {
  return path.join(__dirname, '..', '..', '..');
}

export function resolveReconCsvPath() {
  const env = process.env.RECON_CSV_PATH;
  if (env && fs.existsSync(env)) return env;
  const root = repoRootPath();
  const candidates = [
    path.join(root, 'recon_010426'),
    path.join(root, 'recon_010426.csv'),
    path.join(root, 'recon_010426.txt'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Parse minimal CSV with header; returns Map user_id -> { pamm_actual: number|null }.
 */
export function parseReconCsv(content) {
  const map = new Map();
  const raw = typeof content === 'string' ? content.replace(/^\uFEFF/, '') : String(content);
  const lines = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (inQ && raw[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (!inQ && (c === '\n' || c === '\r')) {
      if (c === '\r' && raw[i + 1] === '\n') i++;
      if (cur.length) lines.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.length) lines.push(cur);

  if (lines.length === 0) return map;

  const splitRow = (line) => {
    const cells = [];
    let cell = '';
    let q = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        if (q && line[j + 1] === '"') {
          cell += '"';
          j++;
        } else {
          q = !q;
        }
      } else if (!q && ch === ',') {
        cells.push(cell);
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell);
    return cells;
  };

  const header = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const uidIdx = header.indexOf('user_id');
  const actualIdx = header.indexOf('pamm_actual');
  if (uidIdx < 0 || actualIdx < 0) {
    console.warn('[recon] CSV missing user_id or pamm_actual header; treating as empty.');
    return map;
  }

  for (let r = 1; r < lines.length; r++) {
    const cells = splitRow(lines[r]);
    const uid = (cells[uidIdx] || '').trim();
    if (!uid) continue;
    const raw = (cells[actualIdx] || '').trim();
    let actual = null;
    if (raw !== '') {
      const n = Number(raw.replace(/,/g, ''));
      if (Number.isFinite(n)) actual = n;
    }
    map.set(uid, { pamm_actual: actual });
  }
  return map;
}

/**
 * @param {{ warnNoFile?: boolean, logPrefix?: string }} [options]
 */
export function loadReconMap(options = {}) {
  const { warnNoFile = true, logPrefix = '[recon]' } = options;
  const p = resolveReconCsvPath();
  if (!p) {
    if (warnNoFile) {
      console.warn(
        `${logPrefix} No recon file (recon_010426 / RECON_CSV_PATH); pamm_actual blank, pamm_adjust = full Bull Run stake.`
      );
    }
    return new Map();
  }
  try {
    const text = fs.readFileSync(p, 'utf8');
    const m = parseReconCsv(text);
    console.log(`${logPrefix} Loaded recon: ${p} (${m.size} user row(s))`);
    return m;
  } catch (e) {
    console.warn(`${logPrefix} Failed to read recon file:`, e.message);
    return new Map();
  }
}
