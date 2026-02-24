/**
 * Transaction controller — balance, list deposits/withdrawals, create deposit/withdrawal, transfer
 */
import depositService from './deposit.service.js';
import withdrawalService from './withdrawal.service.js';
import walletRepo from './wallet.repository.js';
import transferService from './transfer.service.js';

async function getBalance(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const currency = req.query.currency || 'USD';
    const wallet = await walletRepo.getOrCreateWallet(userId, currency);
    res.json({
      balance: wallet.balance,
      locked: wallet.locked || 0,
      currency: wallet.currency,
    });
  } catch (e) {
    next(e);
  }
}

async function listDeposits(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const list = await depositService.listDeposits(userId, limit);
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function listWithdrawals(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const list = await withdrawalService.listWithdrawals(userId, limit);
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function listTrades(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const list = await walletRepo.getTransactions(userId, { type: 'trade', limit });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function listTransfers(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const list = await walletRepo.getTransactions(userId, {
      type: ['transfer_in', 'transfer_out'],
      limit,
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function createDeposit(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { currency, amount, reference } = req.body;
    const result = await depositService.createDeposit(userId, currency, amount, reference);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

async function confirmDeposit(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const result = await depositService.confirmDeposit(id, userId);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function requestWithdrawal(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { currency, amount, destination } = req.body;
    const result = await withdrawalService.requestWithdrawal(userId, currency, amount, destination);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

async function processWithdrawal(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const result = await withdrawalService.processWithdrawal(id, userId);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function lookupTransferRecipient(req, res, next) {
  try {
    const { accountNo, email } = req.query;
    const input = accountNo || email || '';
    const result = await transferService.lookupRecipient(input);
    if (!result) {
      return res.json({ exists: false });
    }
    res.json({ exists: true, accountNo: result.accountNo });
  } catch (e) {
    next(e);
  }
}

async function executeTransfer(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { type, recipientAccountNoOrEmail, amount, currency, verification } = req.body;
    if (type !== 'internal') {
      return res.status(400).json({ error: 'Only internal transfers are supported' });
    }
    const result = await transferService.transferInternal(userId, {
      recipientAccountNoOrEmail,
      amount,
      currency: currency || 'USD',
      verification,
    });
    res.json(result);
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    next(e);
  }
}

export default {
  getBalance,
  listDeposits,
  listWithdrawals,
  listTrades,
  listTransfers,
  createDeposit,
  confirmDeposit,
  requestWithdrawal,
  processWithdrawal,
  lookupTransferRecipient,
  executeTransfer,
};
