import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '@/app/providers/AppProviders';
import { RootNavigator } from '@/navigation/RootNavigator';

export default function App() {
  return (
    <AppProviders>
      <StatusBar style="light" />
      <RootNavigator />
    </AppProviders>
  );
}
