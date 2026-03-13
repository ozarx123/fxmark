import React, { useState, useRef, useEffect, memo } from 'react';
import { useMarketDataContext } from '../../context/MarketDataContext';

const toKey = (s) => String(s || '').replace(/\//g, '').toUpperCase();

const DEFAULT_SYMBOLS = [
  { value: 'XAU/USD', label: 'XAU/USD' },
  { value: 'EUR/USD', label: 'EUR/USD' },
  { value: 'GBP/USD', label: 'GBP/USD' },
  { value: 'USD/JPY', label: 'USD/JPY' },
  { value: 'USD/CHF', label: 'USD/CHF' },
  { value: 'AUD/USD', label: 'AUD/USD' },
];

const DEFAULT_SPREAD = {
  'XAUUSD': 0.3,
  'EURUSD': 0.0001,
  'GBPUSD': 0.0001,
  'USDJPY': 0.01,
  'USDCHF': 0.0001,
  'AUDUSD': 0.0001,
};

function getSpread(symbolKey, tick) {
  if (tick?.spread != null && Number.isFinite(tick.spread)) return tick.spread;
  return DEFAULT_SPREAD[symbolKey] ?? 0.0001;
}

function getBidAsk(tick, spread) {
  const mid = tick?.close ?? tick?.price ?? null;
  if (mid == null) return { bid: null, ask: null };
  const half = spread / 2;
  return { bid: mid - half, ask: mid + half };
}

const WatchlistRow = memo(function WatchlistRow({
  symbol,
  label,
  selected,
  tick,
  isFavorite,
  onSelect,
  onToggleFavorite,
}) {
  const symbolKey = toKey(symbol);
  const prevPriceRef = useRef(null);
  const [trend, setTrend] = useState(0); // -1 down, 0 flat, 1 up

  const price = tick?.close ?? tick?.price ?? null;
  useEffect(() => {
    if (price != null && prevPriceRef.current != null) {
      setTrend(price > prevPriceRef.current ? 1 : price < prevPriceRef.current ? -1 : 0);
    }
    if (price != null) prevPriceRef.current = price;
  }, [price]);

  const spread = getSpread(symbolKey, tick);
  const { bid, ask } = getBidAsk(tick, spread);
  const isGold = symbolKey.includes('XAU');
  const prec = isGold ? 2 : 4;
  const fmt = (v) => (v != null ? Number(v).toFixed(prec) : '—');
  const volatility = tick?.volatility ?? 'medium'; // placeholder

  return (
    <div
      role="button"
      tabIndex={0}
      className={`smart-watchlist__row ${selected ? 'smart-watchlist__row--active' : ''}`}
      onClick={() => onSelect?.(symbol)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect?.(symbol)}
    >
      <button
        type="button"
        className={`smart-watchlist__fav ${isFavorite ? 'smart-watchlist__fav--on' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(symbol); }}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        {isFavorite ? '★' : '☆'}
      </button>
      <div className="smart-watchlist__symbol">{label}</div>
      <div className="smart-watchlist__prices">
        <span className="smart-watchlist__bid">{fmt(bid)}</span>
        <span className="smart-watchlist__ask">{fmt(ask)}</span>
      </div>
      <span className="smart-watchlist__spread" title="Spread">{fmt(spread)}</span>
      <span className={`smart-watchlist__vol smart-watchlist__vol--${volatility}`}>{volatility}</span>
      <span className={`smart-watchlist__trend smart-watchlist__trend--${trend === 1 ? 'up' : trend === -1 ? 'down' : 'flat'}`}>
        {trend === 1 ? '▲' : trend === -1 ? '▼' : '−'}
      </span>
    </div>
  );
});

const FAVORITES_KEY = 'fxmark_watchlist_favorites';

export default function SmartWatchlist({
  symbols = DEFAULT_SYMBOLS,
  selectedSymbol,
  onSelectSymbol,
  className = '',
}) {
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const { ticks } = useMarketDataContext();

  const toggleFavorite = (symbol) => {
    setFavorites((prev) => {
      const next = prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  };

  const filtered = symbols.filter(
    (s) => !search || (s.label || s.value).toLowerCase().includes(search.toLowerCase())
  );
  const favList = symbols.filter((s) => favorites.includes(s.value));

  return (
    <div className={`smart-watchlist ${className}`}>
      <div className="smart-watchlist__search">
        <input
          type="text"
          placeholder="Search symbol"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="smart-watchlist__input"
        />
      </div>
      <div className="smart-watchlist__section">
        <div className="smart-watchlist__section-title">Favorites</div>
        <div className="smart-watchlist__rows">
          {(favList.length ? favList : symbols.slice(0, 3)).map((s) => (
            <WatchlistRow
              key={s.value}
              symbol={s.value}
              label={s.label || s.value}
              selected={selectedSymbol === s.value}
              tick={ticks[toKey(s.value)]}
              isFavorite={favorites.includes(s.value)}
              onSelect={onSelectSymbol}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
      </div>
      <div className="smart-watchlist__section">
        <div className="smart-watchlist__section-title">Markets</div>
        <div className="smart-watchlist__rows">
          {filtered.map((s) => (
            <WatchlistRow
              key={s.value}
              symbol={s.value}
              label={s.label || s.value}
              selected={selectedSymbol === s.value}
              tick={ticks[toKey(s.value)]}
              isFavorite={favorites.includes(s.value)}
              onSelect={onSelectSymbol}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
