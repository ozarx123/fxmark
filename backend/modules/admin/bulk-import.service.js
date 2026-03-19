/**
 * Bulk user import — strict account preservation, CRM referral codes (Ref ID / Refer By), wallet balance, dual passwords.
 * Does not modify commission, PAMM, login, or wallet logic. Two-pass: create users then link referrerId by referral code.
 */
import bcrypt from 'bcryptjs';
import userRepo from '../users/user.repository.js';
import financialTransactionService from '../finance/financial-transaction.service.js';

const SALT_ROUNDS = 10;
const CURRENCY = 'USD';
/** Per-user so ledger unique key (accountCode, entityId, referenceType, referenceId) is not shared across imports. */
function importOpeningBalanceReferenceId(userId) {
  return `bulk_import:${String(userId)}`;
}

/** Default main password for all imported users (hashed; never stored plaintext). */
const DEFAULT_MAIN_PASSWORD =
  (process.env.BULK_IMPORT_DEFAULT_PASSWORD || '').trim() || 'ImportMain1!';
/** Default investor password for all imported users (hashed; never stored plaintext). */
const DEFAULT_INVESTOR_PASSWORD =
  (process.env.BULK_IMPORT_DEFAULT_INVESTOR_PASSWORD || '').trim() || 'ImportInvestor1!';

function requiredColumns() {
  return ['account_no', 'full_name', 'email', 'mobile', 'wallet_balance', 'is_active', 'ref_id', 'refer_by', 'days'];
}

/**
 * Parse historical date from source file. Supports:
 * - DD-MM-YYYY HH:mm, DD/MM/YYYY HH:mm
 * - ISO 8601
 * @param {string} str - raw value from Days column
 * @returns {Date|null} parsed date or null if empty/invalid
 */
function parseSourceDate(str) {
  const s = typeof str === 'string' ? str.trim() : '';
  if (!s) return null;
  const ddmmyyyy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ddmmyyyy) {
    const [, day, month, year, h = 0, m = 0, sec = 0] = ddmmyyyy;
    const d = new Date(Number(year), Number(month) - 1, Number(day), Number(h), Number(m), Number(sec), 0);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  return null;
}

function normalizeRow(row) {
  const get = (key) => (row[key] != null ? String(row[key]).trim() : '');
  return {
    account_no: get('account_no'),
    full_name: get('full_name'),
    email: get('email').toLowerCase(),
    mobile: get('mobile'),
    wallet_balance: parseFloat(row.wallet_balance) || 0,
    is_active: /^(1|true|yes|y)$/i.test(get('is_active')),
    ref_id: get('ref_id'),
    refer_by: get('refer_by'),
    days: get('days'),
  };
}

/**
 * Validate and run import. dryRun: only validate and return report, no writes.
 * Two-pass when !dryRun: Pass 1 create all users + wallet/ledger + referralCode from Ref ID; Pass 2 set referrerId from Refer By.
 * @param {Array<object>} rows - array of row objects with required columns (ref_id, refer_by optional but supported)
 * @param {boolean} dryRun
 */
