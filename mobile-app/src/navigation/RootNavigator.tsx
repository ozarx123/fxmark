import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthScreen } from '@/features/auth/screens/AuthScreen';
import { MarketsScreen } from '@/features/markets/screens/MarketsScreen';
import { PortfolioScreen } from '@/features/portfolio/screens/PortfolioScreen';
import { useSessionStore } from '@/state/sessionStore';
import { useAppTheme } from '@/hooks/useAppTheme';

type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

type MainTabParamList = {
  Markets: undefined;
  Portfolio: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  const { theme } = useAppTheme();

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarIcon: ({ color, size }) => {
          const icon = route.name === 'Markets' ? 'trending-up' : 'wallet';
          return <Ionicons name={icon} size={size} color={color} />;
        }
      })}
    >
      <Tabs.Screen name="Markets" component={MarketsScreen} />
      <Tabs.Screen name="Portfolio" component={PortfolioScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const { theme } = useAppTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: theme.background }
      }}
    >
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
}
