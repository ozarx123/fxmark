/**
 * Reconciliation service — match ledger vs wallet/positions, flag discrepancies
 */
import walletRepo from '../wallet/wallet.repository.js';
import ledgerRepo from './ledger.repository.js';
import { ACCOUNTS } from './chart-of-accounts.js';

async function runReconciliation(userId, currency = 'USD') {
  const wallet = await walletRepo.getOrCreateWallet(userId, currency);
  const ledgerBalance = await ledgerRepo.getBalance(userId, ACCOUNTS.WALLET, null);

  const walletBal = wallet.balance ?? 0;
  const diff = Math.abs(walletBal - ledgerBalance);

  return {
    status: diff < 0.01 ? 'ok' : 'discrepancy',
    walletBalance: walletBal,
    ledgerBalance,
    discrepancy: diff >= 0.01 ? diff : 0,
    discrepancies: diff >= 0.01 ? [{ type: 'wallet_vs_ledger', amount: diff }] : [],
  };
}

export default { runReconciliation };
