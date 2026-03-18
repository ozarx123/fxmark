/**
 * Finance reports controller — daily/monthly statements from ledger
 */
import ledgerService from './ledger.service.js';
import pnlService from './pnl.service.js';
import { ACCOUNT_NAMES, ACCOUNTS, getAccountType } from './chart-of-accounts.js';
import PDFDocument from 'pdfkit';

function computeEntryTotals(entries) {
  let totalDebits = 0;
  let totalCredits = 0;
  for (const e of entries) {
    totalDebits += Number(e.debit) || 0;
    totalCredits += Number(e.credit) || 0;
  }
  return { totalDebits, totalCredits, entryCount: entries.length };
}

function computeBalanceTotals(balances) {
  const wallet = balances[ACCOUNTS.WALLET] ?? 0;
  const totalAssets = (balances[ACCOUNTS.CASH_BANK] ?? 0) + (balances[ACCOUNTS.RECEIVABLES] ?? 0);
  const totalLiabilities = Math.abs((balances[ACCOUNTS.WALLET] ?? 0) + (balances[ACCOUNTS.CLIENT_FUNDS] ?? 0) + (balances[ACCOUNTS.PAYABLES] ?? 0));
  return { walletBalance: wallet, totalAssets, totalLiabilities };
}

async function dailyReport(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const entries = await ledgerService.listEntries(userId, {
      from: today.toISOString(),
      to: tomorrow.toISOString(),
      limit: 500,
    });
    const balances = await ledgerService.getBalances(userId, tomorrow.toISOString());
    const pnl = await pnlService.getPnlForPeriod(userId, today.toISOString(), tomorrow.toISOString());
    const withNames = entries.map((e) => ({ ...e, accountName: ACCOUNT_NAMES[e.accountCode] || e.accountCode }));
    const totals = computeEntryTotals(entries);
    const balanceTotals = computeBalanceTotals(balances);
    res.json({
      period: 'daily',
      date: today.toISOString().slice(0, 10),
      entries: withNames,
      balances: Object.entries(balances).map(([code, bal]) => ({ accountCode: code, accountName: ACCOUNT_NAMES[code] || code, balance: bal })),
      pnl,
      totals: { ...totals, ...balanceTotals },
    });
  } catch (e) {
    next(e);
  }
}

async function monthlyReport(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { year, month } = req.query;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59, 999);
    const entries = await ledgerService.listEntries(userId, {
      from: from.toISOString(),
      to: to.toISOString(),
      limit: 1000,
    });
    const balances = await ledgerService.getBalances(userId, to.toISOString());
    const pnl = await pnlService.getPnlForPeriod(userId, from.toISOString(), to.toISOString());
    const withNames = entries.map((e) => ({ ...e, accountName: ACCOUNT_NAMES[e.accountCode] || e.accountCode }));
    const totals = computeEntryTotals(entries);
    const balanceTotals = computeBalanceTotals(balances);
    res.json({
      period: 'monthly',
      year: y,
      month: m,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      entries: withNames,
      balances: Object.entries(balances).map(([code, bal]) => ({ accountCode: code, accountName: ACCOUNT_NAMES[code] || code, balance: bal })),
      pnl,
      totals: { ...totals, ...balanceTotals },
    });
  } catch (e) {
    next(e);
  }
}

async function statement(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { from, to, accountCode, limit } = req.query;
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const toDate = to ? new Date(to) : new Date();
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);
    const entries = await ledgerService.listEntries(userId, {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      accountCode: accountCode || undefined,
      limit: Math.min(parseInt(limit, 10) || 500, 2000),
    });
    const balances = await ledgerService.getBalances(userId, toDate.toISOString());
    const pnl = await pnlService.getPnlForPeriod(userId, fromDate.toISOString(), toDate.toISOString());
    const withNames = entries.map((e) => ({ ...e, accountName: ACCOUNT_NAMES[e.accountCode] || e.accountCode }));
    const totals = computeEntryTotals(entries);
    const balanceTotals = computeBalanceTotals(balances);
    res.json({
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      entries: withNames,
      balances: Object.entries(balances).map(([code, bal]) => ({ accountCode: code, accountName: ACCOUNT_NAMES[code] || code, balance: bal })),
      pnl,
      totals: { ...totals, ...balanceTotals },
    });
  } catch (e) {
    next(e);
  }
}

