import React, { useState, useEffect, useCallback } from 'react';
import FxChart from '../../components/FxChart';
import {
  QuoteCardsStrip,
  OrderTicketSidebar,
  TradeRiskPanel,
} from '../../components/trading';
import OrderConfirmModal from '../../components/OrderConfirmModal';
import OrderConfirmModalAdvanced from '../../components/OrderConfirmModalAdvanced';
import ActiveTradesModal from '../../components/ActiveTradesModal';
import HistoryModal from '../../components/HistoryModal';
import { useMarketData } from '../../hooks/useMarketData';
import { useLivePrices, getPriceForSymbol, computePnL } from '../../hooks/useLivePrices';
import { useTradeSnapshot } from '../../context/MarketDataContext.jsx';
import { useTradeNotifications } from '../../hooks/useTradeNotifications.js';
import { useTechnicalAnalysis } from '../../hooks/useTechnicalAnalysis.js';
import { useAccount } from '../../context/AccountContext';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../hooks/useFinance';
import * as tradingApi from '../../api/tradingApi';
import * as pammApi from '../../api/pammApi';

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
  'XAU/USD': 3000,
  XAUUSD: 3000,
  'EUR/USD': 1.1555,
  'GBP/USD': 1.2950,
  'USD/JPY': 149.80,
  'USD/CHF': 0.8820,
  'USD/CAD': 1.3580,
  'AUD/USD': 0.6450,
  'NZD/USD': 0.5920,
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

function mapPositionToModal(pos) {
  return {
    id: pos.id,
    symbol: pos.symbol,
    type: pos.side || 'buy',
    lots: pos.volume ?? pos.lots ?? 0,
    entryPrice: pos.openPrice ?? pos.entryPrice ?? 0,
    currentPrice: pos.currentPrice ?? pos.openPrice ?? 0,
    pnl: pos.pnl ?? 0,
    takeProfit: pos.takeProfit ?? null,
    stopLoss: pos.stopLoss ?? null,
  };
}

function mapHistoryItem(item, isPosition) {
  if (isPosition) {
    const d = item.closedAt ? new Date(item.closedAt) : new Date(item.updatedAt);
    return {
      id: item.id,
      time: d.toISOString().slice(0, 16).replace('T', ' '),
      symbol: item.symbol,
      type: item.side || 'buy',
      lots: item.volume ?? item.closedVolume ?? 0,
      price: item.openPrice,
      pnl: item.pnl ?? null,
      status: 'closed',
    };
  }
  const d = item.createdAt ? new Date(item.createdAt) : new Date();
  return {
    id: item.id,
    time: d.toISOString().slice(0, 16).replace('T', ' '),
    symbol: item.symbol,
    type: `${item.side || 'buy'}_${item.type === 'limit' ? 'limit' : 'market'}`,
    lots: item.volume ?? 0,
    price: item.price ?? null,
    pnl: null,
    status: item.status || 'pending',
  };
}

