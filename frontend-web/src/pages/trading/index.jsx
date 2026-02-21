import React, { useState } from 'react';
import FxChart from '../../components/FxChart';
import OrderConfirmModal from '../../components/OrderConfirmModal';
import OrderConfirmModalAdvanced from '../../components/OrderConfirmModalAdvanced';
import ActiveTradesModal from '../../components/ActiveTradesModal';
import HistoryModal from '../../components/HistoryModal';
import { useMarketData } from '../../hooks/useMarketData';

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

export default function Trading() {
  const [symbol, setSymbol] = useState('EUR/USD');
  const [timeframe, setTimeframe] = useState('1m');
  const [chartType, setChartType] = useState('candles'); // 'candles' | 'line'
  const { candles, tick, loading, error } = useMarketData(symbol, timeframe);
  const marketPrice = tick?.close ?? tick?.price ?? (candles?.length ? candles[candles.length - 1]?.close : null);
  const [modal, setModal] = useState(null); // null | 'buy' | 'sell'
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [tradesModalOpen, setTradesModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

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
              <button type="button" className="btn btn-secondary" onClick={() => setModal('sell')}>Sell</button>
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