async function statementPdf(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { from, to, accountCode, limit } = req.query;
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const toDate = to ? new Date(to) : new Date();
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    const entries = await ledgerService.listEntries(userId, {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      accountCode: accountCode || undefined,
      limit: Math.min(parseInt(limit, 10) || 500, 2000),
    });
    const balances = await ledgerService.getBalances(userId, toDate.toISOString());
    const pnl = await pnlService.getPnlForPeriod(userId, fromDate.toISOString(), toDate.toISOString());

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${fromDate.toISOString().slice(0, 10)}_to_${toDate.toISOString().slice(0, 10)}.pdf"`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(18).text('Account Statement', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).text(`User: ${userId}`);
    doc.text(`Period: ${fromDate.toISOString().slice(0, 10)} to ${toDate.toISOString().slice(0, 10)}`);
    if (accountCode) {
      const name = ACCOUNT_NAMES[accountCode] || accountCode;
      doc.text(`Account: ${accountCode} — ${name}`);
    }
    doc.moveDown();

    // Statement entries (tabular layout)
    doc.moveDown(0.75);
    doc.font('Helvetica-Bold').fontSize(12).text('Entries', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);
    if (!entries.length) {
      doc.text('No entries in selected period.');
    } else {
      const tableLeft = doc.page.margins.left;
      const tableRight = doc.page.width - doc.page.margins.right;
      const colDate = tableLeft;
      const colAccount = colDate + 90;
      const colDesc = colAccount + 150;
      const colDebit = tableRight - 110;
      const colCredit = tableRight - 50;

      // Header row
      const headerY = doc.y;
      doc
        .font('Helvetica-Bold')
        .text('Date', colDate, headerY)
        .text('Account', colAccount, headerY)
        .text('Description', colDesc, headerY)
        .text('Debit', colDebit, headerY, { width: 50, align: 'right' })
        .text('Credit', colCredit, headerY, { width: 50, align: 'right' });

      doc.moveTo(tableLeft, headerY + 12).lineTo(tableRight, headerY + 12).stroke();
      doc.moveDown(0.5);

      doc.font('Helvetica');
      for (const e of entries) {
        // Page break if near bottom
        if (doc.y > doc.page.height - doc.page.margins.bottom - 40) {
          doc.addPage();
          const newHeaderY = doc.y;
          doc
            .font('Helvetica-Bold')
            .text('Date', colDate, newHeaderY)
            .text('Account', colAccount, newHeaderY)
            .text('Description', colDesc, newHeaderY)
            .text('Debit', colDebit, newHeaderY, { width: 50, align: 'right' })
            .text('Credit', colCredit, newHeaderY, { width: 50, align: 'right' });
          doc.moveTo(tableLeft, newHeaderY + 12).lineTo(tableRight, newHeaderY + 12).stroke();
          doc.moveDown(0.5);
          doc.font('Helvetica');
        }

        const date = e.createdAt || e.date || e.postedAt || '';
        const d = date ? new Date(date).toISOString().slice(0, 10) : '';
        const name = ACCOUNT_NAMES[e.accountCode] || e.accountCode;
        const desc = e.description || '';
        const debit = Number(e.debit) || 0;
        const credit = Number(e.credit) || 0;

        const startY = doc.y;
        let rowBottom = startY;

        // Date column
        doc.text(d, colDate, startY);
        rowBottom = Math.max(rowBottom, doc.y);

        // Account column
        doc.y = startY;
        doc.text(`${e.accountCode} ${name}`, colAccount, startY, { width: colDesc - colAccount - 6 });
        rowBottom = Math.max(rowBottom, doc.y);

        // Description column
        doc.y = startY;
        doc.text(desc, colDesc, startY, { width: colDebit - colDesc - 8 });
        rowBottom = Math.max(rowBottom, doc.y);

        // Debit column
        doc.y = startY;
        doc.text(debit ? debit.toFixed(2) : '', colDebit, startY, { width: 50, align: 'right' });
        rowBottom = Math.max(rowBottom, doc.y);

        // Credit column
        doc.y = startY;
        doc.text(credit ? credit.toFixed(2) : '', colCredit, startY, { width: 50, align: 'right' });
        rowBottom = Math.max(rowBottom, doc.y);

        // Move to start of next row with small padding
        doc.y = rowBottom + 2;
      }
    }

    // Balances & PnL summary
    const totals = computeEntryTotals(entries);
    const balanceTotals = computeBalanceTotals(balances);
    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(12).text('Summary', { underline: true });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Entries: ${totals.entryCount}`);
    doc.text(`Total Debits: ${totals.totalDebits.toFixed(2)}`);
    doc.text(`Total Credits: ${totals.totalCredits.toFixed(2)}`);
    doc.text(`Wallet Balance (2110): ${balanceTotals.walletBalance.toFixed(2)}`);
    doc.text(`Total Assets: ${balanceTotals.totalAssets.toFixed(2)}`);
    doc.text(`Total Liabilities: ${balanceTotals.totalLiabilities.toFixed(2)}`);
    if (pnl) {
      if (pnl.totalPnl != null) doc.text(`P&L (total): ${Number(pnl.totalPnl).toFixed(2)}`);
      if (pnl.tradingPnl != null) doc.text(`Trading P&L: ${Number(pnl.tradingPnl).toFixed(2)}`);
      if (pnl.fees != null) doc.text(`Fees: ${Number(pnl.fees).toFixed(2)}`);
    }

    // Chart of accounts appendix
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(16).text('Chart of Accounts', { align: 'center' });
    doc.moveDown();
    doc.font('Helvetica').fontSize(10);
    const codes = Object.keys(ACCOUNT_NAMES).sort();
    for (const code of codes) {
      const name = ACCOUNT_NAMES[code] || code;
      const type = getAccountType(code);
      doc.text(`${code}  ${name}  [${type}]`);
    }

    doc.end();
  } catch (e) {
    next(e);
  }
}

async function statementCsv(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { from, to, accountCode, limit } = req.query;
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const toDate = to ? new Date(to) : new Date();
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    const entries = await ledgerService.listEntries(userId, {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      accountCode: accountCode || undefined,
      limit: Math.min(parseInt(limit, 10) || 500, 2000),
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="statement-${fromDate.toISOString().slice(0, 10)}_to_${toDate.toISOString().slice(0, 10)}.csv"`,
    );

    const header = ['Date', 'AccountCode', 'AccountName', 'Description', 'Debit', 'Credit'].join(',');
    const lines = [header];

    for (const e of entries) {
      const date = e.createdAt || e.date || e.postedAt || '';
      const d = date ? new Date(date).toISOString().slice(0, 10) : '';
      const name = ACCOUNT_NAMES[e.accountCode] || e.accountCode;
      const desc = (e.description || '').replace(/"/g, '""');
      const debit = Number(e.debit) || 0;
      const credit = Number(e.credit) || 0;
      lines.push(
        [
          `"${d}"`,
          `"${e.accountCode || ''}"`,
          `"${name}"`,
          `"${desc}"`,
          debit.toFixed(2),
          credit.toFixed(2),
        ].join(','),
      );
    }

    res.send(lines.join('\n'));
  } catch (e) {
    next(e);
  }
}

export default { dailyReport, monthlyReport, statement, statementPdf, statementCsv };