export async function runBulkImport(rows, dryRun = true) {
  const report = {
    dryRun,
    totalRows: 0,
    validated: 0,
    skippedDuplicateAccountNo: [],
    skippedDuplicateEmail: [],
    duplicateReferralCode: [],
    invalidReferBy: [],
    selfReferral: [],
    failed: [],
    created: [],
    summary: '',
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    report.summary = 'No rows provided';
    return report;
  }

  report.totalRows = rows.length;
  const defaultMainHash = await bcrypt.hash(DEFAULT_MAIN_PASSWORD, SALT_ROUNDS);
  const defaultInvestorHash = await bcrypt.hash(DEFAULT_INVESTOR_PASSWORD, SALT_ROUNDS);

  // ---- Duplicate ref_id (referral code) check ----
  const refIdCount = {};
  rows.forEach((r, i) => {
    const row = normalizeRow(r);
    if (row.ref_id) {
      refIdCount[row.ref_id] = (refIdCount[row.ref_id] || []).concat({ rowNum: i + 1, email: row.email, account_no: row.account_no });
    }
  });
  Object.entries(refIdCount).forEach(([code, entries]) => {
    if (entries.length > 1) {
      report.duplicateReferralCode.push({ ref_id: code, rows: entries });
    }
  });

  // ---- Pass 1: validate and create users (no referrerId); track created for pass 2 ----
  const createdForPass2 = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const row = normalizeRow(raw);
    const rowNum = i + 1;

    if (!row.account_no) {
      report.failed.push({ row: rowNum, reason: 'missing account_no', email: row.email });
      continue;
    }
    if (!row.email) {
      report.failed.push({ row: rowNum, reason: 'missing email', account_no: row.account_no });
      continue;
    }

    const existingByAccount = await userRepo.findByAccountNoExact(row.account_no);
    if (existingByAccount) {
      report.skippedDuplicateAccountNo.push({ row: rowNum, account_no: row.account_no, email: row.email });
      continue;
    }

    const existingByEmail = await userRepo.findByEmail(row.email);
    if (existingByEmail) {
      report.skippedDuplicateEmail.push({ row: rowNum, email: row.email, account_no: row.account_no });
      continue;
    }

    // Self-referral: same row Ref ID === Refer By
    if (row.ref_id && row.refer_by && row.ref_id === row.refer_by) {
      report.selfReferral.push({ row: rowNum, email: row.email, account_no: row.account_no });
    }

    // Invalid date: Days has value but does not parse
    if (row.days) {
      const parsedDate = parseSourceDate(row.days);
      if (!parsedDate) {
        report.failed.push({ row: rowNum, reason: 'invalid date format', email: row.email, account_no: row.account_no, days_value: row.days });
        continue;
      }
    }

    report.validated += 1;

    if (dryRun) continue;

    const isDuplicateRefId = refIdCount[row.ref_id] && refIdCount[row.ref_id].length > 1;
    const referralCodeToSet = row.ref_id && !isDuplicateRefId ? row.ref_id : undefined;
    const parsedDate = row.days ? parseSourceDate(row.days) : null;
    const createdAt = parsedDate || new Date();
    const updatedAt = parsedDate || new Date();

    try {
      const balance = Number(row.wallet_balance) || 0;
      const userId = await financialTransactionService.runPairedWithTransaction(async (session) => {
        const uid = await userRepo.createOne(
          {
            accountNo: row.account_no,
            name: row.full_name || row.email.split('@')[0],
            email: row.email,
            phone: row.mobile || undefined,
            passwordHash: defaultMainHash,
            investorPasswordHash: defaultInvestorHash,
            referralCode: referralCodeToSet,
            role: 'user',
            kycStatus: 'pending',
            profileComplete: false,
            emailVerified: true, // all imported users: email treated as verified so they can log in immediately
            isActive: row.is_active,
            createdAt,
            updatedAt,
          },
          { session }
        );
        if (balance > 0) {
          await financialTransactionService.atomicImportOpeningBalanceInSession(
            session,
            uid,
            balance,
            CURRENCY,
            importOpeningBalanceReferenceId(uid)
          );
        }
        return uid;
      }, { label: 'bulk_import_user_row' });

      if (balance > 0) {
        await financialTransactionService.verifyWalletLedgerAfterMutation(userId, CURRENCY, {
          flow: 'bulk_import_opening_balance',
          reference: importOpeningBalanceReferenceId(userId),
        });
      }

      report.created.push({
        row: rowNum,
        userId,
        account_no: row.account_no,
        email: row.email,
        wallet_balance: balance,
      });

      createdForPass2.push({
        rowNum,
        userId,
        ref_id: row.ref_id,
        refer_by: row.refer_by,
      });
    } catch (e) {
      report.failed.push({
        row: rowNum,
        reason: e.message || 'create failed',
        account_no: row.account_no,
        email: row.email,
      });
    }
  }

  // ---- Pass 2: set referrerId from Refer By (match by referralCode) ----
  if (!dryRun && createdForPass2.length > 0) {
    const codeToUserId = {};

    for (const c of createdForPass2) {
      if (c.ref_id) codeToUserId[c.ref_id] = c.userId;
    }

    const referByCodes = [...new Set(createdForPass2.map((c) => c.refer_by).filter(Boolean))];
    for (const code of referByCodes) {
      if (codeToUserId[code]) continue;
      const existing = await userRepo.findByReferralCode(code);
      if (existing) codeToUserId[code] = existing.id;
    }

    for (const c of createdForPass2) {
      if (!c.refer_by) continue;
      const parentId = codeToUserId[c.refer_by];
      if (!parentId) {
        report.invalidReferBy.push({ row: c.rowNum, refer_by: c.refer_by, userId: c.userId, reason: 'no user with this referral code' });
        continue;
      }
      if (parentId === c.userId) {
        report.selfReferral.push({ row: c.rowNum, userId: c.userId, reason: 'refer_by points to self' });
        continue;
      }
      try {
        await userRepo.updateById(c.userId, { referrerId: parentId });
      } catch (e) {
        report.invalidReferBy.push({ row: c.rowNum, refer_by: c.refer_by, userId: c.userId, reason: e.message || 'update failed' });
      }
    }
  }

  report.summary = `Rows: ${report.totalRows}, validated: ${report.validated}, created: ${report.created.length}, skipped (account_no): ${report.skippedDuplicateAccountNo.length}, skipped (email): ${report.skippedDuplicateEmail.length}, duplicate referral code: ${report.duplicateReferralCode.length}, invalid Refer By: ${report.invalidReferBy.length}, self-referral: ${report.selfReferral.length}, failed: ${report.failed.length}`;
  return report;
}

export function getImportConfig() {
  return {
    defaultMainPasswordSet: !!DEFAULT_MAIN_PASSWORD,
    defaultInvestorPasswordSet: !!DEFAULT_INVESTOR_PASSWORD,
    columns: requiredColumns(),
  };
}
