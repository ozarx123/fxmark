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

/**
 * chartLastClose — last candle close actually drawn on FxChart for the active symbol (merged REST+tick).
 * When set for the selected row, Bid/Mid/Ask use this as the center so the strip matches the chart and header price.
 * Feed-only mid stays available for comparison via title when it differs.
 */
export default function SymbolsQuotesPanel({
  symbols,
  prices: pricesProp,
  fallbackPrices,
  selectedSymbol,
  onSelectSymbol,
  chartLastClose = null,
}) {
  const { ticks } = useMarketDataContext();

  const getFeedMid = (sym) => {
    const key = toInternal(sym);
    const tick = ticks?.[key];
    const p = tick?.close ?? tick?.price ?? pricesProp?.[key] ?? fallbackPrices?.[sym] ?? fallbackPrices?.[key];
    return p != null && Number.isFinite(Number(p)) ? Number(p) : null;
  };

  return (
    <div className="terminal-panel symbols-quotes-panel">
      <h3 className="terminal-panel-title" title="Bid/Ask are synthetic around Mid (half-spread each side). Mid matches the chart for the selected symbol when the chart has loaded.">
        Symbols &amp; Quotes
      </h3>
      <div className="symbols-quotes-panel__header">
        <span className="symbols-quotes-panel__col--sym">Symbol</span>
        <span className="symbols-quotes-panel__col">Bid</span>
        <span className="symbols-quotes-panel__col">Mid</span>
        <span className="symbols-quotes-panel__col">Ask</span>
      </div>
      <div className="quotes-list">
        {symbols.map((s) => {
          const value = s.value;
          const feedMid = getFeedMid(value);
          const symbolKey = toInternal(value);
          const tick = ticks?.[symbolKey];
          const spread = getSpread(symbolKey, tick);
          const isSelected = selectedSymbol === value;
          const useChart =
            isSelected &&
            chartLastClose != null &&
            Number.isFinite(Number(chartLastClose));
          const referenceMid = useChart ? Number(chartLastClose) : feedMid;
          const { bid, ask } = getBidAsk(referenceMid, spread);
          const midDiffers =
            useChart &&
            feedMid != null &&
            referenceMid != null &&
            Math.abs(referenceMid - feedMid) >
              (String(value).includes('XAU') ? 0.01 : 0.00005);

          return (
            <button
              type="button"
              key={value}
              className={`quotes-row ${isSelected ? 'quotes-row--selected' : ''}`}
              onClick={() => onSelectSymbol(value)}
            >
              <span className="quotes-symbol">{value.replace('/', '')}</span>
              <span className="quotes-bid">{formatPrice(value, bid)}</span>
              <span
                className="quotes-mid"
                title={
                  midDiffers
                    ? `Chart last ${formatPrice(value, referenceMid)} vs live tick mid ${formatPrice(value, feedMid)} — candle merge can prefer REST OHLC when the feed disagrees.`
                    : 'Mid — reference for spread; matches chart last on selected symbol when loaded.'
                }
              >
                {formatPrice(value, referenceMid)}
              </span>
              <span className="quotes-ask">{formatPrice(value, ask)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
