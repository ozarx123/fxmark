import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/services/api/client';
import { MarketTicker } from '@/services/api/types';

const fallbackTickers: MarketTicker[] = [
  { symbol: 'EURUSD', name: 'Euro / US Dollar', price: 1.0842, changePct24h: 0.31 },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', price: 1.2721, changePct24h: -0.12 },
  { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', price: 151.44, changePct24h: 0.44 },
  { symbol: 'XAUUSD', name: 'Gold / US Dollar', price: 2188.22, changePct24h: 0.73 }
];

export function useMarketsQuery() {
  return useQuery({
    queryKey: ['markets', 'tickers'],
    queryFn: async () => {
      try {
        const response = await apiClient.get<MarketTicker[]>('/v1/markets/tickers');
        if (!Array.isArray(response.data) || response.data.length === 0) {
          return fallbackTickers;
        }
        return response.data;
      } catch {
        return fallbackTickers;
      }
    }
  });
}
