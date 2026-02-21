/**
 * PAMM performance fee service
 * Calculate and deduct performance fee (e.g. high water mark)
 */
async function calculateFee(managerId, period) {
  // TODO: P&L since last fee, high water mark
  return { fee: 0, currency: 'USD' };
}

async function deductFee(managerId, amount) {
  // TODO: ledger entry, update manager balance
  return { deducted: true };
}

module.exports = { calculateFee, deductFee };
