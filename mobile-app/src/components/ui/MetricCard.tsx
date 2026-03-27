import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/hooks/useAppTheme';

type MetricCardProps = {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
};

export function MetricCard({ label, value, tone = 'neutral' }: MetricCardProps) {
  const { theme } = useAppTheme();

  const toneColor =
    tone === 'positive' ? theme.success : tone === 'negative' ? theme.danger : theme.text;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: toneColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    flex: 1
  },
  label: {
    fontSize: 12,
    fontWeight: '500'
  },
  value: {
    fontSize: 18,
    fontWeight: '700'
  }
});
