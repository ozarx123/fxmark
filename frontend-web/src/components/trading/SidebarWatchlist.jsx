import React, { useState } from 'react';

const DEFAULT_SYMBOLS = [
  { value: 'XAU/USD', label: 'XAU/USD' },
  { value: 'EUR/USD', label: 'EUR/USD' },
  { value: 'GBP/USD', label: 'GBP/USD' },
  { value: 'USD/JPY', label: 'USD/JPY' },
  { value: 'USD/CHF', label: 'USD/CHF' },
  { value: 'AUD/USD', label: 'AUD/USD' },
];

export default function SidebarWatchlist({
  symbols = DEFAULT_SYMBOLS,
  selectedSymbol,
  onSelectSymbol,
  favorites = [],
  onToggleFavorite,
  className = '',
}) {
  const [search, setSearch] = useState('');

  const filtered = symbols.filter(
    (s) => !search || s.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={`terminal-sidebar-watchlist ${className}`}>
      <div className="terminal-sidebar-watchlist__search">
        <input
          type="text"
          placeholder="Search symbol"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="terminal-sidebar-watchlist__input"
        />
      </div>
      <div className="terminal-sidebar-watchlist__favorites">
        <span className="terminal-sidebar-watchlist__title">Favorites</span>
        <ul className="terminal-sidebar-watchlist__list">
          {(favorites.length ? favorites : symbols.slice(0, 3)).map((s) => {
            const val = typeof s === 'string' ? s : s.value;
            const label = typeof s === 'string' ? s : s.label;
            const isActive = selectedSymbol === val;
            return (
              <li key={val}>
                <button
                  type="button"
                  className={`terminal-sidebar-watchlist__item ${isActive ? 'terminal-sidebar-watchlist__item--active' : ''}`}
                  onClick={() => onSelectSymbol?.(val)}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="terminal-sidebar-watchlist__all">
        <span className="terminal-sidebar-watchlist__title">Markets</span>
        <ul className="terminal-sidebar-watchlist__list">
          {filtered.map((s) => {
            const val = s.value;
            const label = s.label;
            const isActive = selectedSymbol === val;
            return (
              <li key={val}>
                <button
                  type="button"
                  className={`terminal-sidebar-watchlist__item ${isActive ? 'terminal-sidebar-watchlist__item--active' : ''}`}
                  onClick={() => onSelectSymbol?.(val)}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="terminal-sidebar-watchlist__alerts">
        <span className="terminal-sidebar-watchlist__title">Alerts</span>
        <p className="terminal-sidebar-watchlist__muted">Coming soon</p>
      </div>
    </div>
  );
}
