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
  if (typeof t === 'number' && Number.isFinite(t)) return t;
  if (typeof t === 'string') {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  }
  if (t instanceof Date) return Math.floor(t.getTime() / 1000);
  if (typeof t === 'object' && typeof t.getTime === 'function')
    return Math.floor(t.getTime() / 1000);
  return 0;
}

/**
 * FX Trading Chart — TradingView Lightweight Charts.
 *
 * Strict data-flow contract:
 *   REST candles → series.setData()  — only on initial load / symbol / TF switch
 *   Live tick    → series.update()   — every tick, RAF-coalesced, never setData
 *
 * Once live mode is activated (first real candle OR first valid tick), sample
 * data and setData() are permanently disabled for that chart session.
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

  const pendingTickRef   = useRef(null);
  const rafScheduledRef  = useRef(false);

  // isSampleDataRef: true while dataRef holds generated sample bars.
  // Written only in the ref-sync useEffect, NEVER in useMemo.
  const isSampleDataRef  = useRef(false);

  // hasActivatedLiveModeRef: once true, sample reseeding and sample setData
  // are permanently blocked for this chart session.
  // Activated by: real REST candles arriving OR first valid live tick.
  // Reset to false: on symbol change, timeframe change, or chart recreation.
  const hasActivatedLiveModeRef = useRef(false);

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
  }

  const [containerReady, setContainerReady] = useState(false);

  // ── Processed data (real REST candles or synthetic sample) ──────────────────
  const hasRealData = Array.isArray(externalData) && externalData.length > 0;

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
  // (except the render-phase reset above and applyPendingTick for activation).
  useEffect(() => {
    dataRef.current        = data;
    symbolRef.current      = displaySymbol;
    timeframeRef.current   = timeframe;
    showCandlesRef.current = showCandles;

    // Mirror whether current data is sample or real
    isSampleDataRef.current = !hasRealData;

    // Activate live mode as soon as real REST candles arrive
    if (hasRealData) {
      hasActivatedLiveModeRef.current = true;
      dbg(`live mode activated by REST candles (${data.length} bars)`);
    }
  }, [data, displaySymbol, timeframe, showCandles, hasRealData]);

  // ── Chart instance — recreated on symbol, height, or series-type change ──────
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!containerReady || !container) return;

    // Full session reset: new chart = fresh start, no live-mode state carried over
    hasActivatedLiveModeRef.current = false;
    isSampleDataRef.current         = false;

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
      handleScroll: {
        mouseWheel: true, pressedMouseMove: true,
        horzTouchDrag: true, vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true, pinch: true,
        axisPressedMouseMove: true, axisDoubleClickReset: true,
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
    pendingTickRef.current  = null;
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

    return () => {
      window.removeEventListener('resize', applySize);
      ro.disconnect();
      pendingTickRef.current  = null;
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

    // Build unique entry map first — one key per (side, normalized price). Entry lines created ONLY from this map.
    const uniqueEntries = new Map();
    posList.forEach((pos) => {
      const entry = pos.openPrice ?? pos.open_price ?? pos.entry;
      if (entry == null || !Number.isFinite(Number(entry))) return;
      const price = Number(entry).toFixed(2);
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
      const price = Number(sl).toFixed(2);
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
      const price = Number(tp).toFixed(2);
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
    if (!seriesRef.current) return;

    // Guard 1 & 2: once live, never revert to sample or empty
    if (hasActivatedLiveModeRef.current && !hasRealData) {
      dbg(`setData: SKIPPED — live mode active, data is ${data.length ? 'sample' : 'empty'}`);
      return;
    }

    if (!data.length) {
      dbg('setData: clearing chart (symbol switch or initial empty)');
      dataRef.current = [];
      seriesRef.current.setData([]);
      chartRef.current?.timeScale()?.fitContent();
      return;
    }

    dbg(`setData: loading ${data.length} bars (real=${hasRealData}), last time=${data[data.length - 1]?.time}`);

    try {
      if (showCandles) {
        seriesRef.current.setData(data);
      } else {
        seriesRef.current.setData(data.map(({ time, close }) => ({ time, value: close })));
      }
    } catch (e) {
      dbgWarn('setData threw:', e.message);
      return;
    }

    const ts  = chartRef.current?.timeScale();
    const len = data.length;
    if (len > 70) ts?.setVisibleLogicalRange({ from: len - 70, to: len - 1 });
    else ts?.fitContent();
    ts?.scrollToRealTime();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showCandles]);

  // ── Chart updater — stable function, all deps via refs ──────────────────────
  //
  // Defined as useCallback([]) so the same function reference is reused across
  // renders. requestAnimationFrame always captures the same identity, and all
  // internal state is read through refs — no stale closures possible.
  //
  const applyPendingTick = useCallback(function applyPendingTick() {
    rafScheduledRef.current = false;

    const tickData = pendingTickRef.current;
    if (!tickData) return;
    pendingTickRef.current = null; // clear immediately to prevent re-apply

    const rawPrice = tickData.close ?? tickData.price;
    if (!Number.isFinite(Number(rawPrice))) {
      dbgWarn('invalid price', rawPrice);
      return;
    }

    const series = seriesRef.current;
    if (!series) {
      dbgWarn('seriesRef null — chart not ready');
      return;
    }

    const arr  = dataRef.current || [];
    const prec = isGoldSymbol(symbolRef.current) ? 2 : 4;
    const mult = Math.pow(10, prec);
    const round = (n) => Math.round(Number(n) * mult) / mult;
    const p    = round(rawPrice);

    // Use the TICK TIMESTAMP to choose the candle bucket, not the local
    // wall-clock. This keeps candle boundaries aligned with the provider and
    // prevents \"slanted\" bodies or huge vertical bars when the client clock
    // drifts.
    //
    // For 1m this becomes:
    //   bucketTime = Math.floor(tickTimeSec / 60) * 60
    //
    // getCurrentBarStart already does the correct bucketing given a Date.
    const tf = timeframeRef.current || '1m';
    const tickMs =
      typeof tickData.timestamp === 'number'
        ? tickData.timestamp
        : (tickData.datetime ? Date.parse(tickData.datetime) : Date.now());
    const currentBarTime = getCurrentBarStart(tf, new Date(Number.isFinite(tickMs) ? tickMs : Date.now()));

    // ── Case 1: no bars at all — seed from this tick ─────────────────────────
    if (!arr.length) {
      const bar = { time: currentBarTime, open: p, high: p, low: p, close: p };
      dbg(`Case 1 seed: time=${currentBarTime} price=${p}`);
      dataRef.current = [bar];
      hasActivatedLiveModeRef.current = true;
      isSampleDataRef.current         = false;
      try {
        if (showCandlesRef.current) series.setData([bar]);
        else series.setData([{ time: currentBarTime, value: p }]);
      } catch (e) { dbgWarn('Case 1 setData:', e.message); }
      chartRef.current?.timeScale()?.scrollToRealTime();
      return;
    }

    // ── Case 2: sample data visible and live mode NOT yet active ─────────────
    // Only allowed before activation. Once real data (REST or tick) has been
    // seen, this block is permanently skipped.
    if (isSampleDataRef.current && !hasActivatedLiveModeRef.current) {
      const lastSampleClose = arr[arr.length - 1]?.close;
      const priceDiff = lastSampleClose > 0
        ? Math.abs(p - lastSampleClose) / lastSampleClose
        : 1;

      dbg(`Case 2 sample check: diff=${(priceDiff * 100).toFixed(3)}%`);

      if (priceDiff > 0.003) {
        const sym      = symbolRef.current;
        const seed     = sym.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const freshData = generateSampleOHLC(80, tf, seed, sym, p);

        dbg(`Case 2 reseed: price=${p}`);
        dataRef.current         = freshData;
        isSampleDataRef.current = false;
        try {
          if (showCandlesRef.current) series.setData(freshData);
          else series.setData(freshData.map(({ time, close }) => ({ time, value: close })));
        } catch (e) { dbgWarn('Case 2 setData:', e.message); }
        chartRef.current?.timeScale()?.scrollToRealTime();
        return;
      }
    }

    // From here on: real data path — activate live mode
    hasActivatedLiveModeRef.current = true;
    isSampleDataRef.current         = false;

    const last = arr[arr.length - 1];

    // ── Case 3: new bar boundary crossed ─────────────────────────────────────
    if (currentBarTime > last.time) {
      const newBar = { time: currentBarTime, open: p, high: p, low: p, close: p };
      dbg(`Case 3 NEW BAR: time=${currentBarTime} (prev=${last.time})`);
      arr.push(newBar);
      dataRef.current = arr;
      try {
        if (showCandlesRef.current) series.update(newBar);
        else series.update({ time: currentBarTime, value: p });
      } catch (e) {
        dbgWarn('Case 3 update failed:', e.message, '— setData fallback');
        try {
          if (showCandlesRef.current) series.setData(arr);
          else series.setData(arr.map(({ time, close }) => ({ time, value: close })));
        } catch (e2) { dbgWarn('Case 3 fallback failed:', e2.message); }
      }
      chartRef.current?.timeScale()?.scrollToRealTime();
      return;
    }

    // ── Case 4: update current bar ───────────────────────────────────────────
    const updated = {
      ...last,
      close: p,
      high: round(Math.max(last.high  ?? last.close, p)),
      low:  round(Math.min(last.low   ?? last.close, p)),
    };
    dbg(`Case 4 UPDATE: t=${last.time} o=${updated.open} h=${updated.high} l=${updated.low} c=${updated.close}`);
    arr[arr.length - 1] = updated;
    dataRef.current = arr;
    try {
      if (showCandlesRef.current) series.update(updated);
      else series.update({ time: last.time, value: p });
    } catch (e) {
      dbgWarn('Case 4 update failed:', e.message, 'lastT=', last.time, 'curT=', currentBarTime);
      try {
        if (showCandlesRef.current) series.setData(arr);
        else series.setData(arr.map(({ time, close }) => ({ time, value: close })));
      } catch (e2) { dbgWarn('Case 4 fallback failed:', e2.message); }
    }
  // Empty deps — every internal value is read through a ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const tickMs =
      (tick.timestamp != null && Number.isFinite(tick.timestamp))
        ? (tick.timestamp < 1e13 ? tick.timestamp * 1000 : tick.timestamp)
        : (tick.providerTs != null && Number.isFinite(tick.providerTs))
          ? (tick.providerTs < 1e13 ? tick.providerTs * 1000 : tick.providerTs)
          : (tick.datetime ? Date.parse(tick.datetime) : Date.now());
    pendingTickRef.current = {
      close:    Number(rawPrice),
      price:    Number(rawPrice),
      open:     tick.open,
      high:     tick.high,
      low:      tick.low,
      datetime: tick.datetime,
      timestamp: Number.isFinite(tickMs) ? tickMs : Date.now(),
    };

    if (!seriesRef.current) return; // chart not ready — tick is buffered above

    if (!rafScheduledRef.current) {
      rafScheduledRef.current = true;
      requestAnimationFrame(applyPendingTick);
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
