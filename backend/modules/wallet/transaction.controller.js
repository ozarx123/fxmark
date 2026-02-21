/**
 * Transaction controller
 * List deposits/withdrawals, balance
 */
const depositService = require('./deposit.service');
const withdrawalService = require('./withdrawal.service');

async function getBalance(req, res, next) {
  try {
    // TODO: load wallet balance for req.user.id
    res.json({ balance: 0, currency: 'USD' });
  } catch (e) {
    next(e);
  }
}

async function listDeposits(req, res, next) {
  try {
    const list = []; // TODO: from depositService
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function listWithdrawals(req, res, next) {
  try {
    const list = []; // TODO: from withdrawalService
    res.json(list);
  } catch (e) {
    next(e);
  }
}

module.exports = { getBalance, listDeposits, listWithdrawals };
