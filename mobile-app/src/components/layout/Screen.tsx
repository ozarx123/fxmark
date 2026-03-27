import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/hooks/useAppTheme';

type ScreenProps = PropsWithChildren<{
  scrollable?: boolean;
}>;

export function Screen({ children, scrollable = true }: ScreenProps) {
  const { theme } = useAppTheme();

  if (scrollable) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={[styles.container, styles.content, { backgroundColor: theme.background }]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12
  }
});
