import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'FXMark',
  slug: 'fxmark-mobile-app',
  scheme: 'fxmark',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  jsEngine: 'hermes',
  runtimeVersion: {
    policy: 'appVersion'
  },
  updates: {
    fallbackToCacheTimeout: 0
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    bundleIdentifier: 'com.fxmark.mobile'
  },
  android: {
    package: 'com.fxmark.mobile'
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.fxmarkglobal.com'
  }
});
