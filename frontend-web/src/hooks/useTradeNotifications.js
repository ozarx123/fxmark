import { useEffect, useState } from 'react';
import { useTradeSnapshot } from '../context/MarketDataContext.jsx';
import { useTradingSocket } from '../services/tradingSocket.jsx';

// Returns latest trade notification { message, kind } for the UI to render.
export function useTradeNotifications() {
  const snapshot = useTradeSnapshot();
  const { riskEvents } = useTradingSocket();
  const [notification, setNotification] = useState(null);

  // Order executions: when tradeSnapshot changes, detect newly filled orders vs previous state
  useEffect(() => {
    if (!snapshot || !Array.isArray(snapshot.orders)) return;
    const filled = snapshot.orders.filter((o) => o.status === 'filled' && o.volume === o.filledVolume);
    if (!filled.length) return;
    const last = filled[0];
    const msg = `OPEN • Order filled: ${last.symbol} ${last.side} ${last.volume} lots`;
    setNotification({ message: msg, kind: 'success' });
  }, [snapshot?.at]); // run when snapshot timestamp changes

  // Risk / TP-SL events: use riskEvents stream
  useEffect(() => {
    if (!riskEvents || !riskEvents.length) return;
    const last = riskEvents[riskEvents.length - 1];
    if (last.type === 'position_closed') {
      const { symbol, side, volume, closePrice, reason } = last;
      const readableReason = reason === 'tp_sl' ? 'TP/SL' : reason || 'closed';
      const msg = `CLOSED • Position ${readableReason}: ${symbol} ${side} ${volume} lots @ ${closePrice ?? 'market'}`;
      setNotification({ message: msg, kind: 'warning' });
    }
  }, [riskEvents]);

  return notification;
}

