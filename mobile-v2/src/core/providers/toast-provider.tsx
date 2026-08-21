import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme-provider';

type ToastOptions = { message: string; actionLabel?: string; onAction?: () => void };
type ToastContextValue = { showToast: (options: ToastOptions) => void; hideToast: () => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: React.PropsWithChildren) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const showToast = useCallback((next: ToastOptions) => setToast(next), []);
  const hideToast = useCallback(() => setToast(null), []);
  const value = useMemo(() => ({ showToast, hideToast }), [hideToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={[styles.host, { paddingTop: insets.top + theme.spacing.sm }]}>
          <View style={[styles.toast, { backgroundColor: theme.colors.inverseSurface }]}>
            <Text style={[styles.message, { color: theme.colors.inverseText }]}>{toast.message}</Text>
            {toast.actionLabel ? <Pressable accessibilityRole="button" onPress={() => { toast.onAction?.(); hideToast(); }}><Text style={[styles.action, { color: theme.colors.brand }]}>{toast.actionLabel}</Text></Pressable> : null}
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, zIndex: 20 },
  toast: { minHeight: 48, paddingHorizontal: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  message: { flex: 1, fontSize: 14, lineHeight: 20 },
  action: { fontSize: 14, fontWeight: '700' },
});
