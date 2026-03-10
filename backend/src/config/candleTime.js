/**
 * Candle bar timing — when a candle period starts (UTC).
 * Aligns with Twelve Data API: timezone=UTC, intervals 1min, 5min, 15min, 1h, 1day.
 *
 * - 1m: bar starts at :00 seconds (e.g. 14:32:00)
 * - 5m: bar starts at :00, :05, :10, :15, :20, :25, :30, :35, :40, :45, :50, :55
 * - 15m: :00, :15, :30, :45
 * - 1h: bar starts at :00 minutes (e.g. 14:00:00)
 * - 1d: bar starts at 00:00:00 UTC (midnight)
 */

/** Timeframe to interval in seconds for bar alignment */
const TF_TO_SECONDS = {
  '1m': 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '1h': 60 * 60,
  '1d': 24 * 60 * 60,
};

/**
 * Get the start of the current candle period in UTC (Unix seconds).
 * @param {string} timeframe - 1m, 5m, 15m, 1h, 1d
 * @param {Date|number} [now] - Reference time (default: current time)
 * @returns {number} Unix timestamp (seconds) of bar open
 */
export function getCurrentBarStart(timeframe, now = new Date()) {
  const t = typeof now === 'number' ? now : now.getTime();
  const sec = Math.floor(t / 1000);
  const intervalSec = TF_TO_SECONDS[timeframe];
  if (!intervalSec) return sec;
  if (timeframe === '1d') {
    const d = new Date(sec * 1000);
    d.setUTCHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }
  return Math.floor(sec / intervalSec) * intervalSec;
}

/**
 * Get the start of the next candle period in UTC (Unix seconds).
 * @param {string} timeframe - 1m, 5m, 15m, 1h, 1d
 * @param {Date|number} [now] - Reference time (default: current time)
 * @returns {number} Unix timestamp (seconds) of next bar open
 */
export function getNextBarStart(timeframe, now = new Date()) {
  const intervalSec = TF_TO_SECONDS[timeframe];
  if (!intervalSec) return 0;
  const current = getCurrentBarStart(timeframe, now);
  return current + intervalSec;
}

/**
 * Seconds until the next bar starts (from now).
 * @param {string} timeframe - 1m, 5m, 15m, 1h, 1d
 * @param {Date|number} [now] - Reference time (default: current time)
 * @returns {number} Seconds until next bar open
 */
export function getSecondsToNextBar(timeframe, now = new Date()) {
  const t = typeof now === 'number' ? now : now.getTime();
  const sec = Math.floor(t / 1000);
  const next = getNextBarStart(timeframe, now);
  return Math.max(0, next - sec);
}
