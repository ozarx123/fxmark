import React, { useState, useCallback, useEffect } from 'react';

const LOT_STEP = 0.01;
const MIN_LOT = 0.01;
const MAX_LOT = 100;

export default function OrderBottomSheet({
  open,
  onClose,
  side,
  symbol,
  marketPrice,
  equity,
  initialVolume = '0.01',
  onPlaceOrder,
  onError,
}) {
  const [volume, setVolume] = useState(initialVolume);
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [riskPct, setRiskPct] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setVolume(initialVolume);
  }, [open, initialVolume]);

  const volNum = parseFloat(volume) || MIN_LOT;
  const inc = useCallback(() => {
    setVolume((v) => {
      const current = parseFloat(v);
      const base = Number.isFinite(current) ? current : MIN_LOT;
      return String(Math.min(MAX_LOT, Math.round((base + LOT_STEP) * 100) / 100));
    });
  }, []);
  const dec = useCallback(() => {
    setVolume((v) => {
      const current = parseFloat(v);
      const base = Number.isFinite(current) ? current : MIN_LOT;
      return String(Math.max(MIN_LOT, Math.round((base - LOT_STEP) * 100) / 100));
    });
  }, []);

  const handleConfirm = async () => {
    if (loading) return;
    if (!marketPrice || !Number.isFinite(Number(marketPrice))) {
      onError?.('Market price not available');
      return;
    }
    const vol = parseFloat(volume);
    if (!Number.isFinite(vol) || vol <= 0) {
      onError?.('Invalid volume');
      return;
    }
    setLoading(true);
    onError?.(null);
    try {
      await onPlaceOrder({
        side: side === 'buy' ? 'buy' : 'sell',
        volume: vol,
        stopLoss: sl.trim() ? parseFloat(sl) : undefined,
        takeProfit: tp.trim() ? parseFloat(tp) : undefined,
      });
      onClose();
    } catch (e) {
      onError?.(e?.message ?? 'Order failed');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const isGold = symbol?.includes('XAU');
  const priceFmt = (p) => (p != null && Number.isFinite(p) ? Number(p).toFixed(isGold ? 2 : 4) : '—');

  return (
    <>
      <div className="order-bottom-sheet__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="order-bottom-sheet" role="dialog" aria-modal="true" aria-label="Order form">
        <div className="order-bottom-sheet__handle" />
        <div className="order-bottom-sheet__header">
          <h3 className="order-bottom-sheet__title">
            {side === 'buy' ? 'Buy' : 'Sell'} {symbol}
          </h3>
          <span className="order-bottom-sheet__price">{priceFmt(marketPrice)}</span>
        </div>
        <div className="order-bottom-sheet__body">
          <div className="order-bottom-sheet__field">
            <label>Lot</label>
            <div className="order-bottom-sheet__lot-row">
              <button type="button" className="order-bottom-sheet__lot-btn" onClick={dec} disabled={volNum <= MIN_LOT}>−</button>
              <input
                type="number"
                min={MIN_LOT}
                max={MAX_LOT}
                step={LOT_STEP}
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="order-bottom-sheet__input"
              />
              <button type="button" className="order-bottom-sheet__lot-btn" onClick={inc} disabled={volNum >= MAX_LOT}>+</button>
            </div>
          </div>
          <div className="order-bottom-sheet__field">
            <label>SL (optional)</label>
            <input
              type="number"
              step={isGold ? 0.01 : 0.0001}
              placeholder="Stop loss"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              className="order-bottom-sheet__input"
            />
          </div>
          <div className="order-bottom-sheet__field">
            <label>TP (optional)</label>
            <input
              type="number"
              step={isGold ? 0.01 : 0.0001}
              placeholder="Take profit"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              className="order-bottom-sheet__input"
            />
          </div>
          <div className="order-bottom-sheet__field">
            <label>Risk % (optional)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              placeholder="e.g. 2"
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
              className="order-bottom-sheet__input"
            />
          </div>
          <button
            type="button"
            className={`order-bottom-sheet__submit order-bottom-sheet__submit--${side}`}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? '…' : `Confirm ${side === 'buy' ? 'Buy' : 'Sell'}`}
          </button>
        </div>
      </div>
    </>
  );
}
