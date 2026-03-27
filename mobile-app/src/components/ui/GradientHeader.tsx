import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useAppTheme } from '@/hooks/useAppTheme';

type GradientHeaderProps = PropsWithChildren<{
  title: string;
  subtitle: string;
}>;

export function GradientHeader({ title, subtitle, children }: GradientHeaderProps) {
  const { theme } = useAppTheme();

  return (
    <LinearGradient colors={[theme.gradientStart, theme.gradientEnd]} style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {children ? <View style={styles.content}>{children}</View> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 18,
    gap: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700'
  },
  subtitle: {
    color: '#E0E7FF',
    fontSize: 13
  },
  content: {
    marginTop: 8
  }
});
