/**
 * Candle bar timing — when a candle period starts (UTC).
 * Matches backend and Twelve Data: timezone=UTC.
 *
 * - 1m: bar at :00 seconds (e.g. 14:32:00)
 * - 5m: bar at :00, :05, :10, … :55
 * - 15m: :00, :15, :30, :45
 * - 1h: bar at :00 minutes (e.g. 14:00:00)
 * - 1d: 00:00:00 UTC (midnight)
 */

const TF_TO_SECONDS = {
  '1m': 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '1h': 60 * 60,
  '1d': 24 * 60 * 60,
};

/**
 * Start of the current candle period in UTC (Unix seconds).
 * @param {string} timeframe - 1m, 5m, 15m, 1h, 1d
 * @param {Date|number} [now] - Reference time (default: now)
 * @returns {number} Unix seconds
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
 * Start of the next candle period in UTC (Unix seconds).
 */
export function getNextBarStart(timeframe, now = new Date()) {
  const intervalSec = TF_TO_SECONDS[timeframe];
  if (!intervalSec) return 0;
  return getCurrentBarStart(timeframe, now) + intervalSec;
}

/**
 * Seconds until the next bar starts.
 */
export function getSecondsToNextBar(timeframe, now = new Date()) {
  const sec = Math.floor((typeof now === 'number' ? now : now.getTime()) / 1000);
  const next = getNextBarStart(timeframe, now);
  return Math.max(0, next - sec);
}
