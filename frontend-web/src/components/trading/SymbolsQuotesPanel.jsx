import React from 'react';

const toInternal = (s) => String(s || '').replace(/\//g, '').toUpperCase();

function formatPrice(symbol, price) {
  if (price == null || !Number.isFinite(price)) return '—';
  return symbol?.includes('XAU') ? price.toFixed(2) : price.toFixed(4);
}

export default function SymbolsQuotesPanel({ symbols, prices, fallbackPrices, selectedSymbol, onSelectSymbol }) {
  const getPrice = (sym) => prices[toInternal(sym)] ?? fallbackPrices[sym] ?? fallbackPrices[toInternal(sym)] ?? null;

  return (
    <div className="terminal-panel symbols-quotes-panel">
      <h3 className="terminal-panel-title">Symbols &amp; Quotes</h3>
      <div className="quotes-list">
        {symbols.map((s) => {
          const value = s.value;
          const price = getPrice(value);
          const isSelected = selectedSymbol === value;
          return (
            <button
              type="button"
              key={value}
              className={`quotes-row ${isSelected ? 'quotes-row--selected' : ''}`}
              onClick={() => onSelectSymbol(value)}
            >
              <span className="quotes-symbol">{value}</span>
              <span className="quotes-price">{formatPrice(value, price)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
