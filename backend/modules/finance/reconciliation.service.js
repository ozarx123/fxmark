/**
 * Reconciliation service
 * Match ledger vs positions, external statements
 */
async function runReconciliation(period) {
  // TODO: compare balances, flag discrepancies
  return { status: 'ok', discrepancies: [] };
}

module.exports = { runReconciliation };
