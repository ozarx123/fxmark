/**
 * Client-side indicator computation from OHLC bars.
 * Used for chart overlays (MA, Bollinger, RSI) without backend time-series.
 * Bars: [{ time, open, high, low, close }] — time in Unix seconds.
 */

/** Simple moving average. Returns [{ time, value }]. */
export function sma(bars, period = 20) {
  if (!Array.isArray(bars) || bars.length < period) return [];
  const out = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += Number(bars[i - j].close) || 0;
    out.push({ time: bars[i].time, value: sum / period });
  }
  return out;
}

/** Standard deviation of last `period` closes ending at index i. */
function std(bars, i, period) {
  let sum = 0;
  for (let j = 0; j < period; j++) sum += Number(bars[i - j].close) || 0;
  const mean = sum / period;
  let sq = 0;
  for (let j = 0; j < period; j++) {
    const d = (Number(bars[i - j].close) || 0) - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / period);
}

/** Bollinger Bands. Returns { middle, upper, lower } arrays of { time, value }. */
export function bollingerBands(bars, period = 20, stdDev = 2) {
  if (!Array.isArray(bars) || bars.length < period) return { middle: [], upper: [], lower: [] };
  const middle = [];
  const upper = [];
  const lower = [];
  for (let i = period - 1; i < bars.length; i++) {
    const t = bars[i].time;
    let sum = 0;
    for (let j = 0; j < period; j++) sum += Number(bars[i - j].close) || 0;
    const m = sum / period;
    const s = std(bars, i, period);
    middle.push({ time: t, value: m });
    upper.push({ time: t, value: m + stdDev * s });
    lower.push({ time: t, value: m - stdDev * s });
  }
  return { middle, upper, lower };
}

/** RSI. Returns [{ time, value }] with value 0–100. */
export function rsi(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length < period + 1) return [];
  const out = [];
  for (let i = period; i < bars.length; i++) {
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
    out.push({ time: bars[i].time, value: Math.max(0, Math.min(100, rsiVal)) });
  }
  return out;
}

/** MACD. Returns { macdLine, signalLine, histogram } arrays of { time, value }. */
export function macd(bars, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!Array.isArray(bars) || bars.length < slowPeriod) return { macdLine: [], signalLine: [], histogram: [] };
  const ema = (data, period) => {
    const k = 2 / (period + 1);
    const out = [];
    let prev = data.slice(0, period).reduce((a, b) => a + (Number(b) || 0), 0) / period;
    for (let i = 0; i < data.length; i++) {
      const v = Number(data[i]) || 0;
      if (i < period) {
        out.push(prev);
        continue;
      }
      prev = v * k + prev * (1 - k);
      out.push(prev);
    }
    return out;
  };
  const closes = bars.map((b) => b.close);
  const fastEMA = ema(closes, fastPeriod);
  const slowEMA = ema(closes, slowPeriod);
  const macdLine = [];
  for (let i = slowPeriod - 1; i < bars.length; i++) {
    macdLine.push({ time: bars[i].time, value: fastEMA[i] - slowEMA[i] });
  }
  const signalValues = macdLine.map((m) => m.value);
  const signalEMA = ema(signalValues, signalPeriod);
  const signalLine = macdLine.map((m, i) => ({ time: m.time, value: signalEMA[i] ?? m.value }));
  const histogram = macdLine.map((m, i) => ({ time: m.time, value: (m.value - (signalLine[i]?.value ?? m.value)) }));
  return { macdLine, signalLine, histogram };
}
