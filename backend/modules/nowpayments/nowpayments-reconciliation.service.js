/**
 * NOWPayments deposit reconciliation — read-only comparison of NP orders vs wallet + ledger.
 * Does not mutate balances; flags mismatches for admin/ops review.
 */
import * as npRepo from './nowpayments.repository.js';
import walletRepo from '../wallet/wallet.repository.js';
import ledgerRepo from '../finance/ledger.repository.js';
import { ACCOUNTS } from '../finance/chart-of-accounts.js';

function normUid(u) {
  return u != null ? String(u) : '';
}

/**
 * @param {object} [options]
 * @param {number} [options.limit]
 * @returns {Promise<{ checkedAt: string, summary: object, mismatches: object[] }>}
 */
export async function runNowpaymentsDepositReconciliation(options = {}) {
  const limit = options.limit ?? 500;
  const rows = await npRepo.listOrdersForReconciliation(limit);
  const mismatches = [];
  let ok = 0;

  for (const np of rows) {
    const orderId = np.orderId != null ? String(np.orderId) : '';
    const paymentId = np.paymentId != null ? Number(np.paymentId) : null;
    const userId = normUid(np.userId);
    const depositId = np.depositTransactionId != null ? String(np.depositTransactionId) : null;
    const providerStatus = String(np.providerStatus || '').toLowerCase();
    const internalStatus = String(np.internalStatus || '');
    const credited = np.credited === true;
    const creditedAt = np.creditedAt ?? np.credited_at ?? null;
    const ledgerRef = np.ledgerReferenceId != null ? String(np.ledgerReferenceId) : null;

    const rowIssues = [];

    if (!depositId || !userId) {
      rowIssues.push({ code: 'missing_link', detail: 'depositTransactionId or userId missing on NP order' });
    } else {
      const tx = await walletRepo.getTransactionById(depositId, userId);
      if (!tx) {
        rowIssues.push({ code: 'wallet_tx_missing', detail: `No wallet_transactions row for deposit ${depositId}` });
      } else {
        if (tx.payment_method && String(tx.payment_method) !== 'nowpayments') {
          rowIssues.push({ code: 'wallet_method_mismatch', detail: `Expected nowpayments, got ${tx.payment_method}` });
        }
        if (credited && String(tx.status || '').toLowerCase() !== 'completed') {
          rowIssues.push({
            code: 'credited_but_wallet_not_completed',
            detail: `NP credited=true but wallet status=${tx.status}`,
          });
        }
        if (!credited && String(tx.status || '').toLowerCase() === 'completed' && providerStatus === 'finished') {
          rowIssues.push({
            code: 'wallet_completed_np_not_credited',
            detail: 'Wallet completed but NP order not marked credited',
          });
        }
      }

      if (credited) {
        const led = await ledgerRepo.listByReference('deposit', depositId);
        const walletLeg = (led || []).filter((e) => e.accountCode === ACCOUNTS.WALLET);
        if (!walletLeg.length) {
          rowIssues.push({ code: 'credited_missing_ledger_deposit', detail: `No ledger deposit entries for ref ${depositId}` });
        }
      }
      if (ledgerRef && ledgerRef !== depositId) {
        rowIssues.push({ code: 'ledger_ref_mismatch', detail: `ledgerReferenceId ${ledgerRef} !== deposit ${depositId}` });
      }
    }

    if (providerStatus === 'finished' && np.status !== 'finished' && !credited) {
      rowIssues.push({ code: 'provider_finished_inconsistent', detail: `provider finished but NP status=${np.status} credited=${credited}` });
    }
    if (['rejected', 'expired'].includes(String(np.status || '').toLowerCase()) && credited) {
      rowIssues.push({ code: 'bad_state_credited', detail: `Order ${np.status} but credited=true` });
    }

    if (rowIssues.length) {
      mismatches.push({
        orderId,
        payment_id: Number.isFinite(paymentId) ? paymentId : null,
        user_id: userId || null,
        provider_status: providerStatus,
        internal_status: internalStatus,
        np_status: np.status ?? null,
        credited,
        credited_at: creditedAt,
        ledger_reference_id: ledgerRef,
        deposit_transaction_id: depositId,
        issues: rowIssues,
      });
    } else {
      ok += 1;
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    summary: {
      rowsScanned: rows.length,
      ok,
      mismatchCount: mismatches.length,
    },
    mismatches,
  };
}

export default { runNowpaymentsDepositReconciliation };
