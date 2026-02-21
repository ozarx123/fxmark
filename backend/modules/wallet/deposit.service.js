/**
 * Deposit service
 * Process deposits, credit wallet, ledger entries
 */
async function createDeposit(userId, currency, amount, reference) {
  // TODO: validate, create ledger entry, update wallet balance
  return { id: '', status: 'pending', amount };
}

async function confirmDeposit(depositId) {
  // TODO: mark completed, credit balance
  return { status: 'completed' };
}

module.exports = { createDeposit, confirmDeposit };
