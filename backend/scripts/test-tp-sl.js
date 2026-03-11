/**
 * Quick TP/SL logic test (no database).
 * Run from backend folder: node scripts/test-tp-sl.js
 */
import { evaluateTPLS } from '../modules/trading/positions.service.js';

function runCase(name, pos, price) {
  const result = evaluateTPLS(pos, price);
  console.log(`\n[${name}] price=${price}`);
  console.log('position:', { side: pos.side, takeProfit: pos.takeProfit, stopLoss: pos.stopLoss });
  console.log('result:', result);
}

// 1) BUY XAU/USD with SL below, price below SL → SL must hit
runCase(
  'BUY XAU SL hit',
  { symbol: 'XAU/USD', side: 'buy', takeProfit: null, stopLoss: 5194 },
  5184.71
);

// 2) BUY XAU/USD with TP above, price below TP → no TP
runCase(
  'BUY XAU TP not hit',
  { symbol: 'XAU/USD', side: 'buy', takeProfit: 5205, stopLoss: null },
  5195
);

// 3) BUY XAU/USD with TP above, price above TP → TP hit
runCase(
  'BUY XAU TP hit',
  { symbol: 'XAU/USD', side: 'buy', takeProfit: 5205, stopLoss: null },
  5210
);

// 4) SELL XAU/USD with SL above, price above SL → SL hit
runCase(
  'SELL XAU SL hit',
  { symbol: 'XAU/USD', side: 'sell', takeProfit: null, stopLoss: 5200 },
  5210
);

// 5) SELL XAU/USD with TP below, price below TP → TP hit
runCase(
  'SELL XAU TP hit',
  { symbol: 'XAU/USD', side: 'sell', takeProfit: 5180, stopLoss: null },
  5170
);

