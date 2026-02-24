import React, { useEffect, useRef, useMemo } from 'react';
import { createChart } from 'lightweight-charts';

/** Throttle interval for tick updates (ms) - 0 = immediate realtime */
const TICK_THROTTLE_MS = 0;

/** Base price and scale for symbol (XAU ~2650, forex ~1.08) */
function getSamplePriceParams(symbol) {
  const s = String(symbol || '').toUpperCase();
  const isGold = s.includes('XAU') || s.includes('GOLD');
  return isGold
    ? { base: 2650, range: 50, moveScale: 5, round: 2 }
    : { base: 1.08, range: 0.02, moveScale: 0.002, round: 4 };
}

function isGoldSymbol(symbol) {
  const s = String(symbol || '').toUpperCase();
  return s.includes('XAU') || s.includes('GOLD');
}

/**
 * Generate sample OHLC data for demo (fallback when API unavailable).
 */
export function generateSampleOHLC(bars = 100, baseTime = '2024-01-01', seed = 0, symbol = '') {
  const params = getSamplePriceParams(symbol);
  const { base, range, moveScale, round } = params;
  const mult = Math.pow(10, round);
  const data = [];
  let time = Math.floor(new Date(baseTime).getTime() / 1000);
  const rng = (() => { let s = seed || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
  let open = base + rng() * range;
  const interval = 3600;

  for (let i = 0; i < bars; i++) {
    const move = (rng() - 0.48) * moveScale;
    const close = open + move;
    const high = Math.max(open, close) + rng() * moveScale * 0.5;
    const low = Math.min(open, close) - rng() * moveScale * 0.5;
    data.push({
      time: time + i * interval,
      open: Math.round(open * mult) / mult,
      high: Math.round(high * mult) / mult,
      low: Math.round(low * mult) / mult,
      close: Math.round(close * mult) / mult,
    });
    open = close;
  }
  return data;
}

/**
 * FX Trading Chart using TradingView Lightweight Charts.
 * Fetches live candles from API and displays real-time tick updates.
 */
function FxChart({
  symbol = 'EUR/USD',
  height = 400,
  showCandles = true,
  data: externalData,
  tick,
  timeframe = '1m',
  loading = false,
  error = null,
  wsConnected = false,
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const tickThrottleRef = useRef(null);
  const lastTickRef = useRef(null);

  const data = useMemo(() => {
    let     arr = externalData && externalData.length > 0
      ? [...externalData]
      : generateSampleOHLC(80, '2024-01-01', symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0), symbol);
    arr.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    const prec = isGoldSymbol(symbol) ? 2 : 4;
    const mult = Math.pow(10, prec);
    return arr.map((b) => ({
      ...b,
      open: Math.round((b.open ?? 0) * mult) / mult,
      high: Math.round((b.high ?? 0) * mult) / mult,
      low: Math.round((b.low ?? 0) * mult) / mult,
      close: Math.round((b.close ?? 0) * mult) / mult,
    }));
  }, [externalData, symbol]);

  // Create chart once on mount; do not recreate on data change
  useEffect(() => {
    if (!chartContainerRef.current) return;

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
        precision: isGoldSymbol(symbol) ? 2 : 4,
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
        vertLine: { labelBackgroundColor: '#de1414' },
        horzLine: { labelBackgroundColor: '#de1414' },
      },
      width: chartContainerRef.current.clientWidth,
      height,
    });

    if (showCandles) {
      seriesRef.current = chart.addCandlestickSeries({
        upColor: '#de1414',
        downColor: '#0a5f0a',
        borderDownColor: '#0a5f0a',
        borderUpColor: '#de1414',
        wickDownColor: '#0a5f0a',
        wickUpColor: '#de1414',
      });
    } else {
      seriesRef.current = chart.addLineSeries({
        color: '#de1414',
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: true,
      });
    }

    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, showCandles, symbol]);

  // Update series data when data changes (no chart recreation)
  useEffect(() => {
    if (!seriesRef.current || !data.length) return;
    if (showCandles) {
      seriesRef.current.setData(data);
    } else {
      seriesRef.current.setData(data.map(({ time, close }) => ({ time, value: close })));
    }
    const ts = chartRef.current?.timeScale();
    if (data.length > 70) {
      const visibleBars = 70;
      const from = data.length - visibleBars;
      ts?.setVisibleLogicalRange({ from, to: data.length - 1 });
    } else {
      ts?.fitContent();
    }
  }, [data, showCandles]);

  // Live tick update: throttled to avoid excessive redraws
  useEffect(() => {
    if (!tick || !seriesRef.current || !data.length) return;
    const price = tick.close ?? tick.price;
    if (typeof price !== 'number' || !Number.isFinite(price)) return;

    lastTickRef.current = { tick, price };

    const applyUpdate = () => {
      const { price: p } = lastTickRef.current || {};
      if (typeof p !== 'number' || !Number.isFinite(p)) return;
      const prec = isGoldSymbol(symbol) ? 2 : 4;
      const mult = Math.pow(10, prec);
      const round = (n) => Math.round(n * mult) / mult;
      const last = data[data.length - 1];
      const updated = {
        ...last,
        close: round(p),
        high: round(Math.max(last.high || last.close, p)),
        low: round(Math.min(last.low || last.close, p)),
      };
      if (showCandles) {
        seriesRef.current?.update(updated);
      } else {
        seriesRef.current?.update({ time: last.time, value: round(p) });
      }
    };

    if (TICK_THROTTLE_MS <= 0) {
      applyUpdate();
    } else if (!tickThrottleRef.current) {
      applyUpdate();
      tickThrottleRef.current = window.setTimeout(() => {
        tickThrottleRef.current = null;
        applyUpdate();
      }, TICK_THROTTLE_MS);
    }

    return () => {
      if (tickThrottleRef.current) {
        clearTimeout(tickThrottleRef.current);
        tickThrottleRef.current = null;
      }
    };
  }, [tick, showCandles, data]);

  const displayPrice = tick?.close ?? tick?.price ?? (data.length ? data[data.length - 1]?.close : null);
  const isDelayed = error != null;

  return (
    <div className="fx-chart-wrap" style={{ position: 'relative' }}>
      <div className="fx-chart-header" style={{ position: 'absolute', top: 8, left: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{symbol}</span>
        {displayPrice != null && (
          <span className="fx-chart-price" style={{ fontWeight: 600, color: '#de1414' }}>
            {Number(displayPrice).toFixed(isGoldSymbol(symbol) ? 2 : 4)}
          </span>
        )}
        {loading && <span className="fx-chart-status" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Loading…</span>}
        {wsConnected && !loading && <span className="fx-chart-live" style={{ fontSize: '0.7rem', color: '#22c55e', background: 'rgba(34,197,94,0.2)', padding: '0.15rem 0.4rem', borderRadius: 4 }}>Live</span>}
        {isDelayed && <span className="fx-chart-delayed" style={{ fontSize: '0.7rem', color: '#ffa500', background: 'rgba(255,165,0,0.2)', padding: '0.15rem 0.4rem', borderRadius: 4 }}>Data delayed</span>}
      </div>
      <div ref={chartContainerRef} style={{ width: '100%', height: `${height}px` }} />
    </div>
  );
}

export default React.memo(FxChart);
