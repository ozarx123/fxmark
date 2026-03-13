import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount } from '../../context/AccountContext';
import { useMarketData } from '../../hooks/useMarketData';
import { useMarketDataContext } from '../../context/MarketDataContext';
import { useTradingSocket } from '../../services/tradingSocket';
import { getDatafeedSocket } from '../../lib/datafeedSocket';
import * as tradingApi from '../../api/tradingApi';
import { computeFloatingPnL, getPriceDifference } from '../../lib/positionPnL';
import SmartWatchlist from '../../components/trading/SmartWatchlist';
import ChartWorkspace from '../../components/trading/ChartWorkspace';
import TradeControlPanel from '../../components/trading/TradeControlPanel';
import AccountSummary from '../../components/trading/AccountSummary';
import RiskRadar from '../../components/trading/RiskRadar';
import TradeAssistantPanel from '../../components/trading/TradeAssistantPanel';
import TerminalTabs from '../../components/trading/TerminalTabs';

const SYMBOLS = [
  { value: 'XAU/USD', label: 'XAU/USD (Gold)' },
  { value: 'EUR/USD', label: 'EUR/USD' },
  { value: 'GBP/USD', label: 'GBP/USD' },
  { value: 'USD/JPY', label: 'USD/JPY' },
  { value: 'USD/CHF', label: 'USD/CHF' },
  { value: 'AUD/USD', label: 'AUD/USD' },
];

export default function TerminalLayout() {
  const { accounts, activeAccount, balance } = useAccount();
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [symbol, setSymbol] = useState('XAU/USD');
  const [timeframe, setTimeframe] = useState('1m');
  const [chartType, setChartType] = useState('candles');
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [positions, setPositions] = useState([]);
  const [accountSummary, setAccountSummary] = useState(null);
  const [orderError, setOrderError] = useState(null);
  const { tick } = useMarketData(symbol, '1m');
  const { ticks, connected: marketConnected } = useMarketDataContext();
  const { connected: tradingConnected, balanceUpdate } = useTradingSocket();
  const marketPrice = tick?.close ?? tick?.price ?? null;

  useEffect(() => {
    if (!balanceUpdate || (balanceUpdate.accountId && balanceUpdate.accountId !== accountId)) return;
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

  const effectiveAccount = accounts?.find((a) => a.id === selectedAccountId) || activeAccount || accounts?.[0];
  const accountId = effectiveAccount?.id ?? selectedAccountId;
  const accountNumber = effectiveAccount?.accountNumber;

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
      setHistory(closed.map((p) => ({
        id: p.id,
        time: p.closedAt ? new Date(p.closedAt).toLocaleString() : '',
        closedAt: p.closedAt,
        symbol: p.symbol,
        side: p.side,
        volume: p.volume,
        closedVolume: p.closedVolume,
        pnl: p.pnl ?? p.realizedPnl,
      })));
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

  useEffect(() => {
    const socket = getDatafeedSocket?.();
    if (!socket || !loadTradingData) return;
    const onOrderEvent = () => loadTradingData();
    socket.on('order_created', onOrderEvent);
    socket.on('order_triggered', onOrderEvent);
    socket.on('order_cancelled', onOrderEvent);
    return () => {
      socket.off('order_created', onOrderEvent);
      socket.off('order_triggered', onOrderEvent);
      socket.off('order_cancelled', onOrderEvent);
    };
  }, [loadTradingData]);

  const summary = accountSummary ?? {};
  const balanceVal = summary.balance ?? balance ?? 0;
  const equityVal = summary.equity ?? summary.balance ?? balanceVal;

  return (
    <div className="terminal-layout">
      <header className="terminal-layout__header">
        <h1 className="terminal-layout__title">Trading</h1>
        <div className="terminal-layout__header-actions">
          {accounts?.length > 0 && (
            <select
              value={accountId ?? ''}
              onChange={(e) => setSelectedAccountId(e.target.value || null)}
              className="terminal-layout__account-select"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountNumber || a.id} — {a.type === 'live' ? 'Live' : 'Demo'}
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

      <div className="terminal-layout__grid">
        <aside className="terminal-layout__sidebar">
          <SmartWatchlist
            symbols={SYMBOLS}
            selectedSymbol={symbol}
            onSelectSymbol={setSymbol}
          />
        </aside>

        <main className="terminal-layout__center">
          <ChartWorkspace
            symbol={symbol}
            onSymbolChange={setSymbol}
            symbols={SYMBOLS}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            chartType={chartType}
            onChartTypeChange={setChartType}
            height={380}
            positions={positionsWithPnl}
            pendingOrders={pendingOrders}
          />
        </main>

        <aside className="terminal-layout__right">
          <AccountSummary
            accountId={accountId}
            accountNumber={accountNumber}
            className="terminal-layout__account-summary"
          />
          <TradeControlPanel
            symbol={symbol}
            symbols={SYMBOLS}
            accountId={accountId}
            accountNumber={accountNumber}
            marketPrice={marketPrice}
            onOrderPlaced={loadTradingData}
            onError={setOrderError}
            className="terminal-layout__trade-control"
          />
          {orderError && (
            <p className="terminal-layout__order-error">{orderError}</p>
          )}
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
        </aside>
      </div>

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
          onRefresh={loadTradingData}
        />
      </div>
    </div>
  );
}
