/**
 * NOWPayments — create USDT (BEP20) invoice, IPN handling, admin payout (Mass Payout API).
 */
import depositService from '../wallet/deposit.service.js';
import walletRepo from '../wallet/wallet.repository.js';
import financialTransactionService from '../finance/financial-transaction.service.js';
import withdrawalService from '../wallet/withdrawal.service.js';
import * as npRepo from './nowpayments.repository.js';
import * as npClient from './nowpayments.client.js';

/** Test-only: inject mock npRepo / fts / depositService for IPN scenario tests. */
let ipnTestOverrides = null;
export function __setNowpaymentsIpnTestOverrides(o) {
  ipnTestOverrides = o;
}
export function __clearNowpaymentsIpnTestOverrides() {
  ipnTestOverrides = null;
}

const DECIMAL_SCALE = 1_000_000;

function enabled() {
  if (process.env.NOWPAYMENTS_ENABLED === '0' || process.env.NOWPAYMENTS_ENABLED === 'false') {
    return false;
  }
  return !!(process.env.NOWPAYMENTS_API_KEY || '').trim();
}

function ipnCallbackUrl() {
  const base = (process.env.NOWPAYMENTS_IPN_BASE_URL || process.env.API_URL || '').trim().replace(/\/$/, '');
  if (!base) {
    const err = new Error('NOWPAYMENTS_IPN_BASE_URL or API_URL must be set for IPN callbacks');
    err.statusCode = 503;
    throw err;
  }
  return `${base}/api/webhooks/nowpayments`;
}

function logEvent(event, payload = {}) {
  const row = {
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  console.log('[nowpayments][event]', row);
}

function toScaled(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * DECIMAL_SCALE);
}

function mapProviderStatus(paymentStatus) {
  const provider = String(paymentStatus || '').toLowerCase();
  if (provider === 'finished') return { providerStatus: provider, internalStatus: 'completed' };
  if (provider === 'confirming') return { providerStatus: provider, internalStatus: 'processing' };
  if (provider === 'waiting') return { providerStatus: provider, internalStatus: 'pending' };
  if (provider === 'partially_paid' || provider === 'partially paid') {
    return { providerStatus: provider, internalStatus: 'processing' };
  }
  if (provider === 'failed' || provider === 'refunded') {
    return { providerStatus: provider, internalStatus: 'rejected' };
  }
  if (provider === 'expired') return { providerStatus: provider, internalStatus: 'expired' };
  return { providerStatus: provider || 'unknown', internalStatus: 'pending' };
}

function deriveNetworkFromPayload(payload) {
  const payCurrency = String(payload?.pay_currency || '').toLowerCase();
  if (payCurrency === 'usdtbsc') return 'BEP20';
  return '';
}

