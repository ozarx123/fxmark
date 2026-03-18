import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount } from '../../context/AccountContext';
import { useMarketData } from '../../hooks/useMarketData';
import { useMarketDataContext } from '../../context/MarketDataContext';
import { useTradingSocket } from '../../services/tradingSocket';
import { useTradeNotifications } from '../../hooks/useTradeNotifications';
import { getDatafeedSocket } from '../../lib/datafeedSocket';
import * as tradingApi from '../../api/tradingApi';
import { computeFloatingPnL, getPriceDifference } from '../../lib/positionPnL';
import SymbolsQuotesPanel from '../../components/trading/SymbolsQuotesPanel';
import ChartWorkspace from '../../components/trading/ChartWorkspace';
import TradeControlPanel from '../../components/trading/TradeControlPanel';
import QuickTradeBar from '../../components/trading/QuickTradeBar';
import AccountSummary from '../../components/trading/AccountSummary';
import RiskRadar from '../../components/trading/RiskRadar';
import TradeAssistantPanel from '../../components/trading/TradeAssistantPanel';
import TerminalTabs from '../../components/trading/TerminalTabs';
import ToastList from '../../components/trading/ToastList';

const SYMBOLS = [
  { value: 'XAU/USD', label: 'XAU/USD (Gold)' },
  { value: 'EUR/USD', label: 'EUR/USD' },
  { value: 'GBP/USD', label: 'GBP/USD' },
  { value: 'USD/JPY', label: 'USD/JPY' },
  { value: 'USD/CHF', label: 'USD/CHF' },
  { value: 'AUD/USD', label: 'AUD/USD' },
];

