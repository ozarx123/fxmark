import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/hooks/useAppTheme';

type PriceChipProps = {
  label: string;
  changePct: number;
};

export function PriceChip({ label, changePct }: PriceChipProps) {
  const { theme } = useAppTheme();
  const positive = changePct >= 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: positive ? `${theme.success}22` : `${theme.danger}22`,
          borderColor: positive ? `${theme.success}66` : `${theme.danger}66`
        }
      ]}
    >
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.change, { color: positive ? theme.success : theme.danger }]}>
        {positive ? '+' : ''}
        {changePct.toFixed(2)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  label: {
    fontSize: 13,
    fontWeight: '600'
  },
  change: {
    fontSize: 12,
    fontWeight: '700'
  }
});
