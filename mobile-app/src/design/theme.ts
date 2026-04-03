export type AppTheme = {
  background: string;
  surface: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  success: string;
  danger: string;
  gradientStart: string;
  gradientEnd: string;
};

export const lightTheme: AppTheme = {
  background: '#F4F6FC',
  surface: '#FFFFFF',
  card: '#EEF2FF',
  text: '#111827',
  muted: '#6B7280',
  border: '#E5E7EB',
  primary: '#4F46E5',
  success: '#059669',
  danger: '#DC2626',
  gradientStart: '#4F46E5',
  gradientEnd: '#0EA5E9'
};

export const darkTheme: AppTheme = {
  background: '#070B16',
  surface: '#101827',
  card: '#172033',
  text: '#F9FAFB',
  muted: '#9CA3AF',
  border: '#243247',
  primary: '#8B5CF6',
  success: '#34D399',
  danger: '#F87171',
  gradientStart: '#8B5CF6',
  gradientEnd: '#0EA5E9'
};
