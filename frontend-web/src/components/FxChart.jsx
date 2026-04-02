import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { getCurrentBarStart } from '../lib/candleTime.js';
import { generateSampleOHLC } from '../lib/sampleOHLC.js';
import { sma, bollingerBands, rsi } from '../lib/indicatorUtils.js';
import { liquidityLevels, recentSupportResistance, detectBreakout } from '../lib/chartOverlays.js';

// ── Debug flag ────────────────────────────────────────────────────────────────
const DEBUG = import.meta.env.DEV;
function dbg(...args)     { if (DEBUG) console.log('[FxChart]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[FxChart]', ...args); }

function toInternalSymbol(s) {
  return String(s || '').replace(/\//g, '').toUpperCase();
}
function toDisplaySymbol(s) {
  const internal = toInternalSymbol(s);
  if (!internal) return s || 'EUR/USD';
  if (internal === 'GOLD') return 'XAU/USD';
  if (internal.length === 6) return `${internal.slice(0, 3)}/${internal.slice(3)}`;
  return internal;
}
function isGoldSymbol(symbol) {
  const s = toInternalSymbol(symbol);
  return s.includes('XAU') || s === 'GOLD';
}

/** Lightweight Charts requires Unix seconds. */
function toBarTime(t) {
  if (t == null) return 0;
  if (typeof t === 'number' && Number.isFinite(t)) {
    return t > 1e12 ? Math.floor(t / 1000) : t;
  }
  if (typeof t === 'string') {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  }
  if (t instanceof Date) return Math.floor(t.getTime() / 1000);
  if (typeof t === 'object' && typeof t.getTime === 'function')
    return Math.floor(t.getTime() / 1000);
  return 0;
}

function normalizeTime(t) {
  return t > 1e12 ? Math.floor(t / 1000) : t;
}

/** Bar start (Unix seconds) for tick wall time and chart timeframe. */
function getCandleTime(rawTime, tf) {
  let ms;
  if (rawTime == null || rawTime === '') {
    ms = Date.now();
  } else if (typeof rawTime === 'number') {
    ms = rawTime < 1e12 ? rawTime * 1000 : rawTime;
  } else {
    const parsed = Date.parse(String(rawTime));
    ms = Number.isFinite(parsed) ? parsed : Date.now();
  }
  return getCurrentBarStart(tf, new Date(Number.isFinite(ms) ? ms : Date.now()));
}

/**
 * Merge REST last bar with in-memory bar updated by ticks.
 * We usually prefer tick close when feeds agree (fresher last trade).
 * If tick close and REST close diverge a lot, the tick path is often stale, wrong symbol,
 * or a different venue — REST OHLC is the candle aggregate we requested and is safer for the chart.
 */
function mergeLastBar(restBar, liveBar, symbol) {
  if (!restBar || !liveBar) return restBar;

  const rt = normalizeTime(restBar.time);
  const lt = normalizeTime(liveBar.time);

  if (rt !== lt) return restBar;

  const ro = Number(restBar.open);
  const rh = Number(restBar.high);
  const rl = Number(restBar.low);
  const rc = Number(restBar.close);
  const lo = Number(liveBar.open);
  const lh = Number(liveBar.high);
  const ll = Number(liveBar.low);
  const lc = Number(liveBar.close);

  if (Number.isFinite(rc) && Number.isFinite(lc)) {
    const absDiff = Math.abs(lc - rc);
    const rel = absDiff / Math.abs(rc);
    const gold = isGoldSymbol(symbol || '');
    const tickDisagreesWithRest = gold
      ? rel > 0.0006 || absDiff > 2.5
      : rel > 0.0015;
    if (tickDisagreesWithRest) {
      dbg(
        `merge: tick close ${lc} vs REST close ${rc} (${symbol}) — using REST OHLC for this bar`,
      );
      return {
        time: rt,
        open: Number.isFinite(ro) ? ro : lo,
        high: Number.isFinite(rh) ? rh : lh,
        low: Number.isFinite(rl) ? rl : ll,
        close: rc,
      };
    }
  }

  // REST carries exchange OHLC; live ticks may only repeat last price (e.g. Twelve WS:
  // open=high=low=close=price). Combine: keep REST open; widen H/L with live; C from live.
  const highs = [rh, lh, lc].filter((x) => Number.isFinite(x));
  const lows = [rl, ll, lc].filter((x) => Number.isFinite(x));
  let high = highs.length ? Math.max(...highs) : rh;
  let low = lows.length ? Math.min(...lows) : rl;
  if (!Number.isFinite(high)) high = Number.isFinite(rh) ? rh : Number.isFinite(lh) ? lh : lc;
  if (!Number.isFinite(low)) low = Number.isFinite(rl) ? rl : Number.isFinite(ll) ? ll : lc;

  return {
    time: rt,
    open: Number.isFinite(ro) ? ro : lo,
    high,
    low,
    close: Number.isFinite(lc) ? lc : Number.isFinite(rc) ? rc : lc,
  };
}

/** Find newest live bar with the same normalized bar time (length may differ from REST). */
function findLiveBarSameTime(prevLive, restLastBar) {
  if (!prevLive?.length || !restLastBar) return null;
  const nt = normalizeTime(restLastBar.time);
  for (let i = prevLive.length - 1; i >= 0; i--) {
    if (normalizeTime(prevLive[i].time) === nt) return prevLive[i];
  }
  return null;
}

/**
 * Lightweight Charts v5 rejects duplicate `time` and some invalid shapes — then setData throws
 * and the pane stays empty while price lines (entry/SL) still show.
 */
function sanitizeCandlesForLwc(bars) {
  if (!Array.isArray(bars) || !bars.length) return [];
  const sorted = [...bars].sort((a, b) => {
    const ta = typeof a.time === 'number' ? normalizeTime(a.time) : toBarTime(a.time);
    const tb = typeof b.time === 'number' ? normalizeTime(b.time) : toBarTime(b.time);
    return ta - tb;
  });
  const byTime = new Map();
  for (const b of sorted) {
    const t = typeof b.time === 'number' ? normalizeTime(b.time) : toBarTime(b.time);
    if (!Number.isFinite(t) || t <= 0) continue;
    let o = Number(b.open);
    let h = Number(b.high);
    let l = Number(b.low);
    let c = Number(b.close);
    if (!Number.isFinite(c) && b.value != null) c = Number(b.value);
    if (!Number.isFinite(c)) continue;
    if (!Number.isFinite(o)) o = c;
    if (!Number.isFinite(h)) h = c;
    if (!Number.isFinite(l)) l = c;
    const hi = Math.max(h, o, c);
    const lo = Math.min(l, o, c);
    byTime.set(t, { time: t, open: o, high: hi, low: lo, close: c });
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

/** Aligned with backend `MAX_CHART_CANDLES` — merged REST+live must not exceed (avoids 1500→1501 setData churn). */
const MAX_CHART_BARS = 1500;

function sameBarTimes(prev, next) {
  if (!prev?.length || !next?.length || prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (normalizeTime(prev[i].time) !== normalizeTime(next[i].time)) return false;
  }
  return true;
}

function barOhlcEqual(a, b, showCandles) {
  if (!a || !b) return false;
  if (normalizeTime(a.time) !== normalizeTime(b.time)) return false;
  if (showCandles) {
    return (
      Number(a.open) === Number(b.open) &&
      Number(a.high) === Number(b.high) &&
      Number(a.low) === Number(b.low) &&
      Number(a.close) === Number(b.close)
    );
  }
  return Number(a.close) === Number(b.close);
}

/** -1 if identical; else first index where OHLC differs */
function firstOhlcDiffIndex(prev, next, showCandles) {
  const n = Math.min(prev.length, next.length);
  for (let i = 0; i < n; i++) {
    if (!barOhlcEqual(prev[i], next[i], showCandles)) return i;
  }
  return -1;
}

function clonePlotSnapshot(plotData, showCandles) {
  return plotData.map((b) => {
    const t = normalizeTime(b.time);
    if (showCandles) {
      return {
        time: t,
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
      };
    }
    return { time: t, close: Number(b.close) };
  });
}

/**
 * FX Trading Chart — TradingView Lightweight Charts.
 *
 * Strict data-flow contract:
 *   REST candles → series.setData()  — initial load, symbol/TF change, container mount
 *   Live tick    → series.update()   — every tick, RAF-coalesced (only when hasRealData)
 */
/** Round price to symbol precision (XAU: 2 decimals, forex: 4). */
function roundToTick(price, symbol) {
  if (price == null || !Number.isFinite(price)) return price;
  const prec = isGoldSymbol(symbol) ? 2 : 4;
  const mult = Math.pow(10, prec);
  return Math.round(Number(price) * mult) / mult;
}

/** Validate and round new SL/TP. Returns valid price or null. BUY: SL < entry, TP > entry; SELL: SL > entry, TP < entry. */
function validateSLTP(entry, side, newPrice, type, symbol) {
  const price = roundToTick(newPrice, symbol);
  if (price == null || !Number.isFinite(price)) return null;
  const ent = Number(entry);
  if (!Number.isFinite(ent)) return price;
  const isBuy = (side || 'buy').toLowerCase() === 'buy';
  if (type === 'sl') {
    if (isBuy && price >= ent) return null;
    if (!isBuy && price <= ent) return null;
  } else {
    if (isBuy && price <= ent) return null;
    if (!isBuy && price >= ent) return null;
  }
  return price;
}

function FxChart({
  symbol     = 'EUR/USD',
  height     = 400,
  showCandles = true,
  data: externalData,
  tick,
  timeframe  = '1m',
  loading    = false,
  error      = null,
  wsConnected = false,
  marketPrice = null,
  positions  = [],
  pendingOrders = [],
  tool       = 'hairline',
  onModifySLTP = null,
  indicators = {},
  drawings = [],
  showHeatmap = false,
  showBreakoutDetection = false,
  onBreakout = null,
  isReplayMode = false,
  crosshairPanel = false,
  measureMode = false,
  chartResetTrigger = 0,
  chartBarSpacing = null,
}) {
  const displaySymbol = toDisplaySymbol(symbol);
  const chartSymbolKey = toInternalSymbol(symbol);

  // ── DOM / chart refs ────────────────────────────────────────────────────────
  const chartContainerRef = useRef(null);
  const chartRef          = useRef(null);
  const seriesRef         = useRef(null);
  /** Refs to SL/TP price lines per position (for drag update and rollback). Entry lines are tracked separately in entryLinesRef. */
  const priceLineRefsRef  = useRef(new Map());
  /** Refs to entry price lines only — cleared before redraw so we never stack duplicate entry labels. */
  const entryLinesRef     = useRef([]);
  /** Refs to SL price lines only — one line per unique price. */
  const slLinesRef        = useRef([]);
  /** Refs to TP price lines only — one line per unique price. */
  const tpLinesRef        = useRef([]);
  /** Line series for trend-line drawings (id -> series). */
  const drawingTrendSeriesRef = useRef(new Map());
  /** Drag state: { positionId, type: 'sl'|'tp', entry, side, originalPrice } */
  const dragStateRef      = useRef(null);
  /** Store drag listeners so we can remove them on unmount. */
  const dragListenersRef  = useRef({ onMove: null, onUp: null });
  const [modifyLoading, setModifyLoading] = useState(false);
  const [modifyError, setModifyError] = useState(null);
  const [handlePositions, setHandlePositions] = useState({});
  const [crosshairData, setCrosshairData] = useState(null);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [chartSeriesError, setChartSeriesError] = useState(null);
  const chartSizeVersionRef = useRef(0);
  const chartResetTriggerRef = useRef(0);
  const chartBarSpacingRef = useRef(null);
  /** Indicator line series refs — cleared when chart is recreated. */
  const indicatorSeriesRef = useRef({ ma: null, bbUpper: null, bbMiddle: null, bbLower: null, rsi: null });
  const chartIdRef = useRef(0);

  // ── Live-update refs (read inside RAF — no stale closures) ──────────────────
  const dataRef          = useRef([]);
  const symbolRef        = useRef(displaySymbol);
  const timeframeRef     = useRef(timeframe);
  const showCandlesRef   = useRef(showCandles);

  const tickQueueRef     = useRef([]);
  const rafScheduledRef  = useRef(false);
  /** Latest applyPendingTick — setData effect runs before useCallback would be valid in deps order */
  const applyPendingTickRef = useRef(() => {});

  // isSampleDataRef: true while dataRef holds generated sample bars.
  // Written only in the ref-sync useEffect, NEVER in useMemo.
  const isSampleDataRef  = useRef(false);

  // hasActivatedLiveModeRef: true only while we have real REST candles (same as hasRealData).
  // Ticks alone must not set this — WS can work while /candles returns 503; otherwise setData
  // is skipped and the chart stays stuck on sample with "live mode" false-positive.
  const hasActivatedLiveModeRef = useRef(false);
  const hasRealDataRef = useRef(false);
  /** Snapshot of last full/incremental apply — avoids full setData(1500) when only the merged last bar changed */
  const lastAppliedPlotRef = useRef(null);

  // ── Render-phase symbol/timeframe-change detection ──────────────────────────
  // Runs synchronously in the render body so refs are reset BEFORE any effects
  // or RAF callbacks fire in the new cycle.
  const prevSymbolActRef    = useRef(displaySymbol);
  const prevTimeframeActRef = useRef(timeframe);
  if (
    prevSymbolActRef.current    !== displaySymbol ||
    prevTimeframeActRef.current !== timeframe
  ) {
    prevSymbolActRef.current    = displaySymbol;
    prevTimeframeActRef.current = timeframe;
    // Reset live-mode gate so new symbol/TF starts fresh (sample data allowed again)
    hasActivatedLiveModeRef.current = false;
    isSampleDataRef.current         = false;
    lastAppliedPlotRef.current      = null;
  }

  const [containerReady, setContainerReady] = useState(false);

  // ── Processed data (real REST candles or synthetic sample) ──────────────────
  const hasRealData = Array.isArray(externalData) && externalData.length > 0;
  hasRealDataRef.current = hasRealData;

  // Only feed marketPrice into the memo when there is no real data.
  // If it were always a dep, every tick (which updates marketPrice) would
  // re-run the memo, re-allocate 200 objects, and call series.setData() — bad.
  const sampleCenterPrice = hasRealData ? null : marketPrice;

  // PURE memo — no side effects, no ref writes.
  const data = useMemo(() => {
    const arr = hasRealData
      ? [...externalData]
      : generateSampleOHLC(
          80,
          timeframe,
          displaySymbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0),
          displaySymbol,
          sampleCenterPrice
        );

    arr.sort((a, b) => toBarTime(a.time) - toBarTime(b.time));

    const prec = isGoldSymbol(displaySymbol) ? 2 : 4;
    const mult = Math.pow(10, prec);
    return arr.map((b) => ({
      ...b,
      time:  toBarTime(b.time),
      open:  Math.round((Number(b.open)  || 0) * mult) / mult,
      high:  Math.round((Number(b.high)  || 0) * mult) / mult,
      low:   Math.round((Number(b.low)   || 0) * mult) / mult,
      close: Math.round((Number(b.close) || 0) * mult) / mult,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalData, hasRealData, displaySymbol, timeframe, sampleCenterPrice]);

  // ── Ref-sync effect — runs after every render that changes these values ──────
  // This is the ONLY place isSampleDataRef and hasActivatedLiveModeRef are written
  // (except the render-phase reset above).
  //
  // When REST refetches (bar timer / cache), `data` from props can lag live ticks.
  // Preserve live-appended bars (N+1) and merge overlapping last bar OHLC when times match.
  useEffect(() => {
    const prevLive = dataRef.current || [];
    const prevSym = symbolRef.current;
    let next = Array.isArray(data) ? [...data] : [];

    if (prevSym === displaySymbol && hasRealData && Array.isArray(data) && data.length && prevLive.length) {
      const restLen = data.length;
      const lastIn = next[restLen - 1];
      // Match by bar time, not index — prevLive may have an extra forward bar so
      // prevLive[restLen-1] is the wrong row; without merge, setData() replaces OHLC with flat ticks.
      if (lastIn != null) {
        const matchLive = findLiveBarSameTime(prevLive, lastIn);
        if (matchLive) {
          const mergedLast = mergeLastBar(lastIn, matchLive, displaySymbol);
          next = [...next.slice(0, -1), mergedLast];
        }
      }

      if (prevLive.length > next.length) {
        const lastRestTime = normalizeTime(next[next.length - 1]?.time);
        const seen = new Set(next.map((b) => normalizeTime(b.time)));
        const extraLiveBars = prevLive.filter((b) => {
          const t = normalizeTime(b.time);
          return t > lastRestTime && !seen.has(t);
        });
        next = [...next, ...extraLiveBars];
      }
    }

    if (next.length > MAX_CHART_BARS) {
      dbg(`ref-sync: trim ${next.length} → ${MAX_CHART_BARS} bars (keep newest)`);
      next = next.slice(-MAX_CHART_BARS);
    }

    dataRef.current        = next;
    symbolRef.current      = displaySymbol;
    timeframeRef.current   = timeframe;
    showCandlesRef.current = showCandles;

    // Mirror whether current data is sample or real; live-mode tracks REST only (not ticks).
    isSampleDataRef.current = !hasRealData;
    hasActivatedLiveModeRef.current = !!hasRealData;
    if (!hasRealData) tickQueueRef.current = [];
  }, [data, displaySymbol, timeframe, showCandles, hasRealData, containerReady]);

  // ── Chart instance — recreated on symbol, height, or series-type change ──────
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!containerReady || !container) return;

    lastAppliedPlotRef.current = null;

    const w = container.clientWidth || 100;
    const h = container.clientHeight || height;

    dbg(`Creating chart for ${displaySymbol}`);

    const chart = createChart(container, {
      layout: {
        background: { type: 'solid', color: '#1a0a0a' },
        textColor: 'rgba(255, 255, 255, 0.8)',
        fontFamily: 'system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.08)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.08)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.2)',
        scaleMargins: { top: 0.1, bottom: 0.2 },
        autoScale: true,
      },
      localization: {
        priceFormatter: (price) =>
          Number(price).toFixed(isGoldSymbol(displaySymbol) ? 2 : 4),
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.2)',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 10,
        rightBarOffset: 12,
        minBarSpacing: 4,
      },
      crosshair: {
        mode: 'normal',
        vertLine: { labelBackgroundColor: '#de1414' },
        horzLine: { labelBackgroundColor: '#de1414' },
      },
      /* Pan: wheel, click-drag, horizontal/vertical touch drag. Zoom: wheel, pinch, axis drag; double-click axis resets. */
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
        axisDoubleClickReset: true,
      },
      kineticScroll: {
        touch: true,
        mouse: false,
      },
      width: w,
      height: h,
    });

    const priceFormat = {
      type: 'price',
      precision: isGoldSymbol(displaySymbol) ? 2 : 4,
      minMove:   isGoldSymbol(displaySymbol) ? 0.01 : 0.0001,
    };

    seriesRef.current = showCandles
      ? chart.addSeries(CandlestickSeries, {
          // Inverted & brighter: solid green up candles, solid red down candles
          upColor: '#16a34a',
          downColor: '#ff0000',
          borderUpColor: '#16a34a',
          borderDownColor: '#ff0000',
          wickUpColor: '#16a34a',
          wickDownColor: '#ff0000',
          priceFormat,
        })
      : chart.addSeries(LineSeries, {
          color: '#f97373',
          lineWidth: 2,
          lastValueVisible: true,
          priceLineVisible: true,
          priceFormat,
        });

    chartRef.current        = chart;
    chartIdRef.current      = (chartIdRef.current || 0) + 1;
    tickQueueRef.current    = [];
    rafScheduledRef.current = false;
    indicatorSeriesRef.current = { ma: null, bbUpper: null, bbMiddle: null, bbLower: null, rsi: null };

    const applySize = () => {
      const el = chartContainerRef.current;
      if (!el || !chartRef.current) return;
      const cw = el.clientWidth || 100;
      const ch = el.clientHeight || height;
      chartRef.current.applyOptions({ width: cw, height: ch });
      // Recompute SL/TP handle positions after resize so handles stay aligned with lines
      const series = seriesRef.current;
      if (onModifySLTP && series && typeof series.priceToCoordinate === 'function') {
        const lineRefs = priceLineRefsRef.current;
        const next = {};
        lineRefs.forEach((ref, posId) => {
          try {
            if (ref.sl != null) next[`${posId}_sl`] = series.priceToCoordinate(ref.sl);
            if (ref.tp != null) next[`${posId}_tp`] = series.priceToCoordinate(ref.tp);
          } catch (_) { /* ignore */ }
        });
        requestAnimationFrame(() => setHandlePositions(next));
      }
    };
    window.addEventListener('resize', applySize);
    const ro = new ResizeObserver(applySize);
    ro.observe(container);
    // Flex layouts often report 0×0 on first mount; next frame + RO has real dimensions.
    requestAnimationFrame(() => applySize());

    return () => {
      window.removeEventListener('resize', applySize);
      ro.disconnect();
      tickQueueRef.current    = [];
      rafScheduledRef.current = false;
      indicatorSeriesRef.current = { ma: null, bbUpper: null, bbMiddle: null, bbLower: null, rsi: null };
      drawingTrendSeriesRef.current.forEach((s) => {
        try { chart.removeSeries(s); } catch (_) { /* ignore */ }
      });
      drawingTrendSeriesRef.current.clear();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, [containerReady, height, showCandles, displaySymbol]);

  // ── Indicator overlays (MA, BB, RSI) — computed from candle data, no chart recreation ─
  const ind = indicators || {};
  const indMa = ind.ma && (ind.ma.enabled || ind.ma === true);
  const indBb = ind.bb && (ind.bb.enabled || ind.bb === true);
  const indRsi = ind.rsi && (ind.rsi.enabled || ind.rsi === true);
  const maPeriod = (ind.ma && ind.ma.period) || 20;
  const bbPeriod = (ind.bb && ind.bb.period) || 20;
  const bbStd = (ind.bb && ind.bb.stdDev) || 2;
  const rsiPeriod = (ind.rsi && ind.rsi.period) || 14;
  useEffect(() => {
    const chart = chartRef.current;
    const mainSeries = seriesRef.current;
    if (!chart || !mainSeries || !Array.isArray(data) || data.length < 2) return;

    const priceFormat = {
      type: 'price',
      precision: isGoldSymbol(displaySymbol) ? 2 : 4,
      minMove: isGoldSymbol(displaySymbol) ? 0.01 : 0.0001,
    };
    const refs = indicatorSeriesRef.current;

    const removeSeries = (s) => {
      if (s) {
        try {
          chart.removeSeries(s);
        } catch (_) { /* ignore */ }
      }
    };

    if (indMa) {
      const maData = sma(data, maPeriod);
      if (maData.length === 0) return;
      if (!refs.ma) {
        refs.ma = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 1,
          priceScaleId: 'right',
          priceFormat,
        });
      }
      try {
        refs.ma.setData(maData);
      } catch (_) { /* ignore */ }
    } else {
      removeSeries(refs.ma);
      refs.ma = null;
    }

    if (indBb) {
      const { middle, upper, lower } = bollingerBands(data, bbPeriod, bbStd);
      if (middle.length === 0) return;
      if (!refs.bbUpper) {
        refs.bbUpper = chart.addSeries(LineSeries, { color: 'rgba(34, 197, 94, 0.6)', lineWidth: 1, priceScaleId: 'right', priceFormat });
        refs.bbMiddle = chart.addSeries(LineSeries, { color: 'rgba(34, 197, 94, 0.8)', lineWidth: 1, priceScaleId: 'right', priceFormat });
        refs.bbLower = chart.addSeries(LineSeries, { color: 'rgba(34, 197, 94, 0.6)', lineWidth: 1, priceScaleId: 'right', priceFormat });
      }
      try {
        refs.bbUpper.setData(upper);
        refs.bbMiddle.setData(middle);
        refs.bbLower.setData(lower);
      } catch (_) { /* ignore */ }
    } else {
      removeSeries(refs.bbUpper);
      removeSeries(refs.bbMiddle);
      removeSeries(refs.bbLower);
      refs.bbUpper = refs.bbMiddle = refs.bbLower = null;
    }

    if (indRsi) {
      const rsiData = rsi(data, rsiPeriod);
      if (rsiData.length === 0) return;
      if (!refs.rsi) {
        refs.rsi = chart.addSeries(LineSeries, {
          color: '#8b5cf6',
          lineWidth: 1,
          priceScaleId: 'rsi',
          priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
        });
        refs.rsi.priceScale().applyOptions({ scaleMargins: { top: 0.9, bottom: 0 }, borderVisible: false });
      }
      try {
        refs.rsi.setData(rsiData);
      } catch (_) { /* ignore */ }
    } else {
      removeSeries(refs.rsi);
      refs.rsi = null;
    }
  }, [data, displaySymbol, indMa, indBb, indRsi, maPeriod, bbPeriod, bbStd, rsiPeriod]);

  // ── Drawing tools: trend lines (separate line series, not price lines) ───────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const drawingList = Array.isArray(drawings) ? drawings.filter((d) => d.type === 'trend') : [];
    const trendRefs = drawingTrendSeriesRef.current;
    const dataArr = Array.isArray(data) ? data : [];
    if (!dataArr.length) {
      trendRefs.forEach((lineSeries) => { try { chart.removeSeries(lineSeries); } catch (_) { /* ignore */ } });
      trendRefs.clear();
      return;
    }
    const seen = new Set();
    const firstTime = toBarTime(dataArr[0].time);
    const lastTime = toBarTime(dataArr[dataArr.length - 1].time);
    const priceFormat = {
      type: 'price',
      precision: isGoldSymbol(displaySymbol) ? 2 : 4,
      minMove: isGoldSymbol(displaySymbol) ? 0.01 : 0.0001,
    };

    drawingList.forEach((d) => {
      const id = d.id;
      if (!id) return;
      seen.add(id);
      const t1 = d.time != null ? toBarTime(d.time) : firstTime;
      const t2 = d.time2 != null ? toBarTime(d.time2) : lastTime;
      const p1 = d.price != null && Number.isFinite(Number(d.price)) ? Number(d.price) : null;
      const p2 = d.price2 != null && Number.isFinite(Number(d.price2)) ? Number(d.price2) : null;
      if (p1 == null || p2 == null) return;
      if (!trendRefs.get(id)) {
        const lineSeries = chart.addSeries(LineSeries, {
          color: 'rgba(59, 130, 246, 0.9)',
          lineWidth: 2,
          priceScaleId: 'right',
          priceFormat,
        });
        trendRefs.set(id, lineSeries);
      }
      const lineSeries = trendRefs.get(id);
      try {
        lineSeries.setData([
          { time: t1, value: p1 },
          { time: t2, value: p2 },
        ]);
      } catch (_) { /* ignore */ }
    });

    trendRefs.forEach((lineSeries, id) => {
      if (!seen.has(id)) {
        try {
          chart.removeSeries(lineSeries);
        } catch (_) { /* ignore */ }
        trendRefs.delete(id);
      }
    });
  }, [drawings, data, displaySymbol]);

  // ── Update crosshair based on selected tool (hairline vs none) ──────────────
  useEffect(() => {
    if (!chartRef.current) return;
    const showCrosshair = tool === 'hairline';
    chartRef.current.applyOptions({
      crosshair: {
        mode: showCrosshair ? 1 : 0, // 1 = normal, 0 = hidden
        vertLine: {
          labelBackgroundColor: '#de1414',
          color: 'rgba(255,255,255,0.3)',
          visible: showCrosshair,
        },
        horzLine: {
          labelBackgroundColor: '#de1414',
          color: 'rgba(255,255,255,0.3)',
          visible: showCrosshair,
        },
      },
    });
  }, [tool]);

  // ── Position price lines (entry, SL, TP) + Pending order lines for current symbol ─
  // Deps: positions, pendingOrders, displaySymbol, chartSymbolKey so lines stay in sync; chart is NOT recreated here.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const lineRefs = new Map();
    priceLineRefsRef.current = lineRefs;

    // Clear existing entry/SL/TP lines before drawing (prevents stacked duplicates).
    [entryLinesRef, slLinesRef, tpLinesRef].forEach((ref) => {
      if (ref.current && ref.current.length > 0) {
        ref.current.forEach((line) => {
          try {
            series.removePriceLine(line);
          } catch (_) { /* ignore */ }
        });
        ref.current = [];
      }
    });

    try {
      const priceLines = series.priceLines?.() ?? [];
      priceLines.forEach((line) => {
        try {
          series.removePriceLine(line);
        } catch (_) { /* ignore */ }
      });
    } catch (_) { /* ignore */ }

    const isGold = isGoldSymbol(displaySymbol);
    const fmt = (v) => (v != null ? Number(v).toFixed(isGold ? 2 : 4) : '');

    const posList = Array.isArray(positions) ? positions.filter((p) => toInternalSymbol(p.symbol) === chartSymbolKey) : [];
    const priceKeyDecimals = isGold ? 2 : 5;

    // Build unique entry map first — one key per (side, normalized price). Entry lines created ONLY from this map.
    const uniqueEntries = new Map();
    posList.forEach((pos) => {
      const entry = pos.openPrice ?? pos.open_price ?? pos.entry;
      if (entry == null || !Number.isFinite(Number(entry))) return;
      const price = Number(entry).toFixed(priceKeyDecimals);
      const side = (pos.side || pos.type || 'buy').toLowerCase();
      const key = `${side}_${price}`;
      if (!uniqueEntries.has(key)) {
        uniqueEntries.set(key, { price, side });
      }
    });

    // Draw entry lines ONLY from uniqueEntries — never inside position loop.
    uniqueEntries.forEach(({ price, side }) => {
      const line = series.createPriceLine({
        price: Number(price),
        color: side === 'buy' ? '#22c55e' : '#ef4444',
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `Entry ${price}`,
      });
      entryLinesRef.current.push(line);
    });

    // Build unique SL map — one key per normalized price.
    const uniqueSL = new Map();
    posList.forEach((pos) => {
      const sl = pos.sl ?? pos.sl_price ?? pos.stopLoss;
      if (sl == null || !Number.isFinite(Number(sl))) return;
      const price = Number(sl).toFixed(priceKeyDecimals);
      if (!uniqueSL.has(price)) uniqueSL.set(price, { price });
    });
    uniqueSL.forEach(({ price }) => {
      const line = series.createPriceLine({
        price: Number(price),
        color: '#ef5350',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `SL ${price}`,
      });
      slLinesRef.current.push(line);
    });

    // Build unique TP map — one key per normalized price.
    const uniqueTP = new Map();
    posList.forEach((pos) => {
      const tp = pos.tp ?? pos.tp_price ?? pos.takeProfit;
      if (tp == null || !Number.isFinite(Number(tp))) return;
      const price = Number(tp).toFixed(priceKeyDecimals);
      if (!uniqueTP.has(price)) uniqueTP.set(price, { price });
    });
    uniqueTP.forEach(({ price }) => {
      const line = series.createPriceLine({
        price: Number(price),
        color: '#26a69a',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `TP ${price}`,
      });
      tpLinesRef.current.push(line);
    });

    // Position loop: refs only (for drag). NO entry/SL/TP line creation here.
    posList.forEach((pos) => {
      const entry = pos.openPrice ?? pos.open_price;
      const sl = pos.sl ?? pos.sl_price ?? pos.stopLoss;
      const tp = pos.tp ?? pos.tp_price ?? pos.takeProfit;
      const side = (pos.side || pos.type || 'buy').toLowerCase();
      const ref = {
        entry: entry != null ? Number(entry) : null,
        sl: sl != null ? Number(sl) : null,
        tp: tp != null ? Number(tp) : null,
        side,
        entryLine: null,
        slLine: null,
        tpLine: null,
      };
      lineRefs.set(pos.id, ref);
    });

    const pendingList = Array.isArray(pendingOrders) ? pendingOrders.filter((o) => toInternalSymbol(o.symbol) === chartSymbolKey) : [];
    pendingList.forEach((o) => {
      const pr = o.price;
      if (pr == null || !Number.isFinite(Number(pr))) return;
      const vol = o.volume ?? o.lots ?? 0;
      const typeLabel = (o.type || '').replace(/_/g, ' ');
      series.createPriceLine({
        price: Number(pr),
        color: '#9c27b0',
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: true,
        title: `${typeLabel} ${vol} @ ${fmt(pr)}`,
      });
    });

    // Drawing tools: horizontal, sr, rectangle (price lines on main series)
    const drawingList = Array.isArray(drawings) ? drawings : [];
    drawingList.forEach((d) => {
      const price = d.price != null && Number.isFinite(Number(d.price)) ? Number(d.price) : null;
      const price2 = d.price2 != null && Number.isFinite(Number(d.price2)) ? Number(d.price2) : null;
      if (d.type === 'horizontal' || d.type === 'sr') {
        if (price != null) {
          series.createPriceLine({
            price,
            color: d.type === 'sr' ? '#f59e0b' : 'rgba(255,255,255,0.4)',
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: d.title || (d.type === 'sr' ? `S/R ${fmt(price)}` : fmt(price)),
          });
        }
      } else if (d.type === 'rectangle' && price != null) {
        series.createPriceLine({
          price,
          color: 'rgba(34, 197, 94, 0.5)',
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: fmt(price),
        });
        if (price2 != null) {
          series.createPriceLine({
            price: price2,
            color: 'rgba(34, 197, 94, 0.5)',
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: fmt(price2),
          });
        }
      }
    });

    // Heatmap: liquidity zones as horizontal price lines
    if (showHeatmap && Array.isArray(data) && data.length >= 5) {
      const levels = liquidityLevels(data, 50, 5);
      levels.forEach((price) => {
        series.createPriceLine({
          price,
          color: 'rgba(59, 130, 246, 0.35)',
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: fmt(price),
        });
      });
    }

    if (onModifySLTP && typeof series.priceToCoordinate === 'function') {
      const next = {};
      posList.forEach((pos) => {
        const ref = lineRefs.get(pos.id);
        if (!ref) return;
        try {
          if (ref.sl != null) next[`${pos.id}_sl`] = series.priceToCoordinate(ref.sl);
          if (ref.tp != null) next[`${pos.id}_tp`] = series.priceToCoordinate(ref.tp);
        } catch (_) { /* ignore */ }
      });
      requestAnimationFrame(() => setHandlePositions(next));
    } else {
      setHandlePositions({});
    }
  }, [positions, pendingOrders, drawings, showHeatmap, data, displaySymbol, chartSymbolKey, containerReady, onModifySLTP]);

  // ── History loader — series.setData() is ONLY called here ───────────────────
  //
  // Guards:
  //   1. Skip entirely if live mode is active AND data is sample (not real).
  //      This prevents the brief "loading" window during bar-boundary REST
  //      refetch (when setCandles([]) fires first) from overwriting live data
  //      with 80 sample bars.
  //   2. Skip empty-array clear when live mode is active (same reason).
  //
  useEffect(() => {
    if (!containerReady || !seriesRef.current) return;

    // Guard 1 & 2: once live, never revert to sample or empty
    if (hasActivatedLiveModeRef.current && !hasRealData) {
      dbg(`setData: SKIPPED — live mode active, data is ${data.length ? 'sample' : 'empty'}`);
      return;
    }

    if (!data.length) {
      dbg('setData: clearing chart (symbol switch or initial empty)');
      setChartSeriesError(null);
      lastAppliedPlotRef.current = null;
      dataRef.current = [];
      seriesRef.current.setData([]);
      try {
        chartRef.current?.timeScale()?.fitContent();
      } catch (_) { /* ignore */ }
      return;
    }

    const rawPlot = dataRef.current;
    const plotData = sanitizeCandlesForLwc(rawPlot);
    if (rawPlot.length && !plotData.length) {
      const msg = 'Candle data was invalid after sanitization (check API OHLC).';
      dbgWarn('setData:', msg, 'rawLen=', rawPlot.length);
      setChartSeriesError(msg);
      lastAppliedPlotRef.current = null;
      dataRef.current = [];
      try {
        seriesRef.current.setData([]);
      } catch (_) { /* ignore */ }
      return;
    }
    if (plotData.length < rawPlot.length) {
      dbgWarn(`setData: sanitized ${rawPlot.length} → ${plotData.length} bars (duplicate times or bad rows)`);
    }
    dataRef.current = plotData;
    setChartSeriesError(null);

    let cancelled = false;
    let rafId = 0;

    const flushTickQueue = () => {
      requestAnimationFrame(() => {
        if (!cancelled) applyPendingTickRef.current();
      });
    };

    const series = seriesRef.current;
    const prevSnap = lastAppliedPlotRef.current;

    // REST refetch + ref-sync often only adjusts the last bar OHLC vs live ticks.
    // Full setData(1500) resets the series, time scale, and feels like a freeze/glitch.
    if (
      hasRealData &&
      prevSnap &&
      prevSnap.length === plotData.length &&
      sameBarTimes(prevSnap, plotData)
    ) {
      const diffAt = firstOhlcDiffIndex(prevSnap, plotData, showCandles);
      if (diffAt === -1) {
        flushTickQueue();
        return () => {
          cancelled = true;
          if (rafId) cancelAnimationFrame(rafId);
        };
      }
      if (diffAt === plotData.length - 1) {
        try {
          const b = plotData[diffAt];
          if (showCandles) series.update(b);
          else series.update({ time: b.time, value: b.close });
          lastAppliedPlotRef.current = clonePlotSnapshot(plotData, showCandles);
          flushTickQueue();
          return () => {
            cancelled = true;
            if (rafId) cancelAnimationFrame(rafId);
          };
        } catch (e) {
          dbgWarn('last-bar merge update failed, falling back to full setData:', e.message);
        }
      }
    }

    dbg(`setData: loading ${plotData.length} bars (real=${hasRealData}), last time=${plotData[plotData.length - 1]?.time}`);

    const applySeriesAndRange = () => {
      if (cancelled || !seriesRef.current) return;
      try {
        if (showCandles) {
          seriesRef.current.setData(plotData);
        } else {
          seriesRef.current.setData(plotData.map(({ time, close }) => ({ time, value: close })));
        }
      } catch (e) {
        dbgWarn('setData threw:', e.message);
        setChartSeriesError(e.message || 'Chart failed to load series');
        return;
      }

      lastAppliedPlotRef.current = clonePlotSnapshot(plotData, showCandles);

      const ts = chartRef.current?.timeScale();
      const len = plotData.length;
      try {
        if (len > 70) ts?.setVisibleLogicalRange({ from: len - 70, to: len - 1 });
        else ts?.fitContent();
        ts?.scrollToRealTime();
      } catch (e) {
        dbgWarn('timeScale range:', e.message);
      }

      flushTickQueue();
    };

    // Large first paint (e.g. 1500 bars) blocks the main thread and feels frozen; yield one frame
    // so the shell/layout can paint, then apply series data.
    if (plotData.length >= 200) {
      rafId = requestAnimationFrame(applySeriesAndRange);
    } else {
      applySeriesAndRange();
    }

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [data, showCandles, containerReady, hasRealData]);

  // ── Chart updater — stable function, all deps via refs ──────────────────────
  //
  // Defined as useCallback([]) so the same function reference is reused across
  // renders. requestAnimationFrame always captures the same identity, and all
  // internal state is read through refs — no stale closures possible.
  //
  const applyPendingTick = useCallback(function applyPendingTick() {
    const series = seriesRef.current;
    if (!series) return;
    if (!hasRealDataRef.current) return;

    while (tickQueueRef.current.length > 0) {
      const arr = dataRef.current || [];
      // Do not shift until series data exists — otherwise ticks are dropped while REST/ref-sync
      // is still catching up (first open), and live updates never appear until refresh.
      if (!arr.length) break;

      const tickData = tickQueueRef.current.shift();
      if (!tickData) continue;

      const rawPrice = tickData.close ?? tickData.price;
      if (!Number.isFinite(Number(rawPrice))) continue;

      const tf = timeframeRef.current || '1m';
      const prec = isGoldSymbol(symbolRef.current) ? 2 : 4;
      const mult = Math.pow(10, prec);
      const round = (n) => Math.round(Number(n) * mult) / mult;
      const p = round(Number(rawPrice));

      const tickWallMs = (() => {
        if (typeof tickData.timestamp === 'number' && Number.isFinite(tickData.timestamp)) {
          const t = tickData.timestamp;
          return t < 1e12 ? t * 1000 : t;
        }
        const d = tickData.datetime;
        if (d != null) {
          if (typeof d === 'number' && Number.isFinite(d)) {
            return d < 1e12 ? d * 1000 : d;
          }
          const parsed = Date.parse(String(d));
          if (Number.isFinite(parsed)) return parsed;
        }
        return Date.now();
      })();
      const tickBarTime = normalizeTime(getCandleTime(Number.isFinite(tickWallMs) ? tickWallMs : Date.now(), tf));

      const lastBar = arr[arr.length - 1];
      const lastTime = normalizeTime(lastBar.time);

      let newBar;

      if (tickBarTime < lastTime) {
        continue;
      }

      if (tickBarTime === lastTime) {
        const updatedBar = {
          ...lastBar,
          close: p,
          high: round(Math.max(Number(lastBar.high), p)),
          low: round(Math.min(Number(lastBar.low), p)),
        };
        arr[arr.length - 1] = updatedBar;
        dataRef.current = arr;
        try {
          if (showCandlesRef.current) series.update(updatedBar);
          else series.update({ time: lastBar.time, value: p });
        } catch (e) {
          dbgWarn('same-bar update failed:', e.message);
        }
        continue;
      }

      if (tickBarTime > lastTime) {
        // `p` from this tickData is the first dequeued tick for this bar — defines open (FIFO queue preserves order)
        newBar = {
          time: tickBarTime,
          open: p,
          high: p,
          low: p,
          close: p,
        };
        arr.push(newBar);
        dataRef.current = arr;
        try {
          if (showCandlesRef.current) series.update(newBar);
          else series.update({ time: tickBarTime, value: p });
        } catch (e) {
          dbgWarn('new-bar update failed:', e.message);
        }
        chartRef.current?.timeScale()?.scrollToRealTime();
        continue;
      }
    }
  // Empty deps — every internal value is read through a ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  applyPendingTickRef.current = applyPendingTick;

  // ── Live tick → RAF path ─────────────────────────────────────────────────────
  //
  // Tick arrives via the `tick` prop (MarketDataContext → useMarketData → parent).
  // This is the single authoritative tick stream — no second direct socket
  // subscription is opened here, eliminating duplicate listeners and memory
  // leak risk on remounts.
  //
  // The `tick` prop is already filtered to the correct symbol by useMarketData
  // (`poolTick = ticks[internalSymbol]`), so no symbol check is needed here.
  //
  // Chart utilities: reset and zoom (triggered by parent)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ts = chart.timeScale();
    if (chartResetTrigger != null && chartResetTrigger > chartResetTriggerRef.current) {
      chartResetTriggerRef.current = chartResetTrigger;
      ts.fitContent();
    }
  }, [chartResetTrigger]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chartBarSpacing == null || !Number.isFinite(chartBarSpacing)) return;
    chart.timeScale().applyOptions({ barSpacing: Math.max(2, Math.min(100, chartBarSpacing)) });
  }, [chartBarSpacing]);

  // Crosshair data panel
  useEffect(() => {
    const chart = chartRef.current;
    const mainSeries = seriesRef.current;
    if (!crosshairPanel || !chart || !mainSeries) {
      setCrosshairData(null);
      return;
    }
    const unsub = chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.time == null) {
        setCrosshairData(null);
        return;
      }
      const d = param.seriesData.get(mainSeries);
      if (!d) {
        setCrosshairData(null);
        return;
      }
      const ohlc = d.open != null ? d : null;
      setCrosshairData({
        time: param.time,
        open: ohlc?.open,
        high: ohlc?.high,
        low: ohlc?.low,
        close: ohlc?.close ?? d.value,
      });
    });
    return () => {
      unsub();
      setCrosshairData(null);
    };
  }, [crosshairPanel, containerReady]);

  // Measure tool: click to set A then B, show delta
  useEffect(() => {
    const chart = chartRef.current;
    const mainSeries = seriesRef.current;
    if (!measureMode || !chart || !mainSeries) {
      setMeasurePoints([]);
      return;
    }
    const unsub = chart.subscribeClick((param) => {
      if (!param.point || !mainSeries.coordinateToPrice) return;
      try {
        const price = mainSeries.coordinateToPrice(param.point.y);
        const time = param.time;
        if (price != null && Number.isFinite(price)) {
          setMeasurePoints((prev) => {
            const next = [...prev, { time, price }];
            return next.length <= 2 ? next : [{ time, price }];
          });
        }
      } catch (_) { /* ignore */ }
    });
    return () => {
      unsub();
      setMeasurePoints([]);
    };
  }, [measureMode, containerReady]);

  // Breakout detection: set markers and optional callback
  const breakoutFiredRef = useRef(null);
  useEffect(() => {
    const series = seriesRef.current;
    if (!showBreakoutDetection || !series || !Array.isArray(data) || data.length < 2) {
      if (series && typeof series.setMarkers === 'function') series.setMarkers([]);
      return;
    }
    const sr = recentSupportResistance(data, 20);
    const direction = detectBreakout(sr);
    const last = data[data.length - 1];
    const lastTime = last?.time;
    if (direction && lastTime != null) {
      const marker = direction === 'up'
        ? { time: lastTime, position: 'aboveBar', color: '#16a34a', shape: 'arrowDown' }
        : { time: lastTime, position: 'belowBar', color: '#ef5350', shape: 'arrowUp' };
      try {
        series.setMarkers([marker]);
      } catch (_) { /* ignore */ }
      const key = `${lastTime}-${direction}`;
      if (onBreakout && breakoutFiredRef.current !== key) {
        breakoutFiredRef.current = key;
        onBreakout(direction, sr);
      }
    } else {
      try {
        series.setMarkers([]);
      } catch (_) { /* ignore */ }
      breakoutFiredRef.current = null;
    }
  }, [data, showBreakoutDetection, onBreakout]);

  useEffect(() => {
    if (isReplayMode || !tick) return;

    const rawPrice = tick.close ?? tick.price;
    if (!Number.isFinite(Number(rawPrice))) return;

    // Buffer the tick — applyPendingTick will consume it via RAF.
    // Include timestamp for bar-boundary alignment (provider/server time when available).
    // Must match applyPendingTick tickWallMs: < 1e12 → seconds (×1000), else already ms.
    // Using 1e13 wrongly treats normal Unix ms (~1.7e12) as seconds → wrong bar bucket / candles.
    const tickMs = (() => {
      if (tick.timestamp != null && Number.isFinite(tick.timestamp)) {
        const t = tick.timestamp;
        return t < 1e12 ? t * 1000 : t;
      }
      if (tick.providerTs != null && Number.isFinite(tick.providerTs)) {
        const t = tick.providerTs;
        return t < 1e12 ? t * 1000 : t;
      }
      const d = tick.datetime;
      if (d != null) {
        if (typeof d === 'number' && Number.isFinite(d)) {
          return d < 1e12 ? d * 1000 : d;
        }
        const parsed = Date.parse(String(d));
        if (Number.isFinite(parsed)) return parsed;
      }
      return Date.now();
    })();
    tickQueueRef.current.push({
      close:    Number(rawPrice),
      price:    Number(rawPrice),
      open:     tick.open,
      high:     tick.high,
      low:      tick.low,
      datetime: tick.datetime,
      timestamp: Number.isFinite(tickMs) ? tickMs : Date.now(),
    });

    if (!seriesRef.current) return; // chart not ready — tick is buffered above

    if (!rafScheduledRef.current) {
      rafScheduledRef.current = true;
      requestAnimationFrame(() => {
        rafScheduledRef.current = false;
        applyPendingTick();
      });
    }
  }, [tick, applyPendingTick]);

  const handleSLTPDragStart = useCallback((positionId, type, e) => {
    if (!onModifySLTP || !chartContainerRef.current || !seriesRef.current) return;
    const series = seriesRef.current;
    if (typeof series.coordinateToPrice !== 'function') return;
    const ref = priceLineRefsRef.current.get(positionId);
    if (!ref || (type === 'sl' && !ref.slLine) || (type === 'tp' && !ref.tpLine)) return;
    const originalPrice = type === 'sl' ? ref.sl : ref.tp;
    dragStateRef.current = { positionId, type, entry: ref.entry, side: ref.side, originalPrice };
    setModifyError(null);

    const onMove = (moveEvent) => {
      const container = chartContainerRef.current;
      if (!container || !dragStateRef.current) return;
      const rect = container.getBoundingClientRect();
      const localY = moveEvent.clientY - rect.top;
      let price;
      try {
        price = series.coordinateToPrice(localY);
      } catch (_) {
        return;
      }
      if (price == null || !Number.isFinite(price)) return;
      const valid = validateSLTP(ref.entry, ref.side, price, type, displaySymbol);
      if (valid == null) return;
      const line = type === 'sl' ? ref.slLine : ref.tpLine;
      if (line && typeof line.applyOptions === 'function') {
        const prec = isGoldSymbol(displaySymbol) ? 2 : 4;
        line.applyOptions({ price: valid, title: `${type === 'sl' ? 'SL' : 'TP'} ${valid.toFixed(prec)}` });
        if (type === 'sl') ref.sl = valid; else ref.tp = valid;
      }
      dragStateRef.current.currentPrice = valid;
    };

    const onUp = async (upEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      dragListenersRef.current = { onMove: null, onUp: null };
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (!state || state.currentPrice == null || state.currentPrice === state.originalPrice) return;
      const lineRef = priceLineRefsRef.current.get(state.positionId);
      const line = state.type === 'sl' ? lineRef?.slLine : lineRef?.tpLine;
      setModifyLoading(true);
      try {
        if (state.type === 'sl') {
          await onModifySLTP(state.positionId, { stopLoss: state.currentPrice });
        } else {
          await onModifySLTP(state.positionId, { takeProfit: state.currentPrice });
        }
      } catch (err) {
        if (line && typeof line.applyOptions === 'function') {
          const prec = isGoldSymbol(displaySymbol) ? 2 : 4;
          line.applyOptions({
            price: state.originalPrice,
            title: `${state.type === 'sl' ? 'SL' : 'TP'} ${Number(state.originalPrice).toFixed(prec)}`,
          });
        }
        setModifyError(err?.message ?? 'Failed to update');
      } finally {
        setModifyLoading(false);
      }
    };

    dragListenersRef.current = { onMove, onUp };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onModifySLTP, displaySymbol]);

  // Remove drag listeners on unmount if user dragged and then navigated away
  useEffect(() => {
    return () => {
      const l = dragListenersRef.current;
      if (l?.onMove) document.removeEventListener('mousemove', l.onMove);
      if (l?.onUp) document.removeEventListener('mouseup', l.onUp);
      dragListenersRef.current = { onMove: null, onUp: null };
    };
  }, []);

  return (
    <div className="fx-chart-wrap" style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        ref={(el) => {
          chartContainerRef.current = el;
          setContainerReady(!!el);
        }}
        className="fx-chart-container-host"
        style={{ flex: 1, minHeight: 0, width: '100%' }}
      />
      {onModifySLTP && Object.keys(handlePositions).length > 0 && (
        <div
          className="fx-chart-sltp-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 24,
              pointerEvents: 'auto',
              cursor: modifyLoading ? 'wait' : 'default',
            }}
          >
            {Object.entries(handlePositions).map(([key, y]) => {
              const [posId, t] = key.split('_');
              const type = t === 'sl' ? 'sl' : 'tp';
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  title={type === 'sl' ? 'Drag to modify Stop Loss' : 'Drag to modify Take Profit'}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: Number.isFinite(y) ? y - 6 : 0,
                    width: 24,
                    height: 12,
                    pointerEvents: 'auto',
                    cursor: modifyLoading ? 'wait' : 'ns-resize',
                    background: type === 'sl' ? 'rgba(239,83,80,0.5)' : 'rgba(38,166,154,0.5)',
                    borderRadius: 2,
                    border: '1px solid rgba(255,255,255,0.4)',
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSLTPDragStart(posId, type, e);
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
      {chartSeriesError && (
        <div
          className="fx-chart-series-error"
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: 8,
            maxWidth: 'min(100%, 420px)',
            fontSize: 12,
            color: '#fecaca',
            background: 'rgba(127,29,29,0.92)',
            padding: '8px 10px',
            borderRadius: 6,
            zIndex: 2,
            pointerEvents: 'none',
          }}
          role="alert"
        >
          {chartSeriesError}
        </div>
      )}
      {modifyError && (
        <div className="fx-chart-sltp-error" style={{ position: 'absolute', bottom: 4, left: 4, right: 4, fontSize: 11, color: '#ef5350', background: 'rgba(0,0,0,0.7)', padding: 4, borderRadius: 4 }}>
          {modifyError}
        </div>
      )}
      {crosshairPanel && crosshairData && (
        <div className="fx-chart-crosshair-panel">
          <span>O {crosshairData.open != null ? Number(crosshairData.open).toFixed(isGoldSymbol(displaySymbol) ? 2 : 4) : '—'}</span>
          <span>H {crosshairData.high != null ? Number(crosshairData.high).toFixed(isGoldSymbol(displaySymbol) ? 2 : 4) : '—'}</span>
          <span>L {crosshairData.low != null ? Number(crosshairData.low).toFixed(isGoldSymbol(displaySymbol) ? 2 : 4) : '—'}</span>
          <span>C {crosshairData.close != null ? Number(crosshairData.close).toFixed(isGoldSymbol(displaySymbol) ? 2 : 4) : '—'}</span>
        </div>
      )}
      {measureMode && measurePoints.length > 0 && (
        <div className="fx-chart-measure-panel">
          {measurePoints.length === 1 && <span>Point A: {Number(measurePoints[0].price).toFixed(isGoldSymbol(displaySymbol) ? 2 : 4)}</span>}
          {measurePoints.length === 2 && (
            <>
              <span>Δ {Math.abs(measurePoints[1].price - measurePoints[0].price).toFixed(isGoldSymbol(displaySymbol) ? 2 : 4)}</span>
              <span>Pips {Math.round(Math.abs(measurePoints[1].price - measurePoints[0].price) * (isGoldSymbol(displaySymbol) ? 100 : 10000))}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(FxChart);
