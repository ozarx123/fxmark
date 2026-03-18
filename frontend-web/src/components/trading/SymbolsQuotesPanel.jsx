import React from 'react';
import { useMarketDataContext } from '../../context/MarketDataContext';

const toInternal = (s) => String(s || '').replace(/\//g, '').toUpperCase();

const DEFAULT_SPREAD = {
  XAUUSD: 0.05,
  EURUSD: 0.0001,
  GBPUSD: 0.0001,
  USDJPY: 0.01,
  USDCHF: 0.0001,
  AUDUSD: 0.0001,
};

function getSpread(symbolKey, tick) {
  if (tick?.spread != null && Number.isFinite(tick.spread)) return tick.spread;
  return DEFAULT_SPREAD[symbolKey] ?? 0.0001;
}

function getBidAsk(mid, spread) {
  if (mid == null || !Number.isFinite(mid)) return { bid: null, ask: null };
  const half = spread / 2;
  return { bid: mid - half, ask: mid + half };
}

function formatPrice(symbol, price) {
  if (price == null || !Number.isFinite(price)) return '—';
  return symbol?.includes('XAU') ? price.toFixed(2) : price.toFixed(4);
}

export default function SymbolsQuotesPanel({ symbols, prices: pricesProp, fallbackPrices, selectedSymbol, onSelectSymbol }) {
  const { ticks } = useMarketDataContext();

  const getMid = (sym) => {
    const key = toInternal(sym);
    const tick = ticks?.[key];
    const p = tick?.close ?? tick?.price ?? pricesProp?.[key] ?? fallbackPrices?.[sym] ?? fallbackPrices?.[key];
    return p != null && Number.isFinite(Number(p)) ? Number(p) : null;
  };

  return (
    <div className="terminal-panel symbols-quotes-panel">
      <h3 className="terminal-panel-title">Symbols &amp; Quotes</h3>
      <div className="symbols-quotes-panel__header">
        <span className="symbols-quotes-panel__col--sym">Symbol</span>
        <span className="symbols-quotes-panel__col">Bid</span>
        <span className="symbols-quotes-panel__col">Ask</span>
      </div>
      <div className="quotes-list">
        {symbols.map((s) => {
          const value = s.value;
          const mid = getMid(value);
          const symbolKey = toInternal(value);
          const tick = ticks?.[symbolKey];
          const spread = getSpread(symbolKey, tick);
          const { bid, ask } = getBidAsk(mid, spread);
          const isSelected = selectedSymbol === value;

          return (
            <button
              type="button"
              key={value}
              className={`quotes-row ${isSelected ? 'quotes-row--selected' : ''}`}
              onClick={() => onSelectSymbol(value)}
            >
              <span className="quotes-symbol">{value.replace('/', '')}</span>
              <span className="quotes-bid">{formatPrice(value, bid)}</span>
              <span className="quotes-ask">{formatPrice(value, ask)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
