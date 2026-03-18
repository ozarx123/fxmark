import React, { useState, useCallback, useMemo } from 'react';
import ChartWorkspace from './ChartWorkspace';
import OrderBottomSheet from './OrderBottomSheet';
import RiskSectionMobile from './RiskSectionMobile';
import PositionsPanel from './PositionsPanel';
import OrdersPanel from './OrdersPanel';
import AnalyticsPanel from './AnalyticsPanel';
import JournalPanel from './JournalPanel';

const MOBILE_TABS = [
  { id: 'positions', label: 'Positions' },
  { id: 'orders', label: 'Orders' },
  { id: 'history', label: 'History' },
  { id: 'tools', label: 'Tools' },
];

const TIMEFRAMES = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1d' },
];

export default function MobileTerminalView({
  symbol,
  setSymbol,
  symbols = [],
  marketPrice,
  volume,
  setVolume,
  chartSlot,
  setChartSlot,
  chartType,
  setChartType,
  positions,
  positionsWithPnl,
  orders,
  history,
  pendingOrders,
  accountId,
  accountNumber,
  summary,
  onClosePosition,
  onPartialClose,
  onModifySLTP,
  onBreakEven,
  onPlaceOrder,
  onRefresh,
  addToast,
  orderError,
  setOrderError,
  marketConnected,
  tradingConnected,
  addPriceAlert,
  alerts,
  onRemoveAlert,
  quickOrderLoading,
}) {
  const [activeTab, setActiveTab] = useState('positions');
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [orderSheetSide, setOrderSheetSide] = useState('buy');
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);

  const formatPrice = (p) =>
    p != null && Number.isFinite(Number(p))
      ? (symbol?.includes('XAU') ? Number(p).toFixed(2) : Number(p).toFixed(4))
      : '—';

  const handleBuyPress = useCallback(() => {
    setOrderSheetSide('buy');
    setOrderSheetOpen(true);
  }, []);
  const handleSellPress = useCallback(() => {
    setOrderSheetSide('sell');
    setOrderSheetOpen(true);
  }, []);

  const handlePlaceOrderFromSheet = useCallback(
    async ({ side, volume: vol, stopLoss, takeProfit }) => {
      await onPlaceOrder({ side, volume: vol, stopLoss, takeProfit });
      addToast?.('Order placed', 'success');
    },
    [onPlaceOrder, addToast],
  );

  const equity = summary?.equity ?? summary?.balance ?? 0;
  const freeMargin = summary?.freeMargin ?? equity - (summary?.marginUsed ?? 0);
  const marginUsed = summary?.marginUsed ?? 0;
  const marginLevel = summary?.marginLevel ?? (marginUsed > 0 ? (equity / marginUsed) * 100 : null);
  const hasPositions = positionsWithPnl?.length > 0;

  const filteredHistory = useMemo(() => {
    if (!Array.isArray(history)) return [];
    return [...history].sort((a, b) => {
      const ta = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const tb = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return tb - ta;
    });
  }, [history]);

  return (
    <div className={`mobile-terminal ${chartFullscreen ? 'mobile-terminal--fullscreen' : ''}`}>
      {/* Top bar: Symbol | Price | Spread */}
      <div className="mobile-terminal__topbar-wrap">
      <header className="mobile-terminal__topbar">
        <button
          type="button"
          className="mobile-terminal__symbol-btn"
          onClick={() => setShowSymbolPicker((v) => !v)}
          aria-label="Change symbol"
        >
          <span className="mobile-terminal__symbol">{symbol}</span>
          <span className="mobile-terminal__chevron">▾</span>
        </button>
        {showSymbolPicker && (
          <div className="mobile-terminal__symbol-picker" role="listbox">
            {symbols.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`mobile-terminal__symbol-option ${s.value === symbol ? 'mobile-terminal__symbol-option--active' : ''}`}
                onClick={() => {
                  setSymbol(s.value);
                  setShowSymbolPicker(false);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <span className="mobile-terminal__price">{formatPrice(marketPrice)}</span>
        <span className="mobile-terminal__spread">—</span>
        {marketConnected && <span className="mobile-terminal__live">Live</span>}
      </header>
      </div>

      {/* Chart: 60–70% height, fullscreen toggle */}
      <section className="mobile-terminal__chart-section">
        <div className="mobile-terminal__chart-header">
          <select
            value={chartSlot?.timeframe ?? '1m'}
            onChange={(e) => setChartSlot({ timeframe: e.target.value })}
            className="mobile-terminal__tf-select"
            aria-label="Timeframe"
          >
            {TIMEFRAMES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="mobile-terminal__fullscreen-btn"
            onClick={() => setChartFullscreen((v) => !v)}
            aria-label={chartFullscreen ? 'Exit fullscreen' : 'Fullscreen chart'}
          >
            {chartFullscreen ? '✕' : '⛶'}
          </button>
        </div>
        <div className="mobile-terminal__chart-wrap">
          <ChartWorkspace
            symbol={chartSlot?.symbol ?? symbol}
            onSymbolChange={(s) => { setSymbol(s); setChartSlot({ symbol: s }); }}
            symbols={symbols}
            timeframe={chartSlot?.timeframe ?? '1m'}
            onTimeframeChange={(tf) => setChartSlot({ timeframe: tf })}
            chartType={chartType}
            onChartTypeChange={setChartType}
            height={320}
            positions={positionsWithPnl}
            pendingOrders={pendingOrders}
            onClosePosition={onClosePosition}
            onModifySLTP={onModifySLTP}
            onBreakEven={onBreakEven}
            indicators={chartSlot?.indicators}
            onIndicatorsChange={(next) => setChartSlot({ indicators: next })}
            drawings={chartSlot?.drawings ?? []}
            onDrawingsChange={(next) => setChartSlot({ drawings: next })}
            onAddPriceAlert={addPriceAlert}
            onBreakout={() => addToast?.('Breakout', 'info')}
            compactMobile
            className="mobile-terminal__chart-workspace"
          />
        </div>
        <RiskSectionMobile
          equity={equity}
          freeMargin={freeMargin}
          marginUsed={marginUsed}
          marginLevel={marginLevel}
          hasPositions={hasPositions}
          className="mobile-terminal__risk"
        />
      </section>

      {/* Tabs: Positions | Orders | History | Tools */}
      <div className="mobile-terminal__tabs-head">
        {MOBILE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`mobile-terminal__tab ${activeTab === t.id ? 'mobile-terminal__tab--active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mobile-terminal__tabs-body">
        {activeTab === 'positions' && (
          <div className="mobile-terminal__positions">
            <PositionsPanel
              accountId={accountId}
              accountNumber={accountNumber}
              positions={positions}
              onPositionsChange={() => {}}
              onRefresh={onRefresh}
              mobileCards
              filterSymbol=""
              sortBy="symbol"
              sortDir="asc"
            />
          </div>
        )}
        {activeTab === 'orders' && (
          <div className="mobile-terminal__orders">
            <OrdersPanel
              accountId={accountId}
              accountNumber={accountNumber}
              orders={orders}
              onRefresh={onRefresh}
            />
          </div>
        )}
        {activeTab === 'history' && (
          <div className="mobile-terminal__history">
            {filteredHistory.length === 0 ? (
              <p className="mobile-terminal__empty">No history</p>
            ) : (
              <ul className="mobile-terminal__history-list">
                {filteredHistory.slice(0, 50).map((h) => {
                  const pnl = h.realizedPnl ?? h.pnl;
                  const isGold = (h.symbol || '').includes('XAU');
                  const fmt = (v) => (v != null && Number.isFinite(v) ? Number(v).toFixed(isGold ? 2 : 4) : '—');
                  return (
                    <li key={h.id || h.closedAt || h.time} className="mobile-terminal__history-item">
                      <span className="mobile-terminal__history-symbol">{h.symbol}</span>
                      <span className="mobile-terminal__history-side">{h.side}</span>
                      <span className="mobile-terminal__history-vol">{h.volume ?? h.closedVolume}</span>
                      <span className={`mobile-terminal__history-pnl ${(pnl ?? 0) >= 0 ? 'mobile-terminal__history-pnl--profit' : 'mobile-terminal__history-pnl--loss'}`}>
                        {pnl != null ? `${(pnl >= 0 ? '+' : '')}${Number(pnl).toFixed(2)}` : '—'}
                      </span>
                      <span className="mobile-terminal__history-time">{h.time ?? (h.closedAt ? new Date(h.closedAt).toLocaleString() : '')}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        {activeTab === 'tools' && (
          <div className="mobile-terminal__tools">
            <p className="mobile-terminal__tools-note">Chart tools (MA, BB, RSI, drawings) are in the chart header on mobile. Use the timeframe selector and fullscreen for a cleaner view.</p>
          </div>
        )}
      </div>

      {/* Fixed action bar: SELL | Lot | BUY */}
      <div className="mobile-terminal__action-bar">
        <button
          type="button"
          className="mobile-terminal__action-btn mobile-terminal__action-btn--sell"
          disabled={!accountId && !accountNumber || quickOrderLoading}
          onClick={handleSellPress}
        >
          {quickOrderLoading ? '…' : 'SELL'}
        </button>
        <div className="mobile-terminal__lot">
          <button type="button" className="mobile-terminal__lot-btn" onClick={() => setVolume(String(Math.max(0.01, (parseFloat(volume) || 0.01) - 0.01)))}>−</button>
          <span className="mobile-terminal__lot-value">{Number(parseFloat(volume) || 0.01).toFixed(2)}</span>
          <button type="button" className="mobile-terminal__lot-btn" onClick={() => setVolume(String(Math.min(100, (parseFloat(volume) || 0) + 0.01)))}>+</button>
        </div>
        <button
          type="button"
          className="mobile-terminal__action-btn mobile-terminal__action-btn--buy"
          disabled={!accountId && !accountNumber || quickOrderLoading}
          onClick={handleBuyPress}
        >
          {quickOrderLoading ? '…' : 'BUY'}
        </button>
      </div>

      <OrderBottomSheet
        open={orderSheetOpen}
        onClose={() => setOrderSheetOpen(false)}
        side={orderSheetSide}
        symbol={symbol}
        marketPrice={marketPrice}
        equity={equity}
        initialVolume={volume}
        onPlaceOrder={handlePlaceOrderFromSheet}
        onError={setOrderError}
      />

      {orderError && (
        <div className="mobile-terminal__error" role="alert">
          {orderError}
          <button type="button" onClick={() => setOrderError(null)}>×</button>
        </div>
      )}
    </div>
  );
}
