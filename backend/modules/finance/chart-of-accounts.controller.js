/**
 * Chart of accounts controller — expose account codes and names
 */
import { ACCOUNTS, ACCOUNT_NAMES, getAccountType } from './chart-of-accounts.js';

async function getChartOfAccounts(req, res, next) {
  try {
    const accounts = Object.entries(ACCOUNTS).map(([key, code]) => ({
      code,
      name: ACCOUNT_NAMES[code] || code,
      type: getAccountType(code),
      key,
    }));
    const grouped = {
      assets: accounts.filter((a) => a.type === 'asset'),
      liabilities: accounts.filter((a) => a.type === 'liability'),
      equity: accounts.filter((a) => a.type === 'equity'),
      revenue: accounts.filter((a) => a.type === 'revenue'),
      expenses: accounts.filter((a) => a.type === 'expense'),
    };
    res.json({ accounts, grouped, names: ACCOUNT_NAMES });
  } catch (e) {
    next(e);
  }
}

export default { getChartOfAccounts };
