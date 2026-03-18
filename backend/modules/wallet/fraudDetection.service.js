/**
 * Lightweight rule-based fraud detection for withdrawals.
 * Runs before processing; outputs riskScore (0–100) and flags.
 */
import walletRepo from './wallet.repository.js';
import userRepo from '../users/user.repository.js';

const FRAUD_WINDOW_MINUTES = parseInt(process.env.FRAUD_WINDOW_MINUTES || '15', 10);
const FRAUD_MAX_WITHDRAWALS_IN_WINDOW = parseInt(process.env.FRAUD_MAX_WITHDRAWALS_IN_WINDOW || '5', 10);
const FRAUD_HIGH_AMOUNT = parseFloat(process.env.FRAUD_HIGH_AMOUNT || '10000') || 10000;
const FRAUD_RAPID_MINUTES = parseInt(process.env.FRAUD_RAPID_MINUTES || '5', 10);
const FRAUD_NEW_USER_DAYS = parseInt(process.env.FRAUD_NEW_USER_DAYS || '7', 10);
const FRAUD_NEW_USER_HIGH_AMOUNT = parseFloat(process.env.FRAUD_NEW_USER_HIGH_AMOUNT || '1000') || 1000;

function normalizeUserId(id) {
  return id != null ? String(id) : '';
}

/**
 * Evaluate withdrawal attempt. Returns { riskScore, flags }.
 * @param {string} userId
 * @param {number} amount - this withdrawal amount
 * @param {{ withdrawalId?: string }} [context]
 */
async function evaluateWithdrawal(userId, amount, context = {}) {
  const uid = normalizeUserId(userId);
  const amt = Number(amount) || 0;
  const flags = [];
  let score = 0;

  const [withdrawals, user] = await Promise.all([
    walletRepo.getTransactions(uid, { type: 'withdrawal', limit: 100 }),
    userRepo.findById(uid).catch(() => null),
  ]);

  const now = Date.now();
  const windowMs = FRAUD_WINDOW_MINUTES * 60 * 1000;
  const rapidMs = FRAUD_RAPID_MINUTES * 60 * 1000;

  const completedInWindow = withdrawals.filter((w) => {
    const t = w.completedAt || w.createdAt;
    const ts = t instanceof Date ? t.getTime() : (t && new Date(t).getTime()) || 0;
    return w.status === 'completed' && ts && now - ts <= windowMs;
  });
  if (completedInWindow.length >= FRAUD_MAX_WITHDRAWALS_IN_WINDOW) {
    flags.push('HIGH_FREQUENCY');
    score += 30;
  }

  if (amt >= FRAUD_HIGH_AMOUNT) {
    flags.push('HIGH_AMOUNT');
    score += 25;
  }

  const completedRecent = withdrawals.filter((w) => {
    const t = w.completedAt || w.createdAt;
    const ts = t instanceof Date ? t.getTime() : (t && new Date(t).getTime()) || 0;
    return w.status === 'completed' && ts && now - ts <= rapidMs;
  });
  if (completedRecent.length >= 2) {
    flags.push('RAPID_SEQUENCE');
    score += 20;
  }

  const firstWithdrawal = withdrawals.length === 0 || withdrawals.every((w) => w.status !== 'completed');
  const userCreatedAt = user?.createdAt;
  const accountAgeDays = userCreatedAt
    ? (now - (userCreatedAt instanceof Date ? userCreatedAt.getTime() : new Date(userCreatedAt).getTime())) / (24 * 60 * 60 * 1000)
    : 0;
  if (firstWithdrawal && accountAgeDays < FRAUD_NEW_USER_DAYS && amt >= FRAUD_NEW_USER_HIGH_AMOUNT) {
    flags.push('NEW_USER_HIGH_AMOUNT');
    score += 25;
  }

  const pendingCount = withdrawals.filter((w) => w.status === 'pending' || w.status === 'review').length;
  const completedCount = withdrawals.filter((w) => w.status === 'completed').length;
  if (pendingCount >= 3 && completedCount > 0) {
    flags.push('SUSPICIOUS_PATTERN');
    score += 15;
  }

  const riskScore = Math.min(100, score);
  return { riskScore, flags };
}

/** Risk bands for blocking: LOW 0–40, MEDIUM 41–70, HIGH 71–100 */
const RISK_LOW = 40;
const RISK_HIGH = 70;

function getRiskBand(riskScore) {
  const s = Number(riskScore) || 0;
  if (s <= RISK_LOW) return 'LOW';
  if (s <= RISK_HIGH) return 'MEDIUM';
  return 'HIGH';
}

export default {
  evaluateWithdrawal,
  getRiskBand,
  RISK_LOW,
  RISK_HIGH,
};
