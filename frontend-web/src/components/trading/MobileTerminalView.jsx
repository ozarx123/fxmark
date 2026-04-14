import React, { useState, useCallback, useMemo } from 'react';
import ChartWorkspace from './ChartWorkspace';
import OrderBottomSheet from './OrderBottomSheet';
import RiskSectionMobile from './RiskSectionMobile';
import PositionsPanel from './PositionsPanel';
import OrdersPanel from './OrdersPanel';
import {
  ChartLineUpIcon,
  LayersIcon,
  ListChecksIcon,
  ClockCounterClockwiseIcon,
} from '../Icons.jsx';

/** Bottom nav sections (icons + labels for a11y). */
const MOBILE_SECTIONS = [
  { id: 'chart', label: 'Chart', Icon: ChartLineUpIcon },
  { id: 'positions', label: 'Positions', Icon: LayersIcon },
  { id: 'orders', label: 'Orders', Icon: ListChecksIcon },
  { id: 'history', label: 'History', Icon: ClockCounterClockwiseIcon },
];

const TIMEFRAMES = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1d' },
];

const LOT_MIN = 0.01;
const LOT_MAX = 100;

function sanitizeLotInput(raw) {
  const s0 = String(raw ?? '').replace(/[^0-9.]/g, '');
  const firstDot = s0.indexOf('.');
  if (firstDot === -1) return s0;
  const intPart = s0.slice(0, firstDot).replace(/\./g, '');
  const fracPart = s0.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
  return `${intPart}.${fracPart}`;
}

function normalizeLotString(s) {
  let n = parseFloat(s);
  if (!Number.isFinite(n) || s === '' || s === '.') n = LOT_MIN;
  n = Math.min(LOT_MAX, Math.max(LOT_MIN, n));
  return String(Math.round(n * 100) / 100);
}

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
  accounts = [],
  onSelectAccount,
  accountId,
  accountNumber,
  summary,
  openPnlTotal,
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
  onChartDisplayedCloseChange,
}) {
  const [activeSection, setActiveSection] = useState('chart');
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

  const balance = summary?.balance ?? 0;
  const marginUsed = summary?.marginUsed ?? 0;
  const useLive = openPnlTotal != null && Number.isFinite(Number(openPnlTotal));
  const equity = useLive ? balance + Number(openPnlTotal) : (summary?.equity ?? summary?.balance ?? 0);
  const freeMargin = useLive ? equity - marginUsed : (summary?.freeMargin ?? equity - marginUsed);
  const marginLevel = useLive
    ? (marginUsed > 0 ? (equity / marginUsed) * 100 : null)
    : (summary?.marginLevel ?? (marginUsed > 0 ? (equity / marginUsed) * 100 : null));
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
        {tradingConnected && (
          <span className="mobile-terminal__trade-live" title="Trading socket">Tx</span>
        )}
        {marketConnected && <span className="mobile-terminal__live">Mkt</span>}
      </header>
      </div>

      <main className="mobile-terminal__main">
        {activeSection === 'chart' && (
          <section className="mobile-terminal__chart-section">
            {accounts.length > 0 && (
              <div className="mobile-terminal__account-select-row">
                <label className="mobile-terminal__account-select-label" htmlFor="mobile-terminal-account">
                  Account
                </label>
                <select
                  id="mobile-terminal-account"
                  className="mobile-terminal__account-select"
                  value={accountId ?? ''}
                  onChange={(e) => onSelectAccount?.(e.target.value || null)}
                  aria-label="Trading account"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.accountNumber || a.id} — {a.type === 'pamm' ? (a.name || 'Fund') : (a.type === 'live' ? 'Live' : 'Demo')}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="mobile-terminal__chart-header">
              <div className="mobile-terminal__chart-header-left">
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
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value)}
                  className="mobile-terminal__tf-select mobile-terminal__chart-type-select"
                  aria-label="Chart type"
                >
                  <option value="candles">Candles</option>
                  <option value="line">Line</option>
                </select>
              </div>
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
              <div className="chart-container">
                <ChartWorkspace
                  symbol={chartSlot?.symbol ?? symbol}
                  onChartDisplayedCloseChange={onChartDisplayedCloseChange}
                  onSymbolChange={(s) => { setSymbol(s); setChartSlot({ symbol: s }); }}
                  symbols={symbols}
                  timeframe={chartSlot?.timeframe ?? '1m'}
                  onTimeframeChange={(tf) => setChartSlot({ timeframe: tf })}
                  chartType={chartType}
                  onChartTypeChange={setChartType}
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
        )}

        {activeSection === 'positions' && (
          <div className="mobile-terminal__panel-scroll">
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

        {activeSection === 'orders' && (
          <div className="mobile-terminal__panel-scroll">
            <OrdersPanel
              accountId={accountId}
              accountNumber={accountNumber}
              orders={orders}
              onRefresh={onRefresh}
            />
          </div>
        )}

        {activeSection === 'history' && (
          <div className="mobile-terminal__panel-scroll mobile-terminal__history">
            {filteredHistory.length === 0 ? (
              <p className="mobile-terminal__empty">No history</p>
            ) : (
              <ul className="mobile-terminal__history-list">
                {filteredHistory.slice(0, 50).map((h) => {
                  const pnl = h.realizedPnl ?? h.pnl;
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
      </main>

      {/* Fixed action bar above section nav: SELL | Lot | BUY */}
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
          <button
            type="button"
            className="mobile-terminal__lot-btn"
            onClick={() => setVolume(normalizeLotString(String((parseFloat(volume) || LOT_MIN) - 0.01)))}
          >
            −
          </button>
          <input
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            className="mobile-terminal__lot-input"
            aria-label="Lot size"
            value={volume}
            onChange={(e) => setVolume(sanitizeLotInput(e.target.value))}
            onBlur={() => setVolume(normalizeLotString(volume))}
          />
          <button
            type="button"
            className="mobile-terminal__lot-btn"
            onClick={() => setVolume(normalizeLotString(String((parseFloat(volume) || 0) + 0.01)))}
          >
            +
          </button>
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

      <nav className="mobile-terminal__bottom-nav" aria-label="Trading sections">
        {MOBILE_SECTIONS.map((s) => {
          const NavIcon = s.Icon;
          return (
            <button
              key={s.id}
              type="button"
              className={`mobile-terminal__nav-item ${activeSection === s.id ? 'mobile-terminal__nav-item--active' : ''}`}
              onClick={() => setActiveSection(s.id)}
              aria-label={s.label}
              aria-current={activeSection === s.id ? 'page' : undefined}
              title={s.label}
            >
              <NavIcon size={22} className="mobile-terminal__nav-icon" aria-hidden />
            </button>
          );
        })}
      </nav>

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
