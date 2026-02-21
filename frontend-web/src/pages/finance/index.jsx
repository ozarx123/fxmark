import React, { useState } from 'react';
import OrderConfirmModal from '../../components/OrderConfirmModal';
import OrderConfirmModalAdvanced from '../../components/OrderConfirmModalAdvanced';
import ActiveTradesModal from '../../components/ActiveTradesModal';
import HistoryModal from '../../components/HistoryModal';
import { useMarketData } from '../../hooks/useMarketData';

export default function Finance() {
  const [modal, setModal] = useState(null); // null | 'buy' | 'sell'
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [tradesModalOpen, setTradesModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('XAU/USD'); // Default to XAU for live tick (backend polls XAUUSD)
  const { candles, tick } = useMarketData(selectedSymbol, '1m');
  const marketPrice = tick?.close ?? tick?.price ?? (candles?.length ? candles[candles.length - 1]?.close : null);

  const handleOrderConfirm = (order) => {
    console.log('Order confirmed:', order);
    setModal(null);
  };

  const handleAdvancedOrderConfirm = (order) => {
    console.log('Advanced order confirmed:', order);
    setAdvancedModalOpen(false);
  };

  return (
    <div className="page finance-page">
      <header className="page-header">
        <h1>Finance</h1>
        <p className="page-subtitle">Statements and reports</p>
      </header>
      <section className="page-content">
        <div className="section-block">
          <h2>Quick trade</h2>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => setModal('buy')}>Buy</button>
            <button type="button" className="btn btn-secondary" onClick={() => setModal('sell')}>Sell</button>
            <button type="button" className="btn btn-secondary" onClick={() => setAdvancedModalOpen(true)}>Advanced</button>
            <button type="button" className="btn btn-secondary" onClick={() => setTradesModalOpen(true)}>Active trades</button>
            <button type="button" className="btn btn-secondary" onClick={() => setHistoryModalOpen(true)}>History</button>
          </div>
        </div>
        <div className="section-block">
          <h2>Statements</h2>
          <p className="muted">Daily and monthly statements (JSON); PDF export coming later.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Type</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={3} className="empty-cell">No statements generated yet</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="section-block">
          <h2>Reports</h2>
          <ul className="list-placeholder">
            <li>Daily report — placeholder</li>
            <li>Monthly report — placeholder</li>
          </ul>
        </div>
      </section>
      <OrderConfirmModal
        isOpen={!!modal}
        type={modal || 'buy'}
        symbol={selectedSymbol}
        marketPrice={marketPrice}
        onConfirm={(o) => { setSelectedSymbol(o.symbol); handleOrderConfirm(o); }}
        onClose={() => setModal(null)}
      />
      <OrderConfirmModalAdvanced
        isOpen={advancedModalOpen}
        type="advanced"
        symbol={selectedSymbol}
        marketPrice={marketPrice}
        onConfirm={(o) => { setSelectedSymbol(o.symbol); handleAdvancedOrderConfirm(o); }}
        onClose={() => setAdvancedModalOpen(false)}
      />
      <ActiveTradesModal
        isOpen={tradesModalOpen}
        onClose={() => setTradesModalOpen(false)}
        onClosePosition={(order) => console.log('Close position:', order)}
      />
      <HistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
      />
    </div>
  );
}
