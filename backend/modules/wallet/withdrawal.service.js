/**
 * Withdrawal service
 * Request, approve, payout; cutoff logic for PAMM
 */
async function requestWithdrawal(userId, currency, amount, destination) {
  // TODO: validate balance, create request, apply cutoff if PAMM
  return { id: '', status: 'pending', amount };
}

async function processWithdrawal(withdrawalId) {
  // TODO: execute payout, update balance, ledger
  return { status: 'completed' };
}

module.exports = { requestWithdrawal, processWithdrawal };
