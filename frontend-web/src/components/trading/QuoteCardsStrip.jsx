import React, { useMemo } from 'react';

const toInternal = (s) => String(s || '').replace(/\//g, '').toUpperCase();

function formatPrice(symbol, price) {
  if (price == null || !Number.isFinite(price)) return '—';
  return symbol?.includes('XAU') ? price.toFixed(2) : price.toFixed(4);
}

/** Mini sparkline points (simulated from symbol seed + time bucket) */
function useSparkline(symbols) {
  return useMemo(() => {
    const out = {};
    const t = Math.floor(Date.now() / 60000);
    symbols.forEach((s, i) => {
      const pts = [];
      let y = 50;
      for (let x = 0; x < 12; x++) {
        y = Math.max(10, Math.min(90, y + (Math.sin((t + i * 7 + x) * 0.5) * 15)));
        pts.push(y);
      }
      out[s.value] = pts;
    });
    return out;
  }, [symbols]);
}

export default function QuoteCardsStrip({ symbols, prices, fallbackPrices, selectedSymbol, onSelectSymbol }) {
  const getPrice = (sym) => prices[toInternal(sym)] ?? fallbackPrices[sym] ?? fallbackPrices[toInternal(sym)] ?? null;
  const sparklines = useSparkline(symbols);

  return (
    <div className="quote-cards-strip">
      {symbols.slice(0, 8).map((s) => {
        const value = s.value;
        const price = getPrice(value);
        const isSelected = selectedSymbol === value;
        const points = sparklines[value] || [];
        const pathD = points.length
          ? points.map((y, i) => `${i === 0 ? 'M' : 'L'} ${(i / Math.max(1, points.length - 1)) * 100} ${100 - y}`).join(' ')
          : '';
        return (
          <button
            type="button"
            key={value}
            className={`quote-card ${isSelected ? 'quote-card--selected' : ''}`}
            onClick={() => onSelectSymbol(value)}
          >
            <span className="quote-card-symbol">{value.replace('/', '/')}</span>
            <span className="quote-card-price">{formatPrice(value, price)}</span>
            <svg className="quote-card-sparkline" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d={pathD} fill="none" stroke="currentColor" strokeWidth="8" vectorEffect="non-scaling-stroke" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
