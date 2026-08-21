import React, { createContext, useContext, useMemo, useState } from 'react';
import { lightTheme, type AppTheme } from '../../ui/theme/tokens';

export type ThemeMode = 'light';

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const theme = lightTheme;
  const value = useMemo(() => ({ mode, theme, setMode }), [mode, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
