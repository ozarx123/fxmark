/**
 * Payment settings — PSP connection, min/max deposit, per-method enable/min/max
 * Single document in payment_settings collection (key: 'global')
 */
import { getDb } from '../../config/mongo.js';

const COLLECTION = 'payment_settings';
const DOC_ID = 'global';

export const SUPPORTED_METHOD_IDS = [
  'bank_transfer',
  'crypto',
  'card',
  'neteller',
  'skrill',
  'alipay',
];

export const METHOD_LABELS = {
  bank_transfer: 'Bank Transfer',
  crypto: 'Crypto',
  card: 'Card Payment',
  neteller: 'Neteller',
  skrill: 'Skrill',
  alipay: 'Alipay',
};

function defaultMethods() {
  const methods = {};
  SUPPORTED_METHOD_IDS.forEach((id) => {
    methods[id] = {
      enabled: false,
      minAmount: 20,
      maxAmount: 100000,
    };
  });
  return methods;
}

function defaultSettings() {
  return {
    _id: DOC_ID,
    pspEnabled: false,
    minDeposit: 20,
    maxDeposit: 100000,
    methods: defaultMethods(),
    updatedAt: new Date(),
  };
}

async function collection() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

/** Get payment settings (creates default doc if missing) */
export async function getPaymentSettings() {
  const col = await collection();
  let doc = await col.findOne({ _id: DOC_ID });
  if (!doc) {
    const defaults = defaultSettings();
    await col.insertOne(defaults);
    doc = defaults;
  }
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/** Update payment settings (merge with existing) */
export async function updatePaymentSettings(update) {
  const col = await collection();
  const $set = { updatedAt: new Date() };
  if (typeof update.pspEnabled === 'boolean') $set.pspEnabled = update.pspEnabled;
  if (Number.isFinite(update.minDeposit) && update.minDeposit >= 0) $set.minDeposit = update.minDeposit;
  if (Number.isFinite(update.maxDeposit) && update.maxDeposit > 0) $set.maxDeposit = update.maxDeposit;
  if (update.methods && typeof update.methods === 'object') {
    const current = await col.findOne({ _id: DOC_ID });
    const methods = current?.methods || defaultMethods();
    for (const [id, config] of Object.entries(update.methods)) {
      if (!SUPPORTED_METHOD_IDS.includes(id)) continue;
      methods[id] = {
        enabled: typeof config.enabled === 'boolean' ? config.enabled : (methods[id]?.enabled ?? false),
        minAmount: Number.isFinite(config.minAmount) && config.minAmount >= 0 ? config.minAmount : (methods[id]?.minAmount ?? 20),
        maxAmount: Number.isFinite(config.maxAmount) && config.maxAmount > 0 ? config.maxAmount : (methods[id]?.maxAmount ?? 100000),
      };
    }
    $set.methods = methods;
  }
  if (Object.keys($set).length <= 1) return getPaymentSettings();
  await col.updateOne({ _id: DOC_ID }, { $set }, { upsert: true });
  return getPaymentSettings();
}

export default {
  getPaymentSettings,
  updatePaymentSettings,
  SUPPORTED_METHOD_IDS,
  METHOD_LABELS,
};