export default function Trading() {
  const notification = useTradeNotifications();
  const { accounts, activeAccount, setActiveAccount, balance, refreshActiveBalance, refreshLiveBalance, loading: accountsLoading } = useAccount();
  const { isAuthenticated } = useAuth();
  const { refresh: refreshFinance } = useFinance();
  const [pammAccounts, setPammAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [symbol, setSymbol] = useState('XAU/USD');
  const [timeframe, setTimeframe] = useState('1m');
  const [chartType, setChartType] = useState('candles');
  const [chartTool, setChartTool] = useState('hairline');
  const { candles, tick, loading, error, wsConnected } = useMarketData(symbol, timeframe);
  const { prices: livePrices, latency: liveLatency } = useLivePrices();
  const lastCandleClose = candles?.length ? candles[candles.length - 1]?.close : null;
  // Use tick first, then livePrices (same WS stream, all symbols), then candle close, then fallback
  const livePriceForSymbol = getPriceForSymbol(livePrices, symbol);
  const marketPrice = tick?.close ?? tick?.price ?? livePriceForSymbol ?? lastCandleClose ?? FALLBACK_MARKET_PRICES[symbol] ?? null;
  // So chart updates last candle when price comes from livePrices (e.g. XAU/USD) even if useMarketData tick is missing
  const chartTick = tick ?? (livePriceForSymbol != null ? { close: livePriceForSymbol, price: livePriceForSymbol } : null);
  const { data: technicalData, loading: technicalLoading, error: technicalError } = useTechnicalAnalysis(symbol, '1day');
  const fallbackAnalysis = getAnalysisForSymbol(symbol, marketPrice);
  const analysis = (technicalData && !technicalError)
    ? {
        trend: technicalData.trend ?? fallbackAnalysis.trend,
        trendClass: technicalData.trendClass ?? fallbackAnalysis.trendClass,
        summary: technicalData.summary ?? fallbackAnalysis.summary,
        support: Array.isArray(technicalData.support) && technicalData.support.length ? technicalData.support : fallbackAnalysis.support,
        resistance: Array.isArray(technicalData.resistance) && technicalData.resistance.length ? technicalData.resistance : fallbackAnalysis.resistance,
        rsi: technicalData.rsi ?? fallbackAnalysis.rsi,
        rsiSignal: technicalData.rsiSignal ?? fallbackAnalysis.rsiSignal,
        momentum: technicalData.momentum ?? fallbackAnalysis.momentum,
        macd: technicalData.macd,
        macd_signal: technicalData.macd_signal,
        macd_hist: technicalData.macd_hist,
      }
    : fallbackAnalysis;
  const [modal, setModal] = useState(null);
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [tradesModalOpen, setTradesModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [closedPositions, setClosedPositions] = useState([]);
  const [tradingLoading, setTradingLoading] = useState(false);
  const [tradingError, setTradingError] = useState('');

  const pammAccountList = (pammAccounts || []).map(({ account }) => account).filter(Boolean);
  const tradingAccounts = [...(accounts || []), ...pammAccountList];
  const effectiveActiveAccount =
    tradingAccounts.find((a) => a.id === selectedAccountId) ||
    activeAccount ||
    (tradingAccounts.length ? tradingAccounts[0] : null);
  const accountOpts = effectiveActiveAccount ? { accountId: effectiveActiveAccount.id, accountNumber: effectiveActiveAccount.accountNumber } : {};

  useEffect(() => {
    if (selectedAccountId) return;
    if (activeAccount?.id && tradingAccounts.some((a) => a.id === activeAccount.id)) {
      setSelectedAccountId(activeAccount.id);
    } else if (tradingAccounts.length) {
      setSelectedAccountId(tradingAccounts[0].id);
    }
  }, [activeAccount?.id, tradingAccounts, selectedAccountId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    pammApi.listPammTradingAccounts().then((list) => setPammAccounts(list || [])).catch(() => setPammAccounts([]));
  }, [isAuthenticated]);

  const displayBalance = effectiveActiveAccount?.type === 'pamm'
    ? (effectiveActiveAccount?.balance ?? 0)
    : effectiveActiveAccount?.type === 'demo'
      ? (effectiveActiveAccount?.balance ?? 10000)
      : balance;
  const tradeSnapshot = useTradeSnapshot();

  const loadTradingData = useCallback(async (silent = false) => {
    if (!isAuthenticated) return;
    if (!silent) setTradingLoading(true);
    setTradingError('');
    try {
      const [posSettled, ordSettled, closedSettled] = await Promise.allSettled([
        tradingApi.getOpenPositions({}, accountOpts),
        tradingApi.listOrders({}, accountOpts),
        tradingApi.getClosedPositions({ limit: 50 }, accountOpts),
      ]);
      const posRes = posSettled.status === 'fulfilled' ? posSettled.value : [];
      const ordRes = ordSettled.status === 'fulfilled' ? ordSettled.value : [];
      const closedRes = closedSettled.status === 'fulfilled' ? closedSettled.value : [];
      setPositions(Array.isArray(posRes) ? posRes : []);
      setOrders(Array.isArray(ordRes) ? ordRes : []);
      setClosedPositions(Array.isArray(closedRes) ? closedRes : []);
      const failed = [posSettled, ordSettled, closedSettled].some((s) => s.status === 'rejected');
      if (failed) throw new Error('Failed to load trading data');
      return true;
    } catch (e) {
      setTradingError(e.message || 'Failed to load trading data');
      return false;
    } finally {
      if (!silent) setTradingLoading(false);
    }
  }, [isAuthenticated, accountOpts.accountId, accountOpts.accountNumber]);

  useEffect(() => {
    loadTradingData();
  }, [loadTradingData]);

  // Apply trade updates from WebSocket pool (replaces REST polling)
  useEffect(() => {
    if (!tradeSnapshot || !isAuthenticated) return;
    const aid = accountOpts.accountId;
    const filterByAccount = (arr) =>
      Array.isArray(arr)
        ? aid ? arr.filter((x) => !x.accountId || x.accountId === aid) : arr
        : [];
    setPositions(filterByAccount(tradeSnapshot.positions));
    setOrders(filterByAccount(tradeSnapshot.orders));
  }, [tradeSnapshot, isAuthenticated, accountOpts.accountId]);

  // Refresh when user returns to tab (e.g. after placing order in another window)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        loadTradingData(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isAuthenticated, loadTradingData]);

  const equity = displayBalance;

  // Merge positions with live P&L: use WS prices, fallback to chart price when symbol matches
  const positionsWithLivePnl = positions.map((p) => {
    let currentPrice = getPriceForSymbol(livePrices, p.symbol);
    if (currentPrice == null && marketPrice != null) {
      const posInternal = (p.symbol || '').replace(/\//g, '').toUpperCase();
      const chartInternal = (symbol || '').replace(/\//g, '').toUpperCase();
      if (posInternal === chartInternal) currentPrice = marketPrice;
    }
    if (currentPrice == null) currentPrice = p.currentPrice ?? p.openPrice;
    const pnl = currentPrice != null ? computePnL(p, currentPrice) : (p.pnl ?? 0);
    return { ...p, currentPrice, livePnl: currentPrice != null ? pnl : null, pnl };
  });
  const profit = positionsWithLivePnl.reduce((s, p) => s + (p.pnl ?? 0), 0);

  // Margin = sum of (volume * contract_size * price / leverage). Gold: 100oz, forex: 100k, leverage 100
  const margin = positionsWithLivePnl.reduce((sum, p) => {
    const vol = Number(p.volume ?? p.lots) || 0;
    const price = p.currentPrice ?? p.openPrice ?? 0;
    if (!vol || !price) return sum;
    const posInternal = (p.symbol || '').replace(/\//g, '').toUpperCase();
    const isGold = posInternal.includes('XAU') || posInternal === 'GOLD';
    const contractSize = isGold ? 100 : 100000;
    const leverage = 100;
    return sum + (vol * contractSize * price) / leverage;
  }, 0);

  const notificationMessage = notification?.message ?? null;
  const notificationKind = notification?.kind ?? null;
  const notificationClassName = notificationMessage
    ? `trade-notification-banner ${
        notificationKind === 'warning'
          ? 'trade-notification-banner--warning'
          : 'trade-notification-banner--success'
      }`
    : '';

  const handleOrderConfirm = async (order) => {
    if (!isAuthenticated) return;
    const side = modal === 'sell' ? 'sell' : 'buy';
    setModal(null);
    try {
      await tradingApi.placeOrder({
        symbol: order.symbol,
        side,
        lots: order.lots,
        price: order.price,
        marketOrder: order.marketOrder ?? true,
      }, accountOpts);
      loadTradingData();
      refreshFinance();
      refreshActiveBalance();
      setTimeout(() => loadTradingData(true), 800);
    } catch (e) {
      setTradingError(e.message || 'Failed to place order');
    }
  };

  const handleAdvancedOrderConfirm = async (order) => {
    if (!isAuthenticated) return;
    setAdvancedModalOpen(false);
    try {
      const isMarket = order.orderType === 'market';
      const side = (order.orderType || '').startsWith('sell') ? 'sell' : 'buy';
      await tradingApi.placeOrder({
        symbol: order.symbol,
        side,
        lots: order.lots,
        price: order.price,
        marketOrder: isMarket,
      }, accountOpts);
      loadTradingData();
      refreshFinance();
      refreshActiveBalance();
      setTimeout(() => loadTradingData(true), 800);
    } catch (e) {
      setTradingError(e.message || 'Failed to place order');
    }
  };

  const handleClosePosition = async (payload) => {
    if (!payload?.id) return;
    try {
      const volume = payload.partial ? payload.lots : undefined;
      const closePrice = payload.currentPrice ?? undefined;
      await tradingApi.closePosition(payload.id, volume, closePrice, accountOpts);
      loadTradingData();
      refreshFinance();
      refreshActiveBalance();
      refreshLiveBalance();
      setTimeout(() => loadTradingData(true), 800);
    } catch (e) {
      setTradingError(e.message || 'Failed to close position');
    }
  };

  const modalPositions = positionsWithLivePnl.map((p) => mapPositionToModal({ ...p, pnl: p.pnl }));
  const historyItems = [
    ...closedPositions.map((p) => mapHistoryItem(p, true)),
    ...orders.map((o) => mapHistoryItem(o, false)),
  ].sort((a, b) => (b.time > a.time ? 1 : -1));

  return (
    <div className="page trading-page">
      {notificationMessage && (
        <div className={notificationClassName}>
          <span>{notificationMessage}</span>
          <button
            type="button"
            className="trade-notification-close"
            onClick={() => {
              // simple local hide by reloading component state via no-op; real close handled inside hook
              // trading page has no direct setter, so rely on notification hook updating on next event
              const banner = document.querySelector('.trade-notification-banner');
              if (banner) banner.style.display = 'none';
            }}
          >
            ×
          </button>
        </div>
      )}

      <div className="trading-stats-bar trading-stats-bar--compact">
        <div className="trading-stat trading-stat-account">
          <span className="trading-stat-label">Account</span>
          {tradingAccounts.length ? (
            <select
              value={effectiveActiveAccount?.id ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                const a = tradingAccounts.find((x) => x.id === id);
                if (a) {
                  setSelectedAccountId(id);
                  if (a.type !== 'pamm') setActiveAccount(a);
                }
              }}
              className="chart-select trading-account-select"
            >
              {tradingAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountNumber || a.id} — {a.type === 'pamm' ? 'PAMM' : a.type === 'live' ? 'Live' : 'Demo'}
                  {a.name ? ` (${a.name})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="trading-stat-value">{accountsLoading ? '…' : '—'}</span>
          )}
        </div>
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
        <div className="trading-stat trading-stat-actions">
          <button
            type="button"
            className="btn btn-close-position"
            onClick={() => setTradesModalOpen(true)}
          >
            Close position
          </button>
        </div>
      </div>
      <section className="page-content">
        <div className="trading-chart-with-sidebar">
          <div className="trading-chart-main">
        <div className="chart-price-header">
          <span className="chart-price-symbol">{symbol}</span>
          <span className="chart-price-value">{marketPrice != null ? (symbol?.includes('XAU') ? marketPrice.toFixed(2) : marketPrice.toFixed(4)) : '—'}</span>
          <span className={`chart-price-change ${(analysis?.rsi ?? 50) >= 50 ? 'positive' : 'negative'}`}>
            {analysis?.rsi != null ? `${(analysis.rsi - 50) / 50 > 0 ? '+' : ''}${((analysis.rsi - 50) / 50 * 1.5).toFixed(2)}%` : '—'}
          </span>
        </div>
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
            <label>
              <span className="chart-control-label">Tool</span>
              <select
                value={chartTool}
                onChange={(e) => setChartTool(e.target.value)}
                className="chart-select"
              >
                <option value="none">None</option>
                <option value="hairline">Hairline</option>
                <option value="trendline" disabled>Trendline (coming soon)</option>
              </select>
            </label>
          </div>
          {import.meta.env.DEV && (
            <div className="chart-latency-debug">
              <span className="chart-latency-debug-label">Latency (ms)</span>
              {(() => {
                const internal = (symbol || '').replace(/\//g, '').toUpperCase();
                const l = liveLatency?.[internal];
                if (!l) return <span className="chart-latency-debug-value">—</span>;
                const parts = [];
                if (l.providerToServerMs != null) parts.push(`feed→srv ${Math.round(l.providerToServerMs)}`);
                if (l.serverToClientMs != null) parts.push(`srv→ui ${Math.round(l.serverToClientMs)}`);
                if (l.endToEndMs != null) parts.push(`total ${Math.round(l.endToEndMs)}`);
                return <span className="chart-latency-debug-value">{parts.join(' | ')}</span>;
              })()}
            </div>
          )}
          <FxChart
            symbol={symbol}
            height={380}
            showCandles={chartType === 'candles'}
            data={candles}
            tick={chartTick}
            timeframe={timeframe}
            loading={loading}
            error={error}
            wsConnected={wsConnected}
            marketPrice={marketPrice}
            tool={chartTool}
          />
        </div>
        <QuoteCardsStrip
          symbols={SYMBOLS}
          prices={livePrices}
          fallbackPrices={FALLBACK_MARKET_PRICES}
          selectedSymbol={symbol}
          onSelectSymbol={setSymbol}
        />
            <div className="section-block trading-analysis-section">
          <h2>Technical analysis — {symbol}</h2>
          {technicalLoading && (
            <p className="muted">
              <span className="spinner spinner-inline" />
            </p>
          )}
          {technicalError && !technicalLoading && (
            <p className="muted">Using fallback analysis. ({technicalError})</p>
          )}
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
                    {(analysis.resistance || []).map((r) => (r < 100 ? r.toFixed(4) : r.toFixed(2))).join(', ')}
                  </span>
                </div>
                <div className="trading-analysis-level-row">
                  <span className="trading-analysis-level-label">Support</span>
                  <span className="trading-analysis-level-value">
                    {(analysis.support || []).map((s) => (s < 100 ? s.toFixed(4) : s.toFixed(2))).join(', ')}
                  </span>
                </div>
              </div>
            </div>
            <div className="trading-analysis-card">
              <h3 className="trading-analysis-card-title">Indicators</h3>
              <div className="trading-analysis-indicators">
                <div className="trading-analysis-indicator">
                  <span className="trading-analysis-indicator-label">RSI (14)</span>
                  <span className="trading-analysis-indicator-value">
                    {typeof analysis.rsi === 'number' ? analysis.rsi.toFixed(1) : analysis.rsi}
                  </span>
                  <span className={`trading-analysis-indicator-signal trading-analysis-indicator-signal--${(analysis.rsiSignal || 'neutral').toLowerCase()}`}>
                    {analysis.rsiSignal}
                  </span>
                </div>
                {analysis.macd_hist != null && (
                  <div className="trading-analysis-indicator">
                    <span className="trading-analysis-indicator-label">MACD hist</span>
                    <span className="trading-analysis-indicator-value">
                      {Number(analysis.macd_hist).toFixed(4)}
                    </span>
                  </div>
                )}
                <div className="trading-analysis-indicator">
                  <span className="trading-analysis-indicator-label">Momentum</span>
                  <span className="trading-analysis-indicator-value">{analysis.momentum}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
          </div>
          <aside className="trading-terminal-sidebar">
            <OrderTicketSidebar
              symbol={symbol}
              marketPrice={marketPrice}
              onBuy={async (o) => {
                try {
                  await tradingApi.placeOrder({
                    symbol: o.symbol,
                    side: 'buy',
                    lots: o.lots,
                    price: o.price,
                    marketOrder: o.marketOrder ?? true,
                  }, accountOpts);
                  loadTradingData();
                  refreshFinance();
                  refreshActiveBalance();
                  setTimeout(() => loadTradingData(true), 800);
                } catch (e) {
                  setTradingError(e.message || 'Failed to place order');
                }
              }}
              onSell={async (o) => {
                try {
                  await tradingApi.placeOrder({
                    symbol: o.symbol,
                    side: 'sell',
                    lots: o.lots,
                    price: o.price,
                    marketOrder: o.marketOrder ?? true,
                  }, accountOpts);
                  loadTradingData();
                  refreshFinance();
                  refreshActiveBalance();
                  setTimeout(() => loadTradingData(true), 800);
                } catch (e) {
                  setTradingError(e.message || 'Failed to place order');
                }
              }}
              disabled={!isAuthenticated}
              isAuthenticated={!!isAuthenticated}
            />
            <div className="terminal-panel account-summary-panel">
              <h3 className="terminal-panel-title">Account</h3>
              <div className="account-summary-rows">
                <div className="account-summary-row">
                  <span className="account-summary-label">Account Balance</span>
                  <span className="account-summary-value">{formatCurrency(equity)}</span>
                </div>
                <div className="account-summary-row">
                  <span className="account-summary-label">Open PnL</span>
                  <span className={`account-summary-value ${(profit ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                    {(profit ?? 0) >= 0 ? '+' : ''}{formatCurrency(profit ?? 0)}
                  </span>
                </div>
                <div className="account-summary-row">
                  <span className="account-summary-label">Margin Used</span>
                  <span className="account-summary-value">{formatCurrency(margin)}</span>
                </div>
                <div className="account-summary-row">
                  <span className="account-summary-label">Available Margin</span>
                  <span className="account-summary-value">{formatCurrency(Math.max(0, equity - margin))}</span>
                </div>
              </div>
            </div>
            <TradeRiskPanel
              equity={equity}
              margin={margin}
              profit={profit}
              positions={positionsWithLivePnl}
            />
          </aside>
        </div>
        {tradingError && <p className="form-error">{tradingError}</p>}
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
                  {!isAuthenticated ? (
                    <tr><td colSpan={5} className="empty-cell">Sign in to view positions</td></tr>
                  ) : tradingLoading ? (
                    <tr>
                      <td colSpan={5} className="empty-cell">
                        <span className="spinner spinner-inline" />
                      </td>
                    </tr>
                  ) : positionsWithLivePnl.length === 0 ? (
                    <tr><td colSpan={5} className="empty-cell">No open positions</td></tr>
                  ) : (
                    positionsWithLivePnl.map((p) => (
                      <tr key={p.id}>
                        <td>{p.symbol}</td>
                        <td><span className={`type-badge type-${p.side || 'buy'}`}>{p.side || 'buy'}</span></td>
                        <td>{p.volume}</td>
                        <td>{(p.openPrice ?? 0).toFixed(p.symbol?.includes('XAU') ? 2 : 4)}</td>
                        <td className={(p.pnl ?? 0) >= 0 ? 'positive' : 'negative'}>
                          {(p.pnl ?? 0) >= 0 ? '+' : ''}{(p.pnl ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
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
        positions={modalPositions}
        onClose={() => setTradesModalOpen(false)}
        onClosePosition={handleClosePosition}
        accountId={accountOpts.accountId}
        accountNumber={accountOpts.accountNumber}
      />
      <HistoryModal
        isOpen={historyModalOpen}
        history={historyItems}
        onClose={() => setHistoryModalOpen(false)}
      />
    </div>
  );
}
