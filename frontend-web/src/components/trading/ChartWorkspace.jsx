import React, { useCallback, useState, useEffect, useRef } from 'react';
import FxChart from '../FxChart';
import { useMarketData } from '../../hooks/useMarketData';

function drawingId() {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const TIMEFRAMES = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1d' },
];

const defaultIndicators = () => ({
  ma: { enabled: false, period: 20 },
  bb: { enabled: false, period: 20, stdDev: 2 },
  rsi: { enabled: false, period: 14 },
});

export default function ChartWorkspace({
  symbol,
  onSymbolChange,
  symbols = [],
  timeframe: controlledTimeframe,
  onTimeframeChange,
  chartType = 'candles',
  onChartTypeChange,
  height = 400,
  positions = [],
  pendingOrders = [],
  onClosePosition,
  onModifySLTP,
  onBreakEven,
  indicators: controlledIndicators,
  onIndicatorsChange,
  drawings = [],
  onDrawingsChange,
  onAddPriceAlert,
  onBreakout,
  compactMobile = false,
  className = '',
}) {
  const timeframe = controlledTimeframe ?? '1m';
  const indicators = controlledIndicators ?? defaultIndicators();
  const { candles, tick, loading, error, wsConnected } = useMarketData(symbol, timeframe);
  const marketPrice = tick?.close ?? tick?.price ?? (candles?.length ? candles[candles.length - 1]?.close : null);
  const symbolKey = (symbol || '').replace(/\//g, '').toUpperCase();
  const symbolPositions = Array.isArray(positions)
    ? positions.filter((p) => (p.symbol || '').replace(/\//g, '').toUpperCase() === symbolKey)
    : [];

  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showBreakoutDetection, setShowBreakoutDetection] = useState(false);
  const [crosshairPanel, setCrosshairPanel] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [chartBarSpacing, setChartBarSpacing] = useState(null);
  const [chartResetTrigger, setChartResetTrigger] = useState(0);
  const [replayActive, setReplayActive] = useState(false);
  const [replayCandles, setReplayCandles] = useState([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(500);
  const replayTimerRef = useRef(null);

  const chartData = replayActive && replayCandles.length ? replayCandles.slice(0, replayIndex + 1) : candles;
  const chartTick = replayActive ? null : tick;

  useEffect(() => {
    if (!replayActive || !replayPlaying || replayCandles.length === 0) return;
    if (replayIndex >= replayCandles.length - 1) {
      setReplayPlaying(false);
      return;
    }
    replayTimerRef.current = setInterval(() => {
      setReplayIndex((i) => {
        if (i >= replayCandles.length - 1) {
          setReplayPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, replaySpeed);
    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    };
  }, [replayActive, replayPlaying, replayIndex, replayCandles.length, replaySpeed]);

  const startReplay = useCallback(() => {
    if (!candles?.length) return;
    setReplayCandles([...candles]);
    setReplayIndex(0);
    setReplayActive(true);
    setReplayPlaying(true);
  }, [candles]);
  const stopReplay = useCallback(() => {
    setReplayPlaying(false);
    setReplayActive(false);
    setReplayCandles([]);
    setReplayIndex(0);
  }, []);
  const zoomIn = useCallback(() => setChartBarSpacing((v) => Math.max(2, (v ?? 10) - 2)), []);
  const zoomOut = useCallback(() => setChartBarSpacing((v) => Math.min(100, (v ?? 10) + 2)), []);
  const resetChart = useCallback(() => {
    setChartBarSpacing(null);
    setChartResetTrigger((t) => t + 1);
  }, []);

  const addDrawing = useCallback((type, overrides = {}) => {
    if (!onDrawingsChange || marketPrice == null) return;
    const id = drawingId();
    const firstTime = candles?.length ? candles[0]?.time : null;
    const lastTime = candles?.length ? candles[candles.length - 1]?.time : null;
    const base = { id, type, price: Number(marketPrice), ...overrides };
    if (type === 'trend') {
      base.time = overrides.time ?? firstTime;
      base.time2 = overrides.time2 ?? lastTime;
      base.price2 = overrides.price2 ?? base.price;
    }
    if (type === 'rectangle') base.price2 = overrides.price2 ?? base.price;
    if (type === 'sr') base.title = overrides.title ?? 'S/R';
    onDrawingsChange([...(drawings || []), base]);
  }, [onDrawingsChange, marketPrice, candles, drawings]);

  const removeDrawing = useCallback((id) => {
    if (!onDrawingsChange) return;
    onDrawingsChange((drawings || []).filter((d) => d.id !== id));
  }, [onDrawingsChange, drawings]);

  const setIndicator = (key, patch) => {
    if (!onIndicatorsChange) return;
    onIndicatorsChange({ ...indicators, [key]: { ...(indicators[key] || {}), ...patch } });
  };

  return (
    <div className={`terminal-chart-workspace ${className}`}>
      <div className="terminal-chart-workspace__toolbar">
        <div className="terminal-chart-workspace__symbol-info">
          <span className="terminal-chart-workspace__symbol">{symbol}</span>
          {wsConnected && <span className="terminal-chart-workspace__live">Live</span>}
        </div>
        <div className="terminal-chart-workspace__controls">
          {symbols.length > 0 && onSymbolChange && (
            <select
              value={symbol}
              onChange={(e) => onSymbolChange(e.target.value)}
              className="terminal-chart-workspace__select"
            >
              {symbols.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )}
          {onTimeframeChange && (
            <select
              value={timeframe}
              onChange={(e) => onTimeframeChange(e.target.value)}
              className="terminal-chart-workspace__select"
            >
              {TIMEFRAMES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          )}
          {onChartTypeChange && (
            <select
              value={chartType}
              onChange={(e) => onChartTypeChange(e.target.value)}
              className="terminal-chart-workspace__select"
            >
              <option value="candles">Candles</option>
              <option value="line">Line</option>
            </select>
          )}
        </div>
      </div>
      {!compactMobile && onIndicatorsChange && (
        <div className="terminal-chart-workspace__indicators">
          <label className="terminal-chart-workspace__indicator">
            <input
              type="checkbox"
              checked={!!indicators.ma?.enabled}
              onChange={(e) => setIndicator('ma', { enabled: e.target.checked, period: indicators.ma?.period ?? 20 })}
            />
            <span>MA</span>
            {indicators.ma?.enabled && (
              <input
                type="number"
                min={2}
                max={200}
                value={indicators.ma.period ?? 20}
                onChange={(e) => setIndicator('ma', { period: Math.max(2, parseInt(e.target.value, 10) || 20) })}
                className="terminal-chart-workspace__indicator-period"
              />
            )}
          </label>
          <label className="terminal-chart-workspace__indicator">
            <input
              type="checkbox"
              checked={!!indicators.bb?.enabled}
              onChange={(e) => setIndicator('bb', { enabled: e.target.checked, period: indicators.bb?.period ?? 20, stdDev: indicators.bb?.stdDev ?? 2 })}
            />
            <span>BB</span>
            {indicators.bb?.enabled && (
              <>
                <input
                  type="number"
                  min={2}
                  max={200}
                  value={indicators.bb.period ?? 20}
                  onChange={(e) => setIndicator('bb', { ...indicators.bb, period: Math.max(2, parseInt(e.target.value, 10) || 20) })}
                  className="terminal-chart-workspace__indicator-period"
                />
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={0.5}
                  value={indicators.bb.stdDev ?? 2}
                  onChange={(e) => setIndicator('bb', { ...indicators.bb, stdDev: Math.max(1, parseFloat(e.target.value) || 2) })}
                  className="terminal-chart-workspace__indicator-period"
                />
              </>
            )}
          </label>
          <label className="terminal-chart-workspace__indicator">
            <input
              type="checkbox"
              checked={!!indicators.rsi?.enabled}
              onChange={(e) => setIndicator('rsi', { enabled: e.target.checked, period: indicators.rsi?.period ?? 14 })}
            />
            <span>RSI</span>
            {indicators.rsi?.enabled && (
              <input
                type="number"
                min={2}
                max={50}
                value={indicators.rsi.period ?? 14}
                onChange={(e) => setIndicator('rsi', { period: Math.max(2, parseInt(e.target.value, 10) || 14) })}
                className="terminal-chart-workspace__indicator-period"
              />
            )}
          </label>
        </div>
      )}
      {!compactMobile && onDrawingsChange && (
        <div className="terminal-chart-workspace__drawings">
          <span className="terminal-chart-workspace__drawings-label">Draw:</span>
          <button type="button" className="terminal-chart-workspace__draw-btn" title="Horizontal line at current price" onClick={() => addDrawing('horizontal')}>
            H-line
          </button>
          <button type="button" className="terminal-chart-workspace__draw-btn" title="Trend line" onClick={() => addDrawing('trend')}>
            Trend
          </button>
          <button type="button" className="terminal-chart-workspace__draw-btn" title="Rectangle (price range)" onClick={() => addDrawing('rectangle')}>
            Rect
          </button>
          <button type="button" className="terminal-chart-workspace__draw-btn" title="Support / Resistance" onClick={() => addDrawing('sr')}>
            S/R
          </button>
          {onAddPriceAlert && marketPrice != null && (
            <button type="button" className="terminal-chart-workspace__draw-btn terminal-chart-workspace__draw-btn--alert" title="Add price alert at current price" onClick={() => onAddPriceAlert(symbol, marketPrice)}>
              Alert
            </button>
          )}
          {(drawings || []).length > 0 && (
            <div className="terminal-chart-workspace__drawings-list">
              {(drawings || []).slice(-8).reverse().map((d) => (
                <span key={d.id} className="terminal-chart-workspace__drawing-item">
                  {d.type} @ {(d.price ?? '').toString().slice(0, 8)}
                  <button type="button" className="terminal-chart-workspace__drawing-remove" onClick={() => removeDrawing(d.id)} aria-label="Remove">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="terminal-chart-workspace__utils">
        <button type="button" className="terminal-chart-workspace__util-btn" title="Liquidity heatmap" onClick={() => setShowHeatmap((v) => !v)} aria-pressed={showHeatmap}>
          Heatmap
        </button>
        <button type="button" className="terminal-chart-workspace__util-btn" title="Breakout detection" onClick={() => setShowBreakoutDetection((v) => !v)} aria-pressed={showBreakoutDetection}>
          Breakout
        </button>
        {!replayActive ? (
          <button type="button" className="terminal-chart-workspace__util-btn" title="Replay historical candles" onClick={startReplay} disabled={!candles?.length}>
            Replay
          </button>
        ) : (
          <>
            <button type="button" className="terminal-chart-workspace__util-btn" onClick={() => setReplayPlaying((v) => !v)}>{replayPlaying ? 'Pause' : 'Play'}</button>
            <select value={replaySpeed} onChange={(e) => setReplaySpeed(Number(e.target.value))} className="terminal-chart-workspace__select terminal-chart-workspace__speed">
              <option value={200}>0.2s</option>
              <option value={500}>0.5s</option>
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
            </select>
            <button type="button" className="terminal-chart-workspace__util-btn" onClick={stopReplay}>Stop</button>
          </>
        )}
        <button type="button" className="terminal-chart-workspace__util-btn" title="Crosshair OHLC panel" onClick={() => setCrosshairPanel((v) => !v)} aria-pressed={crosshairPanel}>
          OHLC
        </button>
        <button type="button" className="terminal-chart-workspace__util-btn" title="Measure price / pips" onClick={() => setMeasureMode((v) => !v)} aria-pressed={measureMode}>
          Measure
        </button>
        <button type="button" className="terminal-chart-workspace__util-btn" title="Zoom in" onClick={zoomIn}>+</button>
        <button type="button" className="terminal-chart-workspace__util-btn" title="Zoom out" onClick={zoomOut}>−</button>
        <button type="button" className="terminal-chart-workspace__util-btn" title="Reset chart" onClick={resetChart}>Reset</button>
      </div>
      {!compactMobile && symbolPositions.length > 0 && (
        <div className="chart-position-chips">
          {symbolPositions.map((p) => {
            const side = (p.side || p.type || 'BUY').toUpperCase();
            const vol = p.volume ?? p.lots ?? 0;
            const pnl = p.floatingPnL ?? p.floating_pnl ?? p.pnl ?? 0;
            const profit = pnl >= 0;
            const entry = p.openPrice ?? p.open_price;
            const hasEntry = entry != null && Number.isFinite(Number(entry));
            const sl = p.sl ?? p.sl_price ?? p.stopLoss;
            const alreadyBE = hasEntry && sl != null && Number.isFinite(Number(sl)) && Math.abs(Number(sl) - Number(entry)) < 1e-8;
            const canBreakEven = onBreakEven && hasEntry && !alreadyBE;
            return (
              <div
                key={p.id}
                className={`chart-position-chip chart-position-chip--${side === 'BUY' ? 'buy' : 'sell'}`}
              >
                <span className="chart-position-chip__side">{side}</span>
                <span className="chart-position-chip__vol">{Number(vol).toFixed(2)}</span>
                <span
                  className={`chart-position-chip__pnl chart-position-chip__pnl--${
                    profit ? 'profit' : 'loss'
                  }`}
                >
                  {profit ? '+' : ''}
                  {Number(pnl).toFixed(2)}
                </span>
                {canBreakEven && (
                  <button
                    type="button"
                    className="chart-position-chip__be"
                    title="Move stop loss to entry (break-even)"
                    onClick={() => onBreakEven(p.id)}
                  >
                    BE
                  </button>
                )}
                <button
                  type="button"
                  className="chart-position-chip__close"
                  onClick={() => onClosePosition?.(p.id, p.currentPrice ?? marketPrice)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
      <FxChart
        symbol={symbol}
        height={height}
        showCandles={chartType === 'candles'}
        data={chartData}
        tick={chartTick}
        timeframe={timeframe}
        loading={loading}
        error={error}
        wsConnected={wsConnected}
        marketPrice={marketPrice}
        positions={positions}
        pendingOrders={pendingOrders}
        onModifySLTP={onModifySLTP}
        indicators={indicators}
        drawings={drawings}
        showHeatmap={showHeatmap}
        showBreakoutDetection={showBreakoutDetection}
        onBreakout={onBreakout}
        isReplayMode={replayActive}
        crosshairPanel={crosshairPanel}
        measureMode={measureMode}
        chartResetTrigger={chartResetTrigger}
        chartBarSpacing={chartBarSpacing}
      />
    </div>
  );
}
