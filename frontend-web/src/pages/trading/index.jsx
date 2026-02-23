import React, { useState } from 'react';
import FxChart from '../../components/FxChart';
import OrderConfirmModal from '../../components/OrderConfirmModal';
import OrderConfirmModalAdvanced from '../../components/OrderConfirmModalAdvanced';
import ActiveTradesModal from '../../components/ActiveTradesModal';
import HistoryModal from '../../components/HistoryModal';
import { useMarketData } from '../../hooks/useMarketData';
import { useAccount } from '../../context/AccountContext';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const SYMBOLS = [
  { value: 'XAU/USD', label: 'XAU/USD (Gold)' },
  { value: 'EUR/USD', label: 'EUR/USD' },
  { value: 'GBP/USD', label: 'GBP/USD' },
  { value: 'USD/JPY', label: 'USD/JPY' },
  { value: 'USD/CHF', label: 'USD/CHF' },
  { value: 'USD/CAD', label: 'USD/CAD' },
  { value: 'AUD/USD', label: 'AUD/USD' },
  { value: 'NZD/USD', label: 'NZD/USD' },
];

const TIMEFRAMES = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1d' },
];

/** Fallback prices when API/WS provide no data (market order still shows a price) */
const FALLBACK_MARKET_PRICES = {
  'XAU/USD': 2625.5,
  'EUR/USD': 1.0852,
  'GBP/USD': 1.2655,
  'USD/JPY': 150.12,
  'USD/CHF': 0.8845,
  'USD/CAD': 1.3582,
  'AUD/USD': 0.6522,
  'NZD/USD': 0.6125,
};

/** Mock analysis for current symbol (replace with API or real indicators) */
function getAnalysisForSymbol(symbol, price) {
  const p = price ?? 0;
  const base = {
    trend: 'Neutral',
    trendClass: 'neutral',
    summary: 'Price consolidating within range. Wait for breakout or use limit orders at key levels.',
    support: [p * 0.998, p * 0.995],
    resistance: [p * 1.002, p * 1.005],
    rsi: 52,
    rsiSignal: 'Neutral',
    momentum: 'Sideways',
  };
  if (symbol.includes('XAU')) {
    return {
      ...base,
      trend: 'Bullish',
      trendClass: 'bullish',
      summary: 'Gold holds above key support. DXY weakness supports upside; watch US real yields and risk sentiment.',
      support: [2615, 2600],
      resistance: [2640, 2655],
      rsi: 58,
      rsiSignal: 'Bullish',
      momentum: 'Up',
    };
  }
  if (symbol === 'EUR/USD') {
    return {
      ...base,
      trend: 'Bearish',
      trendClass: 'bearish',
      summary: 'EUR/USD under pressure from ECB-Fed divergence. Key support at 1.0820; resistance 1.0920.',
      support: [1.082, 1.078],
      resistance: [1.092, 1.096],
      rsi: 44,
      rsiSignal: 'Bearish',
      momentum: 'Down',
    };
  }
  if (symbol === 'GBP/USD') {
    return {
      ...base,
      trend: 'Bullish',
      trendClass: 'bullish',
      summary: 'Sterling supported by hawkish BoE pricing. 1.2700 resistance; support at 1.2620.',
      support: [1.262, 1.258],
      resistance: [1.27, 1.275],
      rsi: 61,
      rsiSignal: 'Bullish',
      momentum: 'Up',
    };
  }
  return base;
}

