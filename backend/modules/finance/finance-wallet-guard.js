/**
 * Ensures wallet balance mutations run only inside an explicit paired wallet+ledger context.
 * Use runWithPairedWalletLedgerContext() around any code that calls walletRepo.updateBalance /
 * debitBalanceIfSufficient / setBalanceAbsolute (typically together with ledgerService in the same transaction).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/** @returns {{ label?: string } | undefined} */
export function getPairedWalletLedgerStore() {
  return storage.getStore();
}

/**
 * @param {() => Promise<T>} fn
 * @param {{ label?: string }} [meta]
 * @returns {Promise<T>}
 */
export function runWithPairedWalletLedgerContext(fn, meta = {}) {
  return storage.run({ paired: true, label: meta.label || 'unnamed', enteredAt: new Date().toISOString() }, fn);
}

export function isPairedWalletLedgerContextActive() {
  return !!storage.getStore()?.paired;
}

/**
 * @param {string} operation - e.g. updateBalance
 * @param {{ bypassPairedGuard?: boolean, session?: import('mongodb').ClientSession }} [options]
 */
export function assertPairedWalletLedgerAllowed(operation, options = {}) {
  if (options.bypassPairedGuard) return;
  if (isPairedWalletLedgerContextActive()) return;
  const err = new Error(
    `[wallet-guard] Blocked unpaired wallet mutation: ${operation}. ` +
      'Wrap with financialTransactionService.runPairedWithTransaction() or runWithPairedWalletLedgerContext() from finance-wallet-guard.js.'
  );
  err.code = 'WALLET_GUARD_UNPAIRED';
  err.statusCode = 500;
  throw err;
}
