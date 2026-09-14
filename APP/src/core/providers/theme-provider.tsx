import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type AppTheme } from '../../ui/theme/tokens';

type ThemeContextValue = {
  theme: AppTheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const scheme = useColorScheme();
  const value = useMemo<ThemeContextValue>(() => ({ theme: scheme === 'dark' ? darkTheme : lightTheme }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