export default function Trading() {
  const { balance } = useAccount();
  const [symbol, setSymbol] = useState('EUR/USD');
  const [timeframe, setTimeframe] = useState('1m');
  const [chartType, setChartType] = useState('candles'); // 'candles' | 'line'
  const { candles, tick, loading, error } = useMarketData(symbol, timeframe);
  const lastCandleClose = candles?.length ? candles[candles.length - 1]?.close : null;
  const marketPrice = tick?.close ?? tick?.price ?? lastCandleClose ?? FALLBACK_MARKET_PRICES[symbol] ?? null;
  const [modal, setModal] = useState(null); // null | 'buy' | 'sell'
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [tradesModalOpen, setTradesModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const equity = balance;
  const margin = 0;
  const profit = 0;
  const analysis = getAnalysisForSymbol(symbol, marketPrice);

  const handleOrderConfirm = (order) => {
    console.log('Order confirmed:', order);
    setModal(null);
  };

  const handleAdvancedOrderConfirm = (order) => {
    console.log('Advanced order confirmed:', order);
    setAdvancedModalOpen(false);
  };

  return (
    <div className="page trading-page">
      <header className="page-header">
        <h1>Trading</h1>
        <p className="page-subtitle">Orders and positions</p>
      </header>
      <div className="trading-stats-bar">
        <div className="trading-stat">
          <span className="trading-stat-label">Equity</span>
          <span className="trading-stat-value">{formatCurrency(equity)}</span>
        </div>
        <div className="trading-stat">
          <span className="trading-stat-label">Margin</span>
          <span className="trading-stat-value">{formatCurrency(margin)}</span>
        </div>
        <div className="trading-stat">
          <span className="trading-stat-label">Profit</span>
          <span className={`trading-stat-value ${profit >= 0 ? 'positive' : 'negative'}`}>
            {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
          </span>
        </div>
      </div>
      <section className="page-content">
        <div className="section-block chart-section">
          <div className="chart-controls">
            <label>
              <span className="chart-control-label">Symbol</span>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="chart-select"
              >
                {SYMBOLS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="chart-control-label">Timeframe</span>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="chart-select"
              >
                {TIMEFRAMES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="chart-control-label">Chart</span>
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value)}
                className="chart-select"
              >
                <option value="candles">Candlesticks</option>
                <option value="line">Line</option>
              </select>
            </label>
          </div>
          <FxChart
            symbol={symbol}
            height={380}
            showCandles={chartType === 'candles'}
            data={candles}
            tick={tick}
            timeframe={timeframe}
            loading={loading}
            error={error}
          />
        </div>
        <div className="section-block trading-analysis-section">
          <h2>Analysis — {symbol}</h2>
          <div className="trading-analysis-grid">
            <div className="trading-analysis-card">
              <h3 className="trading-analysis-card-title">Trend & outlook</h3>
              <p className={`trading-analysis-trend trading-analysis-trend--${analysis.trendClass}`}>
                {analysis.trend}
              </p>
              <p className="trading-analysis-summary">{analysis.summary}</p>
            </div>
            <div className="trading-analysis-card">
              <h3 className="trading-analysis-card-title">Key levels</h3>
              <div className="trading-analysis-levels">
                <div className="trading-analysis-level-row">
                  <span className="trading-analysis-level-label">Resistance</span>
                  <span className="trading-analysis-level-value">
                    {analysis.resistance.map((r) => (r < 100 ? r.toFixed(4) : r.toFixed(2))).join(', ')}
                  </span>
                </div>
                <div className="trading-analysis-level-row">
                  <span className="trading-analysis-level-label">Support</span>
                  <span className="trading-analysis-level-value">
                    {analysis.support.map((s) => (s < 100 ? s.toFixed(4) : s.toFixed(2))).join(', ')}
                  </span>
                </div>
              </div>
            </div>
            <div className="trading-analysis-card">
              <h3 className="trading-analysis-card-title">Indicators</h3>
              <div className="trading-analysis-indicators">
                <div className="trading-analysis-indicator">
                  <span className="trading-analysis-indicator-label">RSI (14)</span>
                  <span className="trading-analysis-indicator-value">{analysis.rsi}</span>
                  <span className={`trading-analysis-indicator-signal trading-analysis-indicator-signal--${analysis.rsiSignal.toLowerCase()}`}>
                    {analysis.rsiSignal}
                  </span>
                </div>
                <div className="trading-analysis-indicator">
                  <span className="trading-analysis-indicator-label">Momentum</span>
                  <span className="trading-analysis-indicator-value">{analysis.momentum}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="page-content two-col">
          <div className="section-block">
            <h2>Open positions</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Volume</th>
                    <th>Open price</th>
                    <th>P&L</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5} className="empty-cell">No open positions</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="section-block">
            <h2>New order</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => setModal('buy')}>Buy</button>
              <button type="button" className="btn btn-sell" onClick={() => setModal('sell')}>Sell</button>
              <button type="button" className="btn btn-secondary" onClick={() => setAdvancedModalOpen(true)}>Advanced</button>
              <button type="button" className="btn btn-secondary" onClick={() => setTradesModalOpen(true)}>Active trades</button>
              <button type="button" className="btn btn-secondary" onClick={() => setHistoryModalOpen(true)}>History</button>
            </div>
            <div className="form-placeholder">
              <p className="muted">Symbol, volume, order type, and execution will appear here when connected.</p>
            </div>
          </div>
        </div>
        <div className="section-block news-section">
          <h2>Latest news and analysis</h2>
          <div className="news-list">
            <article className="news-item">
              <span className="news-time">2h ago</span>
              <h3 className="news-title">EUR/USD: ECB rate decision in focus amid resilient inflation</h3>
              <p className="news-excerpt">Markets expect ECB to hold rates steady; key levels to watch for breakout.</p>
            </article>
            <article className="news-item">
              <span className="news-time">4h ago</span>
              <h3 className="news-title">XAU/USD: Gold retreats from highs on stronger dollar</h3>
              <p className="news-excerpt">Technical analysis suggests support at 2615; momentum favours consolidation.</p>
            </article>
            <article className="news-item">
              <span className="news-time">6h ago</span>
              <h3 className="news-title">GBP/USD: UK jobs data surprise boosts sterling</h3>
              <p className="news-excerpt">Strong wage growth supports hawkish BoE outlook; 1.2700 resistance in view.</p>
            </article>
          </div>
        </div>
      </section>
      <OrderConfirmModal
        isOpen={!!modal}
        type={modal || 'buy'}
        symbol={symbol}
        marketPrice={marketPrice}
        onConfirm={handleOrderConfirm}
        onClose={() => setModal(null)}
      />
      <OrderConfirmModalAdvanced
        isOpen={advancedModalOpen}
        type="advanced"
        symbol={symbol}
        marketPrice={marketPrice}
        onConfirm={handleAdvancedOrderConfirm}
        onClose={() => setAdvancedModalOpen(false)}
      />
      <ActiveTradesModal
        isOpen={tradesModalOpen}
        onClose={() => setTradesModalOpen(false)}
        onClosePosition={(order) => console.log('Close position:', order)}
      />
      <HistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
      />
    </div>
  );
}