function parsePaidAmount(payload) {
  const candidates = [
    payload?.actually_paid,
    payload?.pay_amount,
    payload?.outcome_amount,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function getExpiryMinutes() {
  const n = Number(process.env.NOWPAYMENTS_PAYMENT_EXPIRY_MINUTES || 30);
  if (!Number.isFinite(n)) return 30;
  return Math.min(Math.max(Math.round(n), 15), 30);
}

/**
 * Start deposit: pending wallet row + NOWPayments payment (USDT BEP20).
 */
export async function createNowpaymentsDeposit(userId, amount) {
  if (!enabled()) {
    const err = new Error('NOWPayments deposits are not enabled');
    err.statusCode = 503;
    throw err;
  }
  const payCurrency = npClient.assertPayCurrency();
  const created = await depositService.createDeposit(userId, 'USD', amount, null, 'nowpayments');
  const depositId = created.id || created.transaction_id;
  const orderId = `fxm-${depositId}`;

  const priceAmount = Number(created.amount);
  const body = {
    price_amount: priceAmount,
    price_currency: 'usd',
    pay_currency: payCurrency,
    order_id: orderId,
    order_description: `FXMARK deposit ${orderId}`,
    ipn_callback_url: ipnCallbackUrl(),
  };

  let np;
  try {
    np = await npClient.postPayment(body);
  } catch (e) {
    const err = new Error(e.message || 'NOWPayments create payment failed');
    err.statusCode = e.statusCode || 502;
    throw err;
  }

  const paymentId = np.payment_id != null ? Number(np.payment_id) : null;
  if (!Number.isFinite(paymentId)) {
    const err = new Error('Invalid NOWPayments response (missing payment_id)');
    err.statusCode = 502;
    throw err;
  }

  await npRepo.insertOrder({
    orderId,
    paymentId,
    userId,
    depositTransactionId: depositId,
    amountUsd: priceAmount,
    expectedAmount: Number(np.pay_amount) || null,
    expectedAmountCurrency: payCurrency,
    priceCurrency: 'usd',
    payCurrency,
    providerStatus: np.payment_status || 'waiting',
    internalStatus: mapProviderStatus(np.payment_status).internalStatus,
    status: 'created',
    expiresAt: new Date(Date.now() + getExpiryMinutes() * 60 * 1000),
    ledgerReferenceId: depositId,
    creditedAt: null,
    processedAt: null,
    payAddress: np.pay_address || null,
    actuallyPaidAmount: null,
    feeAmount: null,
    fraudFlags: [],
    npCreateResponse: np,
  });

  await walletRepo.updateTransaction(depositId, {
    reference: orderId,
    npPaymentId: paymentId,
    nowpaymentsOrderId: orderId,
  });

  logEvent('deposit_created', {
    user_id: String(userId),
    order_id: orderId,
    payment_id: paymentId,
    amount: priceAmount,
    status: np.payment_status || 'waiting',
  });

  return {
    deposit_id: depositId,
    order_id: orderId,
    payment_id: paymentId,
    payment_status: np.payment_status,
    pay_address: np.pay_address,
    pay_amount: np.pay_amount,
    pay_currency: np.pay_currency,
    price_amount: np.price_amount,
    price_currency: np.price_currency,
    pay_currency_locked: payCurrency,
    network: 'BEP20',
    invoice_url: np.invoice_url || null,
  };
}

/**
 * Apply IPN payload after signature verification.
 */
export async function handleNowpaymentsIpn(payload, meta = {}) {
  const repo = ipnTestOverrides?.npRepo ?? npRepo;
  const fts = ipnTestOverrides?.fts ?? financialTransactionService;
  const ds = ipnTestOverrides?.depositService ?? depositService;

  const orderId = payload?.order_id != null ? String(payload.order_id) : '';
  const paymentStatus = String(payload.payment_status || '').toLowerCase();
  const payCurrency = String(payload.pay_currency || '').toLowerCase();
  const expectedPay = npClient.assertPayCurrency().toLowerCase();
  const paymentId = payload.payment_id != null ? Number(payload.payment_id) : null;
  const mapped = mapProviderStatus(paymentStatus);
  const paidAmount = parsePaidAmount(payload);
  const network = String(payload?.network || '').toUpperCase() || deriveNetworkFromPayload(payload);

  logEvent('webhook_received', {
    user_id: null,
    order_id: orderId || null,
    payment_id: Number.isFinite(paymentId) ? paymentId : null,
    amount: paidAmount,
    status: paymentStatus || null,
    ip: meta.ip || null,
  });

  if (!orderId || !Number.isFinite(paymentId)) {
    logEvent('payment_rejected', {
      user_id: null,
      order_id: orderId || null,
      payment_id: Number.isFinite(paymentId) ? paymentId : null,
      amount: paidAmount,
      status: paymentStatus || null,
      reason: 'missing_order_or_payment_id',
    });
    return { ok: true, credited: false, reason: 'missing_order_or_payment_id' };
  }

  const order = await repo.findByOrderId(orderId);
  if (!order) {
    logEvent('payment_rejected', {
      user_id: null,
      order_id: orderId,
      payment_id: paymentId,
      amount: paidAmount,
      status: paymentStatus || null,
      reason: 'unknown_order',
    });
    return { ok: true, credited: false, reason: 'unknown_order' };
  }

  if (order.status === 'finished') {
    return { ok: true, credited: true, reason: 'already_finished' };
  }
  if (order.credited === true || order.creditedAt) {
    return { ok: true, credited: false, reason: 'already_credited' };
  }

  if (paymentStatus === 'failed' || paymentStatus === 'refunded') {
    await repo.markRejected(orderId, `provider_${paymentStatus}`, {
      providerStatus: mapped.providerStatus,
      internalStatus: mapped.internalStatus,
      lastIpnPayload: payload,
    });
    logEvent('payment_rejected', {
      user_id: String(order.userId),
      order_id: orderId,
      payment_id: paymentId,
      amount: paidAmount,
      status: paymentStatus || null,
      reason: `provider_${paymentStatus}`,
    });
    return { ok: true, credited: false, reason: paymentStatus };
  }

  if (paymentStatus === 'expired') {
    await repo.markExpired(orderId, {
      providerStatus: mapped.providerStatus,
      internalStatus: mapped.internalStatus,
      lastIpnPayload: payload,
      actuallyPaidAmount: paidAmount,
    });
    logEvent('payment_rejected', {
      user_id: String(order.userId),
      order_id: orderId,
      payment_id: paymentId,
      amount: paidAmount,
      status: paymentStatus || null,
      reason: 'provider_expired',
    });
    return { ok: true, credited: false, reason: 'expired' };
  }

  const fraudFlags = Array.isArray(order.fraudFlags) ? [...order.fraudFlags] : [];
  if (order.paymentId != null && Number(order.paymentId) !== paymentId) {
    await repo.markRejected(orderId, 'payment_id_mismatch', {
      providerStatus: mapped.providerStatus,
      internalStatus: mapped.internalStatus,
      lastIpnPayload: payload,
    });
    logEvent('payment_rejected', {
      user_id: String(order.userId),
      order_id: orderId,
      payment_id: paymentId,
      amount: paidAmount,
      status: paymentStatus || null,
      reason: 'payment_id_mismatch',
    });
    return { ok: true, credited: false, reason: 'payment_id_mismatch' };
  }

  if (payCurrency !== expectedPay) {
    await repo.markRejected(orderId, 'pay_currency_mismatch', {
      providerStatus: mapped.providerStatus,
      internalStatus: mapped.internalStatus,
      lastIpnPayload: payload,
    });
    logEvent('payment_rejected', {
      user_id: String(order.userId),
      order_id: orderId,
      payment_id: paymentId,
      amount: paidAmount,
      status: paymentStatus || null,
      reason: 'pay_currency_mismatch',
    });
    return { ok: true, credited: false, reason: 'pay_currency_mismatch' };
  }

  if (network && network !== 'BEP20') {
    await repo.markRejected(orderId, 'network_mismatch', {
      providerStatus: mapped.providerStatus,
      internalStatus: mapped.internalStatus,
      lastIpnPayload: payload,
    });
    logEvent('payment_rejected', {
      user_id: String(order.userId),
      order_id: orderId,
      payment_id: paymentId,
      amount: paidAmount,
      status: paymentStatus || null,
      reason: 'network_mismatch',
    });
    return { ok: true, credited: false, reason: 'network_mismatch' };
  }

  if (paymentStatus !== 'finished') {
    const now = new Date();
    const expired = order.expiresAt && new Date(order.expiresAt).getTime() <= now.getTime();
    if (expired) {
      await repo.markExpired(orderId, {
        providerStatus: mapped.providerStatus,
        lastIpnPayload: payload,
        actuallyPaidAmount: paidAmount,
      });
      logEvent('payment_rejected', {
        user_id: String(order.userId),
        order_id: orderId,
        payment_id: paymentId,
        amount: paidAmount,
        status: paymentStatus || null,
        reason: 'expired',
      });
      return { ok: true, credited: false, reason: 'expired' };
    }
    await repo.updateByOrderId(orderId, {
      providerStatus: mapped.providerStatus,
      internalStatus: mapped.internalStatus,
      lastIpnPayload: payload,
      processedAt: now,
      processed_at: now,
      actuallyPaidAmount: paidAmount,
      feeAmount: payload?.fee_amount != null ? Number(payload.fee_amount) : null,
    });
    return { ok: true, credited: false, reason: 'not_finished' };
  }

  const expectedScaled = toScaled(order.expectedAmount);
  const paidScaled = toScaled(paidAmount);
  if (expectedScaled == null || paidScaled == null) {
    await repo.markRejected(orderId, 'invalid_amount_payload', {
      providerStatus: mapped.providerStatus,
      internalStatus: mapped.internalStatus,
      lastIpnPayload: payload,
    });
    logEvent('payment_rejected', {
      user_id: String(order.userId),
      order_id: orderId,
      payment_id: paymentId,
      amount: paidAmount,
      status: paymentStatus || null,
      reason: 'invalid_amount_payload',
    });
    return { ok: true, credited: false, reason: 'invalid_amount_payload' };
  }

  const minAccepted = Math.floor(expectedScaled * 0.98);
  const maxAccepted = Math.ceil(expectedScaled * 1.02);
  if (paidScaled < minAccepted || paidScaled > maxAccepted) {
    fraudFlags.push('amount_out_of_tolerance');
    await repo.markRejected(orderId, 'amount_out_of_tolerance', {
      providerStatus: mapped.providerStatus,
      internalStatus: mapped.internalStatus,
      lastIpnPayload: payload,
      actuallyPaidAmount: paidAmount,
      fraudFlags,
    });
    logEvent('payment_rejected', {
      user_id: String(order.userId),
      order_id: orderId,
      payment_id: paymentId,
      amount: paidAmount,
      status: paymentStatus || null,
      reason: 'amount_out_of_tolerance',
    });
    return { ok: true, credited: false, reason: 'amount_out_of_tolerance' };
  }

  if (paidScaled < expectedScaled) {
    fraudFlags.push('underpayment_attempt');
  }
  const payAddress = String(payload?.pay_address || order.payAddress || '').trim();
  if (payAddress) {
    const repeats = await repo.countRecentByPayAddress(payAddress);
    if (repeats >= 3) fraudFlags.push('same_address_repeated');
  }
  const smallByUser = await repo.countRecentSmallDeposits(order.userId);
  if (smallByUser >= 5 && Number(order.amountUsd) <= 25) {
    fraudFlags.push('many_small_deposits');
  }

  await repo.updateByOrderId(orderId, {
    providerStatus: mapped.providerStatus,
    internalStatus: mapped.internalStatus,
    status: 'processing',
    lastIpnPayload: payload,
    processedAt: new Date(),
    processed_at: new Date(),
    actuallyPaidAmount: paidAmount,
    feeAmount: payload?.fee_amount != null ? Number(payload.fee_amount) : null,
    payAddress: payAddress || null,
    fraudFlags,
  });

  let credited = false;
  let creditDepositId = null;
  let creditUserId = null;
  await fts.runPairedWithTransaction(async (session) => {
    const claimed = await repo.claimCreditForOrder(orderId, session);
    if (!claimed) {
      return;
    }
    creditDepositId = claimed.depositTransactionId;
    creditUserId = claimed.userId;
    await ds.applyNowpaymentsDepositCredit(claimed.depositTransactionId, claimed.userId, {
      session,
      npPaymentId: payload.payment_id != null ? Number(payload.payment_id) : undefined,
    });
    credited = true;
  }, { label: 'nowpayments_ipn' });

  if (credited && creditDepositId && creditUserId != null) {
    await fts.verifyWalletLedgerAfterMutation(creditUserId, 'USD', {
      flow: 'nowpayments_ipn',
      depositId: creditDepositId,
    });
    const { queueWalletBalanceNotifyById } = await import('../email/wallet-balance-notify.js');
    queueWalletBalanceNotifyById(creditDepositId);
    logEvent('payment_confirmed', {
      user_id: String(creditUserId),
      order_id: orderId,
      payment_id: paymentId,
      amount: paidAmount,
      status: 'finished',
    });
  }

  return { ok: true, credited };
}

function roundCrypto6(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}

/**
 * Admin: send USDT (BEP20) for an approved USD withdrawal, then complete wallet debit + ledger.
 */
export async function executeApprovedWithdrawalPayout(withdrawalId) {
  if (!enabled()) {
    const err = new Error('NOWPayments is not enabled');
    err.statusCode = 503;
    throw err;
  }
  const w = await walletRepo.getWithdrawalByIdForAdmin(withdrawalId);
  if (!w) {
    const err = new Error('Withdrawal not found');
    err.statusCode = 404;
    throw err;
  }
  if (w.status !== 'approved') {
    const err = new Error('Withdrawal must be approved before crypto payout');
    err.statusCode = 400;
    throw err;
  }
  logEvent('withdrawal_approved', {
    user_id: String(w.userId),
    payment_id: null,
    order_id: null,
    amount: Number(w.amount),
    status: String(w.status || ''),
  });

  const dest = String(w.destination || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(dest)) {
    const err = new Error('Withdrawal destination must be a valid BEP20 (0x…) address');
    err.statusCode = 400;
    throw err;
  }
  if (String(w.currency || 'USD').toUpperCase() !== 'USD') {
    const err = new Error('NOWPayments crypto payout supports USD wallet withdrawals only');
    err.statusCode = 400;
    throw err;
  }

  const email = (process.env.NOWPAYMENTS_ACCOUNT_EMAIL || '').trim();
  const password = (process.env.NOWPAYMENTS_ACCOUNT_PASSWORD || '').trim();
  if (!email || !password) {
    const err = new Error('NOWPAYMENTS_ACCOUNT_EMAIL and NOWPAYMENTS_ACCOUNT_PASSWORD must be set for payouts');
    err.statusCode = 503;
    throw err;
  }

  if (w.nowpaymentsPayoutRef != null) {
    const err = new Error('A NOWPayments payout was already submitted for this withdrawal');
    err.statusCode = 409;
    throw err;
  }

  const payCurrency = npClient.assertPayCurrency();
  const amount = roundCrypto6(w.amount);
  if (amount <= 0) {
    const err = new Error('Invalid withdrawal amount');
    err.statusCode = 400;
    throw err;
  }

  const token = await npClient.getPayoutAuthToken({ email, password });
  logEvent('withdrawal_requested', {
    user_id: String(w.userId),
    payment_id: null,
    order_id: null,
    amount: Number(w.amount),
    status: 'payout_request',
  });
  const payout = await npClient.postPayout({
    token,
    withdrawals: [{ address: dest, currency: payCurrency, amount }],
  });

  await walletRepo.updateTransaction(withdrawalId, {
    nowpaymentsPayoutRef: payout,
    nowpaymentsPayoutAt: new Date(),
  });

  try {
    await withdrawalService.processWithdrawal(withdrawalId, w.userId, `np-payout-${withdrawalId}`, {
      bypassFraudChecks: true,
      allowCryptoRailCompletion: true,
    });
  } catch (e) {
    logEvent('payout_failed', {
      user_id: String(w.userId),
      payment_id: null,
      order_id: null,
      amount: Number(w.amount),
      status: 'failed',
    });
    console.error(
      '[nowpayments] CRITICAL: payout API succeeded but wallet completion failed — reconcile manually',
      withdrawalId,
      e?.message
    );
    throw e;
  }

  logEvent('payout_sent', {
    user_id: String(w.userId),
    payment_id: null,
    order_id: null,
    amount: Number(w.amount),
    status: 'sent',
  });

  return { payout, withdrawalId };
}

export const __internals = {
  mapProviderStatus,
  deriveNetworkFromPayload,
  parsePaidAmount,
  toScaled,
};