export default function TerminalLayout() {
  const { accounts, activeAccount, balance, refreshLiveBalance } = useAccount();
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [chartType, setChartType] = useState('candles');
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  /** Single source of truth for open positions in the terminal; chart and panels consume this. */
  const [positions, setPositions] = useState([]);
  const [accountSummary, setAccountSummary] = useState(null);
  const [orderError, setOrderError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [chartLayout, setChartLayout] = useState(1);
  const defaultIndicators = () => ({
    ma: { enabled: false, period: 20 },
    bb: { enabled: false, period: 20, stdDev: 2 },
    rsi: { enabled: false, period: 14 },
  });
  const [chartSlots, setChartSlots] = useState([{ symbol: 'XAU/USD', timeframe: '1m', indicators: defaultIndicators(), drawings: [] }]);
  const [volume, setVolume] = useState('0.01');
  const [quickOrderLoading, setQuickOrderLoading] = useState(false);
  const toastIdRef = useRef(0);
  const lastNotificationRef = useRef(null);
  const marginWarnShownRef = useRef(false);
  const [alerts, setAlerts] = useState([]);

  const addPriceAlert = useCallback((symbol, price, condition = 'above') => {
    const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setAlerts((prev) => [...prev, { id, symbol, type: 'price', price: Number(price), condition, lastFired: null, lastPrice: null }]);
    return id;
  }, []);
  const removeAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const symbol = chartSlots[0]?.symbol ?? 'XAU/USD';
  const timeframe = chartSlots[0]?.timeframe ?? '1m';
  const { tick } = useMarketData(symbol, '1m');
  const { ticks, connected: marketConnected } = useMarketDataContext();
  const { connected: tradingConnected, balanceUpdate } = useTradingSocket();
  const notification = useTradeNotifications();
  const marketPrice = tick?.close ?? tick?.price ?? null;

  const addToast = useCallback((message, kind = 'info') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev.slice(-9), { id, message, kind }]);
    return id;
  }, []);
  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!notification || notification === lastNotificationRef.current) return;
    lastNotificationRef.current = notification;
    addToast(notification.message, notification.kind || 'info');
  }, [notification, addToast]);

  const orderErrorPrevRef = useRef(null);
  useEffect(() => {
    if (orderError && orderError !== orderErrorPrevRef.current) {
      orderErrorPrevRef.current = orderError;
      addToast(orderError, 'error');
    }
    if (!orderError) orderErrorPrevRef.current = null;
  }, [orderError, addToast]);

  useEffect(() => {
    const level = accountSummary?.marginLevel ?? (accountSummary?.marginUsed > 0 && accountSummary?.equity
      ? (accountSummary.equity / accountSummary.marginUsed) * 100 : null);
    if (level != null && level < 150 && level >= 0 && !marginWarnShownRef.current) {
      marginWarnShownRef.current = true;
      addToast(`Margin level low: ${Number(level).toFixed(1)}%`, 'warning');
    }
    if (level != null && level >= 200) marginWarnShownRef.current = false;
  }, [accountSummary?.marginLevel, accountSummary?.marginUsed, accountSummary?.equity, addToast]);

  // Price alerts: check ticks vs alert price, fire toast once per cross (no duplicate)
  const toTickKey = (s) => String(s || '').replace(/\//g, '').toUpperCase();
  useEffect(() => {
    const priceAlerts = alerts.filter((a) => a.type === 'price');
    if (!priceAlerts.length || !ticks) return;
    const updates = {};
    priceAlerts.forEach((a) => {
      const key = toTickKey(a.symbol);
      const tickData = ticks[key];
      const current = tickData?.close ?? tickData?.price;
      if (current == null || !Number.isFinite(current)) return;
      const crossed = a.condition === 'above'
        ? ((a.lastPrice ?? -Infinity) < a.price && current >= a.price)
        : ((a.lastPrice ?? Infinity) > a.price && current <= a.price);
      if (crossed) {
        addToast(`${a.symbol} ${a.condition} ${a.price} — triggered`, 'info');
        updates[a.id] = { lastFired: Date.now(), lastPrice: current };
      } else if (a.lastPrice !== current) {
        updates[a.id] = { lastPrice: current };
      }
    });
    if (Object.keys(updates).length) {
      setAlerts((prev) => prev.map((a) => (updates[a.id] ? { ...a, ...updates[a.id] } : a)));
    }
  }, [ticks, alerts, addToast]);

  const setChartSlot = useCallback((index, updates) => {
    setChartSlots((prev) => {
      const next = [...prev];
      if (!next[index]) return next;
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }, []);

  const WORKSPACE_KEY = 'fxmark_workspace';
  const validSymbols = useMemo(() => new Set(SYMBOLS.map((s) => s.value)), []);
  const saveWorkspace = useCallback(() => {
    try {
      const payload = {
        chartLayout,
        chartType,
        chartSlots: chartSlots.map((s) => ({
          symbol: s.symbol,
          timeframe: s.timeframe,
          indicators: s.indicators,
          drawings: s.drawings ?? [],
        })),
      };
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(payload));
      addToast('Workspace saved', 'success');
    } catch (e) {
      addToast('Failed to save workspace', 'error');
    }
  }, [chartLayout, chartType, chartSlots, addToast]);
  const loadWorkspace = useCallback(() => {
    try {
      const raw = localStorage.getItem(WORKSPACE_KEY);
      if (!raw) {
        addToast('No saved workspace', 'info');
        return;
      }
      const payload = JSON.parse(raw);
      const layout = Math.min(4, Math.max(1, Number(payload.chartLayout) || 1));
      const slots = Array.isArray(payload.chartSlots) ? payload.chartSlots : [];
      const validated = slots.slice(0, layout).map((s) => ({
        symbol: validSymbols.has(s?.symbol) ? s.symbol : SYMBOLS[0]?.value ?? 'XAU/USD',
        timeframe: ['1m', '5m', '15m', '1h', '1d'].includes(s?.timeframe) ? s.timeframe : '1m',
        indicators: s?.indicators && typeof s.indicators === 'object' ? s.indicators : defaultIndicators(),
        drawings: Array.isArray(s?.drawings) ? s.drawings : [],
      }));
      while (validated.length < layout) {
        validated.push({
          symbol: SYMBOLS[validated.length]?.value ?? SYMBOLS[0]?.value,
          timeframe: '1m',
          indicators: defaultIndicators(),
          drawings: [],
        });
      }
      setChartLayout(layout);
      setChartType(payload.chartType === 'line' ? 'line' : 'candles');
      setChartSlots(validated);
      addToast('Workspace loaded', 'success');
    } catch (e) {
      addToast('Failed to load workspace', 'error');
    }
  }, [validSymbols, addToast]);

  const setSymbol = useCallback((s) => setChartSlot(0, { symbol: s }), [setChartSlot]);
  const setTimeframe = useCallback((tf) => setChartSlot(0, { timeframe: tf }), [setChartSlot]);

  useEffect(() => {
    const n = chartLayout === 1 ? 1 : chartLayout === 2 ? 2 : 4;
    setChartSlots((prev) => {
      const next = prev.map((s) => ({ ...s, indicators: s.indicators || defaultIndicators(), drawings: s.drawings ?? [] }));
      while (next.length < n) {
        const def = SYMBOLS[next.length] ?? SYMBOLS[0];
        next.push({ symbol: def.value, timeframe: '1m', indicators: defaultIndicators(), drawings: [] });
      }
      return next.slice(0, n);
    });
  }, [chartLayout]);

  // Resolve current trading account BEFORE any hooks depend on accountId/accountNumber
  const effectiveAccount =
    accounts?.find((a) => a.id === selectedAccountId) ||
    activeAccount ||
    accounts?.[0];
  const accountId = effectiveAccount?.id ?? selectedAccountId;
  const accountNumber = effectiveAccount?.accountNumber;

  useEffect(() => {
    if (!balanceUpdate || !accountId) return;
    if (balanceUpdate.accountId && balanceUpdate.accountId !== accountId) return;
    setAccountSummary((prev) => ({
      ...prev,
      balance: balanceUpdate.balance ?? prev?.balance,
      equity: balanceUpdate.equity ?? prev?.equity,
      marginUsed: balanceUpdate.marginUsed ?? prev?.marginUsed,
      freeMargin: balanceUpdate.freeMargin ?? prev?.freeMargin,
      marginLevel: balanceUpdate.marginLevel ?? prev?.marginLevel,
    }));
  }, [balanceUpdate, accountId]);

  const positionsWithPnl = useMemo(() => {
    if (!Array.isArray(positions)) return [];
    const toKey = (s) => String(s || '').replace(/\//g, '').toUpperCase();
    return positions.map((p) => {
      const key = toKey(p.symbol);
      const t = ticks?.[key];
      const currentPrice = t?.close ?? t?.price ?? p.openPrice ?? p.open_price;
      const openPrice = p.openPrice ?? p.open_price ?? 0;
      const volume = p.volume ?? p.lots ?? 0;
      const side = p.side || p.type || 'BUY';
      const floatingPnL = currentPrice != null && openPrice
        ? computeFloatingPnL({ ...p, openPrice, volume, side }, currentPrice)
        : p.floatingPnL ?? p.floating_pnl ?? p.pnl ?? 0;
      const priceDiff = getPriceDifference({ ...p, openPrice, side }, currentPrice);
      return {
        ...p,
        openPrice,
        currentPrice,
        floatingPnL,
        priceDiff,
        volume,
        side,
      };
    });
  }, [positions, ticks]);

  useEffect(() => {
    if (selectedAccountId) return;
    if (activeAccount?.id && accounts?.some((a) => a.id === activeAccount.id)) {
      setSelectedAccountId(activeAccount.id);
    } else if (accounts?.length) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [activeAccount?.id, accounts, selectedAccountId]);

  const loadTradingData = useCallback(async () => {
    if (!accountId && !accountNumber) return;
    const opts = { accountId, accountNumber };
    try {
      const [ordRes, closedRes, posRes, summaryRes] = await Promise.allSettled([
        tradingApi.listOrders({}, opts),
        tradingApi.getClosedPositions({ limit: 50 }, opts),
        tradingApi.getOpenPositions({}, opts),
        tradingApi.getAccountSummary(opts),
      ]);
      setOrders(ordRes.status === 'fulfilled' ? (Array.isArray(ordRes.value) ? ordRes.value : []) : []);
      const closed = closedRes.status === 'fulfilled' ? (Array.isArray(closedRes.value) ? closedRes.value : []) : [];
      setHistory(closed.map((p) => {
        const rawPnl = p.realizedPnl ?? p.pnl ?? p.realized_pnl ?? p.profitLoss;
        const realizedPnl = rawPnl != null && Number.isFinite(Number(rawPnl)) ? Number(rawPnl) : null;
        const rawOpen = p.openPrice ?? p.open_price;
        const rawClose = p.closePrice ?? p.close_price;
        const openPrice = rawOpen != null && Number.isFinite(Number(rawOpen)) ? Number(rawOpen) : null;
        const closePrice = rawClose != null && Number.isFinite(Number(rawClose)) ? Number(rawClose) : null;
        return {
          id: p.id,
          time: p.closedAt ? new Date(p.closedAt).toLocaleString() : '',
          closedAt: p.closedAt,
          symbol: p.symbol,
          side: p.side,
          volume: p.volume,
          closedVolume: p.closedVolume,
          openPrice,
          closePrice,
          pnl: realizedPnl,
          realizedPnl,
        };
      }));
      setPositions(posRes.status === 'fulfilled' ? (Array.isArray(posRes.value) ? posRes.value : []) : []);
      setAccountSummary(summaryRes.status === 'fulfilled' ? summaryRes.value : null);
    } catch {
      setOrders([]);
      setHistory([]);
      setPositions([]);
      setAccountSummary(null);
    }
  }, [accountId, accountNumber]);

  useEffect(() => {
    loadTradingData();
  }, [loadTradingData]);

  const pendingOrders = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    const pending = ['pending', 'placed', 'partial'];
    const pendingTypes = ['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'];
    return orders.filter((o) => pending.includes(o.status || '') && pendingTypes.includes((o.type || '').toLowerCase()));
  }, [orders]);

  const refreshTradingAndWallet = useCallback(() => {
    loadTradingData();
    refreshLiveBalance?.();
  }, [loadTradingData, refreshLiveBalance]);

  // Refresh positions, orders, history, risk panel and wallet when backend pushes any trade-related event
  useEffect(() => {
    const socket = getDatafeedSocket?.();
    if (!socket || !loadTradingData) return;
    const onRefresh = () => {
      loadTradingData();
      refreshLiveBalance?.();
    };
    socket.on('order_created', onRefresh);
    socket.on('order_triggered', onRefresh);
    socket.on('order_cancelled', onRefresh);
    socket.on('trade:update', onRefresh);
    socket.on('risk_event', onRefresh);
    return () => {
      socket.off('order_created', onRefresh);
      socket.off('order_triggered', onRefresh);
      socket.off('order_cancelled', onRefresh);
      socket.off('trade:update', onRefresh);
      socket.off('risk_event', onRefresh);
    };
  }, [loadTradingData, refreshLiveBalance]);

  // Prefer account summary from API (DB: trading_accounts for demo, wallet for live)
  const summary = accountSummary ?? {};
  const balanceVal = summary.balance ?? balance ?? 0;
  const equityVal = summary.equity ?? summary.balance ?? balanceVal;
  const marginUsedVal = summary.marginUsed ?? 0;
  const openPnlVal = positionsWithPnl.reduce((acc, p) => acc + (p.floatingPnL ?? p.floating_pnl ?? p.pnl ?? 0), 0);

  const handleClosePositionFromChart = useCallback(
    async (positionId, closePrice) => {
      if (!positionId) return;
      if (!accountId && !accountNumber) {
        setOrderError('Select a trading account first (use the account dropdown).');
        return;
      }
      setOrderError(null);
      try {
        await tradingApi.closePosition(positionId, undefined, closePrice, { accountId, accountNumber });
        await loadTradingData();
        refreshLiveBalance?.();
      } catch (e) {
        setOrderError(e?.message ?? 'Failed to close position');
      }
    },
    [accountId, accountNumber, loadTradingData, refreshLiveBalance],
  );

  const handleModifySLTPFromChart = useCallback(
    async (positionId, { takeProfit, stopLoss }) => {
      if (!positionId) return;
      setOrderError(null);
      try {
        await tradingApi.updatePositionTPLS(positionId, { takeProfit, stopLoss }, { accountId, accountNumber });
        await loadTradingData();
      } catch (e) {
        setOrderError(e?.message ?? 'Failed to update SL/TP');
        throw e;
      }
    },
    [accountId, accountNumber, loadTradingData],
  );

  const handleBreakEvenFromChart = useCallback(
    async (positionId) => {
      if (!positionId) return;
      const pos = positionsWithPnl.find((p) => p.id === positionId);
      const entry = pos?.openPrice ?? pos?.open_price;
      if (entry == null || !Number.isFinite(Number(entry))) return;
      setOrderError(null);
      try {
        await tradingApi.updatePositionTPLS(positionId, { stopLoss: Number(entry) }, { accountId, accountNumber });
        await loadTradingData();
      } catch (e) {
        setOrderError(e?.message ?? 'Failed to set break-even');
      }
    },
    [accountId, accountNumber, loadTradingData, positionsWithPnl],
  );

  const handleQuickSell = useCallback(async () => {
    if (!accountId && !accountNumber) {
      setOrderError('Select a trading account first.');
      return;
    }
    const vol = parseFloat(volume);
    if (!Number.isFinite(vol) || vol <= 0) {
      setOrderError('Invalid volume');
      return;
    }
    if (!marketPrice || !Number.isFinite(Number(marketPrice))) {
      setOrderError('Market price not available.');
      return;
    }
    setOrderError(null);
    setQuickOrderLoading(true);
    try {
      await tradingApi.placeOrder({
        symbol: symbol.replace(/\//g, ''),
        side: 'sell',
        type: 'MARKET_SELL',
        marketOrder: true,
        volume: vol,
        lots: vol,
        price: marketPrice,
      }, { accountId, accountNumber });
      loadTradingData();
      addToast(`Sell ${vol.toFixed(2)} ${symbol} filled`, 'success');
    } catch (err) {
      setOrderError(err?.message || 'Order failed');
    } finally {
      setQuickOrderLoading(false);
    }
  }, [accountId, accountNumber, volume, symbol, marketPrice, loadTradingData, addToast]);

  const handleQuickBuy = useCallback(async () => {
    if (!accountId && !accountNumber) {
      setOrderError('Select a trading account first.');
      return;
    }
    const vol = parseFloat(volume);
    if (!Number.isFinite(vol) || vol <= 0) {
      setOrderError('Invalid volume');
      return;
    }
    if (!marketPrice || !Number.isFinite(Number(marketPrice))) {
      setOrderError('Market price not available.');
      return;
    }
    setOrderError(null);
    setQuickOrderLoading(true);
    try {
      await tradingApi.placeOrder({
        symbol: symbol.replace(/\//g, ''),
        side: 'buy',
        type: 'MARKET_BUY',
        marketOrder: true,
        volume: vol,
        lots: vol,
        price: marketPrice,
      }, { accountId, accountNumber });
      loadTradingData();
      addToast(`Buy ${vol.toFixed(2)} ${symbol} filled`, 'success');
    } catch (err) {
      setOrderError(err?.message || 'Order failed');
    } finally {
      setQuickOrderLoading(false);
    }
  }, [accountId, accountNumber, volume, symbol, marketPrice, loadTradingData, addToast]);

  const formatPrice = (p) => (p != null && Number.isFinite(Number(p)))
    ? (symbol?.includes('XAU') ? Number(p).toFixed(2) : Number(p).toFixed(4))
    : '—';

  return (
    <div className="terminal-layout">
      <header className="terminal-layout__header">
        <h1 className="terminal-layout__title">Trading</h1>
        <div className="terminal-layout__header-actions">
          <div className="terminal-layout__header-metrics">
            <span className="terminal-layout__metric">
              <span className="terminal-layout__metric-label">Equity</span>
              <span className="terminal-layout__metric-value">${equityVal.toFixed(2)}</span>
            </span>
            <span className="terminal-layout__metric">
              <span className="terminal-layout__metric-label">Margin</span>
              <span className="terminal-layout__metric-value">${marginUsedVal.toFixed(2)}</span>
            </span>
            <span className={`terminal-layout__metric ${openPnlVal >= 0 ? 'terminal-layout__metric--profit' : 'terminal-layout__metric--loss'}`}>
              <span className="terminal-layout__metric-label">Open P&amp;L</span>
              <span className="terminal-layout__metric-value">
                {openPnlVal >= 0 ? '+' : ''}{openPnlVal.toFixed(2)}
              </span>
            </span>
          </div>
          <div className="terminal-layout__chart-layout" role="group" aria-label="Chart layout">
            {[1, 2, 4].map((n) => (
              <button
                key={n}
                type="button"
                className={`terminal-layout__layout-btn ${chartLayout === n ? 'terminal-layout__layout-btn--active' : ''}`}
                onClick={() => setChartLayout(n)}
                title={`${n} chart${n > 1 ? 's' : ''}`}
              >
                {n}
              </button>
            ))}
            <button type="button" className="terminal-layout__layout-btn" title="Save workspace" onClick={saveWorkspace}>
              Save
            </button>
            <button type="button" className="terminal-layout__layout-btn" title="Load workspace" onClick={loadWorkspace}>
              Load
            </button>
          </div>
          {accounts?.length > 0 && (
            <select
              value={accountId ?? ''}
              onChange={(e) => setSelectedAccountId(e.target.value || null)}
              className="terminal-layout__account-select"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountNumber || a.id} — {a.type === 'pamm' ? (a.name || 'Fund') : (a.type === 'live' ? 'Live' : 'Demo')}
                </option>
              ))}
            </select>
          )}
          <span className={`terminal-layout__connection ${tradingConnected ? 'terminal-layout__connection--live' : ''}`} title="Trading connection">
            {tradingConnected ? 'Live' : 'Connecting…'}
          </span>
          <span className={`terminal-layout__connection terminal-layout__connection--market ${marketConnected ? 'terminal-layout__connection--live' : ''}`} title="Market data">
            {marketConnected ? 'Data' : '—'}
          </span>
        </div>
      </header>

      <div className="terminal-layout__mobile-account">
        <AccountSummary
          accountId={accountId}
          accountNumber={accountNumber}
          className="terminal-layout__account-summary terminal-layout__account-summary--compact"
        />
      </div>

      <div className="terminal-layout__body">
        <aside className="terminal-layout__sidebar">
          <SymbolsQuotesPanel
            symbols={SYMBOLS}
            selectedSymbol={symbol}
            onSelectSymbol={setSymbol}
          />
        </aside>

        <main className={`terminal-layout__center terminal-layout__center--charts-${chartLayout}`}>
          <div className="terminal-layout__symbol-price-row">
            <span className="terminal-layout__symbol-name">{symbol}</span>
            <span className="terminal-layout__current-price">{formatPrice(marketPrice)}</span>
          </div>
          <QuickTradeBar
            volume={volume}
            onVolumeChange={setVolume}
            onSell={handleQuickSell}
            onBuy={handleQuickBuy}
            loading={quickOrderLoading}
            disabled={!accountId && !accountNumber}
            className="terminal-layout__quick-trade-bar"
          />
          <div className="terminal-layout__chart-area">
          {chartSlots.slice(0, chartLayout === 1 ? 1 : chartLayout === 2 ? 2 : 4).map((slot, i) => (
            <ChartWorkspace
              key={i}
              symbol={slot.symbol}
              onSymbolChange={(s) => setChartSlot(i, { symbol: s })}
              symbols={SYMBOLS}
              timeframe={slot.timeframe}
              onTimeframeChange={(tf) => setChartSlot(i, { timeframe: tf })}
              chartType={chartType}
              onChartTypeChange={setChartType}
              height={chartLayout === 1 ? 520 : chartLayout === 2 ? 260 : 260}
              positions={positionsWithPnl}
              pendingOrders={pendingOrders}
              onClosePosition={handleClosePositionFromChart}
              onModifySLTP={handleModifySLTPFromChart}
              onBreakEven={handleBreakEvenFromChart}
              indicators={slot.indicators}
              onIndicatorsChange={(next) => setChartSlot(i, { indicators: next })}
              drawings={slot.drawings}
              onDrawingsChange={(next) => setChartSlot(i, { drawings: next })}
              onAddPriceAlert={(sym, price) => addPriceAlert(sym, price)}
              onBreakout={(dir) => addToast(`Breakout ${dir}`, 'info')}
            />
          ))}
          </div>
        </main>

        <aside className="terminal-layout__right">
          <AccountSummary
            accountId={accountId}
            accountNumber={accountNumber}
            className="terminal-layout__account-summary terminal-layout__account-summary--desktop"
          />
          <TradeControlPanel
            symbol={symbol}
            symbols={SYMBOLS}
            accountId={accountId}
            accountNumber={accountNumber}
            marketPrice={marketPrice}
            equity={equityVal}
            volume={volume}
            onVolumeChange={setVolume}
            onOrderPlaced={loadTradingData}
            onOrderSuccess={(msg) => addToast(msg || 'Order placed', 'success')}
            onError={setOrderError}
            hideMarketButtons
            className="terminal-layout__trade-control"
          />
          {orderError && (
            <p className="terminal-layout__order-error">{orderError}</p>
          )}
        </aside>

        <div className="terminal-layout__bottom">
          <TerminalTabs
            accountId={accountId}
            accountNumber={accountNumber}
            orders={orders}
            history={history}
            positions={positions}
            positionsWithPnl={positionsWithPnl}
            balance={balanceVal}
            equity={equityVal}
            onPositionsChange={setPositions}
            onRefresh={refreshTradingAndWallet}
            alerts={alerts}
            onRemoveAlert={removeAlert}
          />
        </div>

        <div className="terminal-layout__widgets">
          <RiskRadar
            balance={summary.balance}
            equity={summary.equity}
            marginUsed={summary.marginUsed}
            freeMargin={summary.freeMargin}
            marginLevel={summary.marginLevel}
            positionsWithPnl={positionsWithPnl}
            className="terminal-layout__risk-radar"
          />
          <TradeAssistantPanel />
        </div>
      </div>

      <ToastList toasts={toasts} onDismiss={dismissToast} autoDismissMs={5000} />
    </div>
  );
}
