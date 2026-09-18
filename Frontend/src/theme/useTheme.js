import { useSyncExternalStore } from 'react';
import { getThemeSnapshot, subscribeTheme } from './themeStore.js';

export default function useTheme() {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeSnapshot);
}
