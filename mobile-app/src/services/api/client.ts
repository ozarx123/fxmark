import Constants from 'expo-constants';
import axios from 'axios';

const baseURL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'https://api.fxmarkglobal.com';

export const apiClient = axios.create({
  baseURL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json'
  }
});
