/**
 * Chart overlay helpers: liquidity zones (touch-density), S/R for breakout.
 * No volume data — use OHLC touch counts per price level.
 */

/**
 * Compute liquidity zones from candle data: price levels with most "touches" (high-low range).
 * @param {Array<{ time, open, high, low, close }>} bars
 * @param {number} gridSteps - number of price buckets
 * @param {number} topN - return top N levels
 * @returns {number[]} sorted price levels (strongest first)
 */
export function liquidityLevels(bars, gridSteps = 50, topN = 5) {
  if (!Array.isArray(bars) || bars.length < 5) return [];
  const prices = bars.flatMap((b) => [
    Number(b.high),
    Number(b.low),
    Number(b.open),
    Number(b.close),
  ]).filter(Number.isFinite);
  if (prices.length === 0) return [];
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const bucketSize = range / gridSteps;
  const counts = new Map();

  bars.forEach((b) => {
    const lo = Math.min(Number(b.low), Number(b.high), Number(b.open), Number(b.close));
    const hi = Math.max(Number(b.low), Number(b.high), Number(b.open), Number(b.close));
    const step = bucketSize > 0 ? (hi - lo) / Math.max(1, Math.ceil((hi - lo) / bucketSize)) : bucketSize;
    for (let p = lo; p <= hi; p += step || bucketSize) {
      const key = Math.round(p / bucketSize) * bucketSize;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  });

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([price]) => price);
  return sorted.sort((a, b) => a - b);
}

/**
 * Recent support/resistance from last N bars: highest high, lowest low.
 * @param {Array<{ time, high, low, close }>} bars
 * @param {number} lookback
 * @returns {{ resistance: number, support: number, lastClose: number, lastTime: number }}
 */
export function recentSupportResistance(bars, lookback = 20) {
  if (!Array.isArray(bars) || bars.length === 0) return { resistance: null, support: null, lastClose: null, lastTime: null };
  const slice = bars.slice(-lookback);
  const highs = slice.map((b) => Number(b.high)).filter(Number.isFinite);
  const lows = slice.map((b) => Number(b.low)).filter(Number.isFinite);
  const last = bars[bars.length - 1];
  return {
    resistance: highs.length ? Math.max(...highs) : null,
    support: lows.length ? Math.min(...lows) : null,
    lastClose: last && Number.isFinite(Number(last.close)) ? Number(last.close) : null,
    lastTime: last?.time ?? null,
  };
}

/**
 * Detect breakout: close above resistance = breakout up, close below support = breakdown.
 * @param {{ resistance: number, support: number, lastClose: number }} sr
 * @returns {'up'|'down'|null}
 */
export function detectBreakout(sr) {
  if (sr.lastClose == null) return null;
  if (sr.resistance != null && sr.lastClose > sr.resistance) return 'up';
  if (sr.support != null && sr.lastClose < sr.support) return 'down';
  return null;
}
