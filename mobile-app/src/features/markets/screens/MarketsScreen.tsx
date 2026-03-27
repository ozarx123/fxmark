import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { GradientHeader } from '@/components/ui/GradientHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { PriceChip } from '@/components/ui/PriceChip';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useMarketsQuery } from '@/features/markets/api/useMarketsQuery';

export function MarketsScreen() {
  const { theme } = useAppTheme();
  const { data, isFetching } = useMarketsQuery();

  const gainers = data?.filter((item) => item.changePct24h > 0).length ?? 0;

  return (
    <Screen scrollable>
      <GradientHeader title="Markets" subtitle="Live overview of top FX instruments">
        <View style={styles.metricsRow}>
          <MetricCard label="Instruments" value={String(data?.length ?? 0)} />
          <MetricCard label="Gainers" value={String(gainers)} tone="positive" />
        </View>
      </GradientHeader>

      <View style={{ gap: 10 }}>
        {(data ?? []).map((ticker) => (
          <View
            key={ticker.symbol}
            style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <View>
              <Text style={[styles.symbol, { color: theme.text }]}>{ticker.symbol}</Text>
              <Text style={[styles.name, { color: theme.muted }]}>{ticker.name}</Text>
            </View>
            <View style={styles.rightColumn}>
              <Text style={[styles.price, { color: theme.text }]}>{ticker.price.toFixed(4)}</Text>
              <PriceChip label="24h" changePct={ticker.changePct24h} />
            </View>
          </View>
        ))}
      </View>

      {isFetching ? <ActivityIndicator color={theme.primary} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    gap: 10
  },
  row: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  symbol: {
    fontSize: 16,
    fontWeight: '700'
  },
  name: {
    marginTop: 4,
    fontSize: 12
  },
  rightColumn: {
    alignItems: 'flex-end',
    gap: 8,
    minWidth: 100
  },
  price: {
    fontSize: 16,
    fontWeight: '700'
  }
});
