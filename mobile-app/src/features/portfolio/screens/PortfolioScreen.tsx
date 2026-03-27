import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { GradientHeader } from '@/components/ui/GradientHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { useAppTheme } from '@/hooks/useAppTheme';

export function PortfolioScreen() {
  const { theme } = useAppTheme();

  return (
    <Screen>
      <GradientHeader title="Portfolio" subtitle="Performance and capital allocation">
        <View style={styles.metricsRow}>
          <MetricCard label="Equity" value="$152,481.24" />
          <MetricCard label="PnL (24h)" value="+$2,104.92" tone="positive" />
        </View>
      </GradientHeader>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <Text style={[styles.heading, { color: theme.text }]}>Allocation</Text>
        <View style={styles.allocRow}>
          <Text style={[styles.allocLabel, { color: theme.muted }]}>Forex Majors</Text>
          <Text style={[styles.allocValue, { color: theme.text }]}>58%</Text>
        </View>
        <View style={styles.allocRow}>
          <Text style={[styles.allocLabel, { color: theme.muted }]}>Commodities</Text>
          <Text style={[styles.allocValue, { color: theme.text }]}>27%</Text>
        </View>
        <View style={styles.allocRow}>
          <Text style={[styles.allocLabel, { color: theme.muted }]}>Cash</Text>
          <Text style={[styles.allocValue, { color: theme.text }]}>15%</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    gap: 10
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10
  },
  heading: {
    fontSize: 16,
    fontWeight: '700'
  },
  allocRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  allocLabel: {
    fontSize: 14
  },
  allocValue: {
    fontSize: 14,
    fontWeight: '600'
  }
});
