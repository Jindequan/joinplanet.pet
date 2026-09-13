import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.actionLabel ? 5200 : 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => ({ showToast, hideToast }), [hideToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View style={[styles.host, { bottom: Math.max(insets.bottom, 12) + 88 }]}>
          <View
            style={[
              styles.toast,
              theme.shadow.floating,
              { backgroundColor: theme.colors.inverseSurface },
            ]}
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={toast.message}
          >
            <Text style={[styles.message, { color: theme.colors.inverseText }]}>{toast.message}</Text>
            {toast.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={toast.actionLabel}
                onPress={() => {
                  try {
                    toast.onAction?.();
                  } finally {
                    // A feedback action must dismiss the transient surface
                    // even when its navigation or retry callback fails.
                    hideToast();
                  }
                }}
                style={styles.actionButton}
              >
                <Text style={{ color: theme.colors.brand, fontWeight: '600' }}>{toast.actionLabel}</Text>
              </Pressable>
            ) : null}
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
  toast: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  message: { flex: 1, fontSize: 13, fontWeight: '500' },
  actionButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
});
