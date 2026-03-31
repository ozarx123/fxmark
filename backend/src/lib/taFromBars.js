/**
 * Minimal RSI / MACD from OHLC bars (same math as frontend indicatorUtils) for /market/technical.
 * Bars: oldest first, { time, close }.
 */

export function rsiLast(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length < period + 1) return null;
  const i = bars.length - 1;
  let gains = 0;
  let losses = 0;
  for (let j = 1; j <= period; j++) {
    const ch = (Number(bars[i - j + 1].close) || 0) - (Number(bars[i - j].close) || 0);
    if (ch > 0) gains += ch;
    else losses -= ch;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsiVal = 100 - 100 / (1 + rs);
  return Math.max(0, Math.min(100, rsiVal));
}

function emaSeries(closes, period) {
  const k = 2 / (period + 1);
  const out = [];
  let prev = closes.slice(0, period).reduce((a, b) => a + (Number(b) || 0), 0) / period;
  out.push(prev);
  for (let i = period; i < closes.length; i++) {
    const v = Number(closes[i]) || 0;
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Last MACD histogram from closes (12/26/9). */
export function macdLast(bars) {
  if (!Array.isArray(bars) || bars.length < 35) return null;
  const closes = bars.map((b) => Number(b.close) || 0);
  const fastPeriod = 12;
  const slowPeriod = 26;
  const signalPeriod = 9;

  const fastEma = emaSeries(closes, fastPeriod);
  const slowEma = emaSeries(closes, slowPeriod);
  const offset = slowPeriod - fastPeriod;
  const macdLine = [];
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset] - slowEma[i]);
  }
  const signalLine = emaSeries(
    macdLine.map((x) => x),
    signalPeriod
  );
  const hist = macdLine.slice(signalPeriod - 1).map((m, i) => m - signalLine[i]);
  return hist.length ? hist[hist.length - 1] : null;
}

export function macdTripleLast(bars) {
  if (!Array.isArray(bars) || bars.length < 35) return { macd: null, macd_signal: null, macd_hist: null };
  const closes = bars.map((b) => Number(b.close) || 0);
  const fastPeriod = 12;
  const slowPeriod = 26;
  const signalPeriod = 9;
  const fastEma = emaSeries(closes, fastPeriod);
  const slowEma = emaSeries(closes, slowPeriod);
  const offset = slowPeriod - fastPeriod;
  const macdLine = [];
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset] - slowEma[i]);
  }
  const signalLine = emaSeries(
    macdLine.map((x) => x),
    signalPeriod
  );
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSig = signalLine[signalLine.length - 1];
  const lastHist = lastMacd - lastSig;
  return {
    macd: Number.isFinite(lastMacd) ? lastMacd : null,
    macd_signal: Number.isFinite(lastSig) ? lastSig : null,
    macd_hist: Number.isFinite(lastHist) ? lastHist : null,
  };
}
