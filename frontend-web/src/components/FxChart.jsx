import React, { useEffect, useRef, useMemo } from 'react';
import { createChart } from 'lightweight-charts';

/**
 * Generate sample OHLC data for demo (fallback when API unavailable).
 */
export function generateSampleOHLC(bars = 100, baseTime = '2024-01-01', seed = 0) {
  const data = [];
  let time = Math.floor(new Date(baseTime).getTime() / 1000);
  const rng = (() => { let s = seed || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
  let open = 1.08 + rng() * 0.02;
  const interval = 3600;

  for (let i = 0; i < bars; i++) {
    const move = (rng() - 0.48) * 0.002;
    const close = open + move;
    const high = Math.max(open, close) + rng() * 0.0005;
    const low = Math.min(open, close) - rng() * 0.0005;
    data.push({
      time: time + i * interval,
      open: Math.round(open * 10000) / 10000,
      high: Math.round(high * 10000) / 10000,
      low: Math.round(low * 10000) / 10000,
      close: Math.round(close * 10000) / 10000,
    });
    open = close;
  }
  return data;
}

/**
 * FX Trading Chart using TradingView Lightweight Charts.
 * Fetches live candles from API and displays real-time tick updates.
 */
export default function FxChart({
  symbol = 'EUR/USD',
  height = 400,
  showCandles = true,
  data: externalData,
  tick,
  timeframe = '1m',
  loading = false,
  error = null,
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  const data = useMemo(() => {
    let arr = externalData && externalData.length > 0
      ? [...externalData]
      : generateSampleOHLC(80, '2024-01-01', symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
    // Lightweight Charts requires ascending order by time
    arr.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    return arr;
  }, [externalData, symbol]);

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
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.2)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { labelBackgroundColor: '#de1414' },
        horzLine: { labelBackgroundColor: '#de1414' },
      },
      width: chartContainerRef.current.clientWidth,
      height,
    });

    if (showCandles) {
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#de1414',
        downColor: '#0a5f0a',
        borderDownColor: '#0a5f0a',
        borderUpColor: '#de1414',
        wickDownColor: '#0a5f0a',
        wickUpColor: '#de1414',
      });
      candlestickSeries.setData(data);
      seriesRef.current = candlestickSeries;
    } else {
      const lineSeries = chart.addLineSeries({
        color: '#de1414',
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: true,
      });
      const lineData = data.map(({ time, close }) => ({ time, value: close }));
      lineSeries.setData(lineData);
      seriesRef.current = lineSeries;
    }

    chart.timeScale().fitContent();

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
  }, [data, height, showCandles]);

  // Live tick update: update last candle
  useEffect(() => {
    if (!tick || !seriesRef.current || !data.length) return;
    const price = tick.close ?? tick.price;
    if (typeof price !== 'number' || !Number.isFinite(price)) return;

    const last = data[data.length - 1];
    const updated = {
      ...last,
      close: price,
      high: Math.max(last.high || last.close, price),
      low: Math.min(last.low || last.close, price),
    };
    if (showCandles) {
      seriesRef.current.update(updated);
    } else {
      seriesRef.current.update({ time: last.time, value: price });
    }
  }, [tick, showCandles, data]);

  const displayPrice = tick?.close ?? tick?.price ?? (data.length ? data[data.length - 1]?.close : null);
  const isDelayed = error != null;

  return (
    <div className="fx-chart-wrap" style={{ position: 'relative' }}>
      <div className="fx-chart-header" style={{ position: 'absolute', top: 8, left: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{symbol}</span>
        {displayPrice != null && (
          <span className="fx-chart-price" style={{ fontWeight: 600, color: '#de1414' }}>
            {Number(displayPrice).toFixed(symbol.includes('XAU') ? 2 : 4)}
          </span>
        )}
        {loading && <span className="fx-chart-status" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Loading…</span>}
        {isDelayed && <span className="fx-chart-delayed" style={{ fontSize: '0.7rem', color: '#ffa500', background: 'rgba(255,165,0,0.2)', padding: '0.15rem 0.4rem', borderRadius: 4 }}>Data delayed</span>}
      </div>
      <div ref={chartContainerRef} style={{ width: '100%', height: `${height}px` }} />
    </div>
  );
}
