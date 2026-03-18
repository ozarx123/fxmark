/**
 * Withdrawal approval settings — auto-approve small withdrawals (single doc).
 * Does NOT move funds; only controls initial status (approved vs review).
 */
import { getDb } from '../../config/mongo.js';

const COLLECTION = 'withdrawal_approval_settings';
const DOC_ID = 'global';

const DEFAULTS = {
  _id: DOC_ID,
  autoApproveSmallWithdrawals: false,
  autoApproveThresholdUsd: 100,
  updatedAt: new Date(),
};

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

export async function getWithdrawalApprovalSettings() {
  const c = await col();
  let doc = await c.findOne({ _id: DOC_ID });
  if (!doc) {
    await c.insertOne({ ...DEFAULTS, updatedAt: new Date() });
    doc = DEFAULTS;
  }
  return {
    autoApproveSmallWithdrawals: !!doc.autoApproveSmallWithdrawals,
    autoApproveThresholdUsd: Number(doc.autoApproveThresholdUsd) || 100,
    updatedAt: doc.updatedAt,
  };
}

export async function updateWithdrawalApprovalSettings(update) {
  const c = await col();
  const $set = { updatedAt: new Date() };
  if (typeof update.autoApproveSmallWithdrawals === 'boolean') {
    $set.autoApproveSmallWithdrawals = update.autoApproveSmallWithdrawals;
  }
  if (Number.isFinite(update.autoApproveThresholdUsd) && update.autoApproveThresholdUsd >= 0) {
    $set.autoApproveThresholdUsd = update.autoApproveThresholdUsd;
  }
  if (Object.keys($set).length <= 1) return getWithdrawalApprovalSettings();
  await c.updateOne({ _id: DOC_ID }, { $set }, { upsert: true });
  return getWithdrawalApprovalSettings();
}

export default { getWithdrawalApprovalSettings, updateWithdrawalApprovalSettings };
