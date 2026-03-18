import React, { useState, useMemo } from 'react';
import * as tradingApi from '../../api/tradingApi';
import { getContractSize, getPipDistance, volumeFromRiskPct } from '../../lib/positionPnL';

const ORDER_TYPES = [
  { id: 'MARKET_BUY', label: 'Market Buy', side: 'buy', market: true },
  { id: 'MARKET_SELL', label: 'Market Sell', side: 'sell', market: true },
  { id: 'BUY_LIMIT', label: 'Buy Limit', side: 'buy', market: false },
  { id: 'SELL_LIMIT', label: 'Sell Limit', side: 'sell', market: false },
  { id: 'BUY_STOP', label: 'Buy Stop', side: 'buy', market: false },
  { id: 'SELL_STOP', label: 'Sell Stop', side: 'sell', market: false },
];

const DEFAULT_LEVERAGE = 100;

export default function TradeControlPanel({
  symbol,
  symbols = [],
  accountId,
  accountNumber,
  marketPrice,
  equity,
  volume: volumeProp,
  onVolumeChange,
  onOrderPlaced,
  onOrderSuccess,
  onError,
  hideMarketButtons = false,
  className = '',
}) {
  const [orderType, setOrderType] = useState('MARKET_BUY');
  const [internalVolume, setInternalVolume] = useState('0.01');
  const volume = volumeProp !== undefined ? volumeProp : internalVolume;
  const setVolume = onVolumeChange ?? setInternalVolume;
  const [riskPct, setRiskPct] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [oneClick, setOneClick] = useState(false);

  const selected = ORDER_TYPES.find((t) => t.id === orderType) || ORDER_TYPES[0];
  const isMarket = selected.market === true;
  const isGold = symbol?.includes('XAU');
  const priceStep = isGold ? 0.01 : 0.0001;

  const execPrice = isMarket ? (marketPrice ?? 0) : (parseFloat(price) || 0);
  const volNum = parseFloat(volume) || 0;
  const slNum = sl !== '' ? parseFloat(sl) : null;
  const tpNum = tp !== '' ? parseFloat(tp) : null;
  const contractSize = getContractSize(symbol);
  const notional = execPrice && volNum ? volNum * contractSize * execPrice : 0;
  const marginEst = notional / DEFAULT_LEVERAGE;
  const maxLossSl = slNum != null && Number.isFinite(slNum) && execPrice
    ? (selected.side === 'buy'
        ? (slNum - execPrice) * volNum * contractSize
        : (execPrice - slNum) * volNum * contractSize)
    : null;
  const maxProfitTp = tpNum != null && Number.isFinite(tpNum) && execPrice
    ? (selected.side === 'buy'
        ? (tpNum - execPrice) * volNum * contractSize
        : (execPrice - tpNum) * volNum * contractSize)
    : null;
  const riskReward = maxLossSl != null && maxProfitTp != null && maxLossSl !== 0
    ? (maxProfitTp / Math.abs(maxLossSl)).toFixed(2)
    : null;

  const eq = equity != null && Number.isFinite(Number(equity)) ? Number(equity) : 0;
  const riskPctNum = riskPct !== '' ? parseFloat(riskPct) : null;
  const suggestedLotFromRisk =
    eq > 0 && riskPctNum != null && riskPctNum > 0 && slNum != null && Number.isFinite(slNum) && execPrice > 0
      ? volumeFromRiskPct(eq, riskPctNum, execPrice, slNum, symbol, selected.side)
      : null;

  const pipDistSl = slNum != null && Number.isFinite(slNum) && execPrice > 0
    ? getPipDistance(execPrice, slNum, symbol)
    : null;
  const pipDistTp = tpNum != null && Number.isFinite(tpNum) && execPrice > 0
    ? getPipDistance(execPrice, tpNum, symbol)
    : null;

  const preview = useMemo(() => ({
    marginRequired: marginEst,
    estimatedMaxLoss: maxLossSl,
    estimatedProfit: maxProfitTp,
    riskReward: riskReward != null ? Number(riskReward) : null,
    notional,
    pipDistSl,
    pipDistTp,
    suggestedLotFromRisk,
  }), [marginEst, maxLossSl, maxProfitTp, riskReward, notional, pipDistSl, pipDistTp, suggestedLotFromRisk]);

  const handlePlaceOrder = async (sideFromTicket) => {
    const side = selected.side || sideFromTicket || 'buy';
    const vol = parseFloat(volume);
    if (!symbol || !Number.isFinite(vol) || vol <= 0) {
      onError?.('Invalid symbol or volume');
      return;
    }
    if (!isMarket && (!Number.isFinite(parseFloat(price)) || parseFloat(price) <= 0)) {
      onError?.('Price required for limit and stop orders');
      return;
    }
    if (isMarket && (!marketPrice || !Number.isFinite(Number(marketPrice)) || Number(marketPrice) <= 0)) {
      onError?.('Market price not available. Wait for the price feed to load.');
      return;
    }

    // Normal mode: ask for confirmation before executing.
    if (!oneClick) {
      const confirmMsg = `${isMarket ? 'Market' : 'Pending'} ${side.toUpperCase()} ${vol.toFixed(2)} ${symbol}. Place order?`;
      // eslint-disable-next-line no-alert
      const ok = window.confirm(confirmMsg);
      if (!ok) return;
    }
    setLoading(true);
    onError?.(null);
    try {
      await tradingApi.placeOrder({
        symbol: symbol.replace(/\//g, ''),
        side,
        type: selected.id,
        marketOrder: isMarket,
        lots: vol,
        volume: vol,
        price: isMarket ? marketPrice : parseFloat(price),
        stopLoss: slNum ?? undefined,
        takeProfit: tpNum ?? undefined,
      }, { accountId, accountNumber });
      setSuccess(true);
      onOrderPlaced?.();
      onOrderSuccess?.(`Order filled: ${side.toUpperCase()} ${vol.toFixed(2)} ${symbol}`);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      onError?.(err.message || 'Order failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`trade-control-panel ${className}`}>
      <div className="trade-control-panel__section">
        <label className="trade-control-panel__label">Order type</label>
        <select
          value={orderType}
          onChange={(e) => setOrderType(e.target.value)}
          className="trade-control-panel__select"
        >
          {ORDER_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="trade-control-panel__section">
        <label className="trade-control-panel__label">Symbol</label>
        {symbols?.length > 0 ? (
          <select value={symbol ?? ''} readOnly className="trade-control-panel__select" aria-readonly>
            {symbols.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        ) : (
          <span className="trade-control-panel__symbol-value">{symbol || '—'}</span>
        )}
      </div>
      <div className="trade-control-panel__section">
        <label className="trade-control-panel__label">Volume (lots)</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          className="trade-control-panel__input"
        />
        <div className="trade-control-panel__presets">
          {[0.01, 0.1, 1].map((v) => (
            <button
              key={v}
              type="button"
              className="trade-control-panel__preset-btn"
              onClick={() => setVolume(String(v))}
            >
              {v.toFixed(2)}
            </button>
          ))}
        </div>
        {preview.suggestedLotFromRisk != null && (
          <button
            type="button"
            className="trade-control-panel__preset-btn trade-control-panel__preset-btn--risk"
            onClick={() => setVolume(preview.suggestedLotFromRisk.toFixed(2))}
            title={`Use lot from ${riskPct}% risk`}
          >
            Use {riskPct}% risk
          </button>
        )}
      </div>
      {eq > 0 && (
        <div className="trade-control-panel__section">
          <label className="trade-control-panel__label">Risk % (of equity)</label>
          <input
            type="number"
            min="0.1"
            max="100"
            step="0.5"
            value={riskPct}
            onChange={(e) => setRiskPct(e.target.value)}
            placeholder="e.g. 1"
            className="trade-control-panel__input"
          />
        </div>
      )}
      <div className="trade-control-panel__section">
        <label className="trade-control-panel__label">Stop loss</label>
        <input
          type="number"
          step={priceStep}
          value={sl}
          onChange={(e) => setSl(e.target.value)}
          placeholder="Optional"
          className="trade-control-panel__input"
        />
        {preview.pipDistSl != null && (
          <span className="trade-control-panel__pip">{preview.pipDistSl.toFixed(1)} pips</span>
        )}
      </div>
      <div className="trade-control-panel__section">
        <label className="trade-control-panel__label">Take profit</label>
        <input
          type="number"
          step={priceStep}
          value={tp}
          onChange={(e) => setTp(e.target.value)}
          placeholder="Optional"
          className="trade-control-panel__input"
        />
        {execPrice > 0 && (
          <div className="trade-control-panel__presets">
            {[0.5, 1, 2].map((pct) => (
              <button
                key={pct}
                type="button"
                className="trade-control-panel__preset-btn"
                onClick={() => {
                  const factor = pct / 100;
                  const tpPrice = selected.side === 'buy'
                    ? execPrice * (1 + factor)
                    : execPrice * (1 - factor);
                  setTp(tpPrice.toFixed(isGold ? 2 : 4));
                }}
              >
                +{pct}%
              </button>
            ))}
          </div>
        )}
        {preview.pipDistTp != null && (
          <span className="trade-control-panel__pip">{preview.pipDistTp.toFixed(1)} pips</span>
        )}
      </div>

      {!isMarket && (
        <div className="trade-control-panel__section">
          <label className="trade-control-panel__label">Price</label>
          <input
            type="number"
            step={priceStep}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={marketPrice != null ? String(marketPrice) : '—'}
            className="trade-control-panel__input"
          />
        </div>
      )}

      <div className="trade-control-panel__preview">
        <div className="trade-control-panel__preview-row">
          <span className="trade-control-panel__preview-label">Margin (est.)</span>
          <span className="trade-control-panel__preview-value">
            {preview.marginRequired > 0 ? `$${preview.marginRequired.toFixed(2)}` : '—'}
          </span>
        </div>
        <div className="trade-control-panel__preview-row">
          <span className="trade-control-panel__preview-label">Notional</span>
          <span className="trade-control-panel__preview-value">
            {preview.notional > 0 ? `$${preview.notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
          </span>
        </div>
        {preview.estimatedMaxLoss != null && (
          <div className="trade-control-panel__preview-row">
            <span className="trade-control-panel__preview-label">Max loss (SL)</span>
            <span className={`trade-control-panel__preview-value ${preview.estimatedMaxLoss <= 0 ? 'trade-control-panel__preview-value--loss' : ''}`}>
              {preview.estimatedMaxLoss.toFixed(2)}
            </span>
          </div>
        )}
        {preview.estimatedProfit != null && (
          <div className="trade-control-panel__preview-row">
            <span className="trade-control-panel__preview-label">Est. profit (TP)</span>
            <span className={`trade-control-panel__preview-value ${preview.estimatedProfit >= 0 ? 'trade-control-panel__preview-value--profit' : ''}`}>
              {preview.estimatedProfit >= 0 ? '+' : ''}{preview.estimatedProfit.toFixed(2)}
            </span>
          </div>
        )}
        {preview.riskReward != null && (
          <div className="trade-control-panel__preview-row">
            <span className="trade-control-panel__preview-label">R:R</span>
            <span className="trade-control-panel__preview-value">{preview.riskReward}</span>
          </div>
        )}
        <div className="trade-control-panel__preview-row">
          <span className="trade-control-panel__preview-label">Spread</span>
          <span className="trade-control-panel__preview-value">—</span>
        </div>
      </div>

      <div className="trade-control-panel__trailing">
        <span className="trade-control-panel__label">Trailing stop</span>
        <p className="trade-control-panel__muted">Coming soon</p>
      </div>

      <div className="trade-control-panel__section trade-control-panel__oneclick-row">
        <span className="trade-control-panel__label">One-click trading</span>
        <button
          type="button"
          className={`trade-control-panel__oneclick-toggle ${oneClick ? 'trade-control-panel__oneclick-toggle--on' : ''}`}
          onClick={() => setOneClick((v) => !v)}
        >
          {oneClick ? 'ON' : 'OFF'}
        </button>
      </div>

      {!hideMarketButtons && (
        <div className="trade-control-panel__buttons">
          <button
            type="button"
            disabled={loading}
            className="trade-control-panel__btn trade-control-panel__btn--buy"
            onClick={() => handlePlaceOrder('buy')}
          >
            {loading ? '…' : 'Buy'}
          </button>
          <button
            type="button"
            disabled={loading}
            className="trade-control-panel__btn trade-control-panel__btn--sell"
            onClick={() => handlePlaceOrder('sell')}
          >
            {loading ? '…' : 'Sell'}
          </button>
        </div>
      )}
      {success && <p className="trade-control-panel__success">Order placed</p>}
    </div>
  );
}
