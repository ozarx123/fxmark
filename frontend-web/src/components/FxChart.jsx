import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createChart } from 'lightweight-charts';
import { getCurrentBarStart } from '../lib/candleTime.js';
import { generateSampleOHLC } from '../lib/sampleOHLC.js';

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
}) {
  const displaySymbol = toDisplaySymbol(symbol);
  const chartSymbolKey = toInternalSymbol(symbol);

  // ── DOM / chart refs ────────────────────────────────────────────────────────
  const chartContainerRef = useRef(null);
  const chartRef          = useRef(null);
  const seriesRef         = useRef(null);

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
    if (!containerReady || !chartContainerRef.current) return;

    // Full session reset: new chart = fresh start, no live-mode state carried over
    hasActivatedLiveModeRef.current = false;
    isSampleDataRef.current         = false;

    dbg(`Creating chart for ${displaySymbol}`);

    const chart = createChart(chartContainerRef.current, {
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
      width: chartContainerRef.current.clientWidth,
      height,
    });

    const priceFormat = {
      type: 'price',
      precision: isGoldSymbol(displaySymbol) ? 2 : 4,
      minMove:   isGoldSymbol(displaySymbol) ? 0.01 : 0.0001,
    };

    seriesRef.current = showCandles
      ? chart.addCandlestickSeries({
          // Inverted & brighter: solid green up candles, solid red down candles
          upColor: '#16a34a',
          downColor: '#ff0000',
          borderUpColor: '#16a34a',
          borderDownColor: '#ff0000',
          wickUpColor: '#16a34a',
          wickDownColor: '#ff0000',
          priceFormat,
        })
      : chart.addLineSeries({
          color: '#f97373',
          lineWidth: 2,
          lastValueVisible: true,
          priceLineVisible: true,
          priceFormat,
        });

    chartRef.current        = chart;
    pendingTickRef.current  = null;
    rafScheduledRef.current = false;

    const handleResize = () => {
      if (!chartContainerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      pendingTickRef.current  = null;
      rafScheduledRef.current = false;
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, [containerReady, height, showCandles, displaySymbol]);

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
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

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
    const fmtPnl = (v) => (v != null ? `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}` : '');

    const posList = Array.isArray(positions) ? positions.filter((p) => toInternalSymbol(p.symbol) === chartSymbolKey) : [];
    posList.forEach((pos) => {
      const entry = pos.openPrice ?? pos.open_price;
      const sl = pos.sl ?? pos.sl_price ?? pos.stopLoss;
      const tp = pos.tp ?? pos.tp_price ?? pos.takeProfit;
      const vol = pos.volume ?? pos.lots ?? 0;
      const pnl = pos.floatingPnL ?? pos.floating_pnl ?? pos.pnl;

      if (entry != null && Number.isFinite(Number(entry))) {
        series.createPriceLine({
          price: Number(entry),
          color: '#f0b90b',
          lineWidth: 1,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `Entry ${fmt(entry)} · ${vol} lots · PnL ${fmtPnl(pnl)}`,
        });
      }
      if (sl != null && Number.isFinite(Number(sl))) {
        series.createPriceLine({
          price: Number(sl),
          color: '#ef5350',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `SL ${fmt(sl)}`,
        });
      }
      if (tp != null && Number.isFinite(Number(tp))) {
        series.createPriceLine({
          price: Number(tp),
          color: '#26a69a',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `TP ${fmt(tp)}`,
        });
      }
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
  }, [positions, pendingOrders, displaySymbol, chartSymbolKey, containerReady]);

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
  useEffect(() => {
    if (!tick) return;

    const rawPrice = tick.close ?? tick.price;
    if (!Number.isFinite(Number(rawPrice))) return;

    // Buffer the tick — applyPendingTick will consume it via RAF.
    // Even if seriesRef is not ready yet, the tick is stored so it is
    // applied as soon as the chart mounts and the next tick arrives.
    pendingTickRef.current = {
      close:    Number(rawPrice),
      price:    Number(rawPrice),
      open:     tick.open,
      high:     tick.high,
      low:      tick.low,
      datetime: tick.datetime,
    };

    if (!seriesRef.current) return; // chart not ready — tick is buffered above

    if (!rafScheduledRef.current) {
      rafScheduledRef.current = true;
      requestAnimationFrame(applyPendingTick);
    }
  }, [tick, applyPendingTick]);

  const displayPrice =
    tick?.close ?? tick?.price ?? marketPrice ??
    (data.length ? data[data.length - 1]?.close : null);

  const isDelayed = error != null;

  return (
    <div className="fx-chart-wrap" style={{ position: 'relative' }}>
      <div
        className="fx-chart-header"
        style={{
          position: 'absolute', top: 8, left: 12, right: 12, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '1rem', flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{displaySymbol}</span>

          {displayPrice != null && (
            <span className="fx-chart-price" style={{ fontWeight: 600, color: '#de1414' }}>
              {Number(displayPrice).toFixed(isGoldSymbol(displaySymbol) ? 2 : 4)}
            </span>
          )}

          {loading && (
            <span className="fx-chart-status" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="spinner spinner-inline" />
            </span>
          )}

          {wsConnected && !loading && (
            <span
              className="fx-chart-live"
              style={{
                fontSize: '0.7rem', color: '#22c55e',
                background: 'rgba(34,197,94,0.2)',
                padding: '0.15rem 0.4rem', borderRadius: 4,
              }}
            >
              Live
            </span>
          )}

          {isDelayed && (
            <span
              className="fx-chart-delayed"
              style={{
                fontSize: '0.7rem', color: '#ffa500',
                background: 'rgba(255,165,0,0.2)',
                padding: '0.15rem 0.4rem', borderRadius: 4,
              }}
            >
              Data delayed
            </span>
          )}
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', height: `${height}px` }}>
        <div
          ref={(el) => {
            chartContainerRef.current = el;
            if (el && !containerReady) setContainerReady(true);
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}

export default React.memo(FxChart);
