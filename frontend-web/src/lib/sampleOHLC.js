/**
 * Sample OHLC generator — used as chart fallback when no real candle data is available.
 * Kept in a separate file so FxChart.jsx only exports React components (Vite Fast Refresh requirement).
 */

const TF_SECONDS = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

function toInternalSymbol(s) {
  return String(s || '').replace(/\//g, '').toUpperCase();
}

function getSamplePriceParams(symbol) {
  const s = toInternalSymbol(symbol);
  const isGold = s.includes('XAU') || s === 'GOLD';
  return isGold
    ? { range: 50, moveScale: 5, round: 2 }
    : { range: 0.02, moveScale: 0.002, round: 4 };
}

function getDefaultBase(symbol) {
  const s = toInternalSymbol(symbol);
  if (s.includes('XAU') || s === 'GOLD') return 3000;
  if (s === 'USDJPY') return 149.8;
  if (s === 'USDCHF') return 0.882;
  if (s === 'USDCAD') return 1.358;
  if (s === 'AUDUSD') return 0.645;
  if (s === 'NZDUSD') return 0.592;
  if (s === 'GBPUSD') return 1.295;
  return 1.1555;
}

/**
 * Generate sample OHLC bars ending at the current time, centered on a known price.
 * @param {number}  bars        Number of bars
 * @param {string}  timeframe   1m | 5m | 15m | 1h | 4h | 1d
 * @param {number}  seed        PRNG seed
 * @param {string}  symbol      Symbol string (used for precision + defaults)
 * @param {number|null} centerPrice  Price to center the fake data around
 */
export function generateSampleOHLC(bars = 80, timeframe = '1h', seed = 0, symbol = '', centerPrice = null) {
  const { range, moveScale, round } = getSamplePriceParams(symbol);
  const base = (centerPrice != null && isFinite(centerPrice) && centerPrice > 0)
    ? centerPrice
    : getDefaultBase(symbol);
  const mult = Math.pow(10, round);
  const intervalSec = TF_SECONDS[timeframe] ?? 3600;

  const nowSec = Math.floor(Date.now() / 1000);
  const alignedNow = Math.floor(nowSec / intervalSec) * intervalSec;
  const startSec = alignedNow - (bars - 1) * intervalSec;

  const rng = (() => {
    let s = seed || 1;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  })();

  const data = [];
  let open = base + (rng() - 0.5) * range;

  for (let i = 0; i < bars; i++) {
    const move = (rng() - 0.48) * moveScale;
    const close = open + move;
    const high = Math.max(open, close) + rng() * moveScale * 0.5;
    const low = Math.min(open, close) - rng() * moveScale * 0.5;
    data.push({
      time: startSec + i * intervalSec,
      open: Math.round(open * mult) / mult,
      high: Math.round(high * mult) / mult,
      low: Math.round(low * mult) / mult,
      close: Math.round(close * mult) / mult,
    });
    open = close;
  }
  return data;
}
