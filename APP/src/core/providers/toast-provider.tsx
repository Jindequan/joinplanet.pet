import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme-provider';
import { useReducedMotion } from '../../ui/motion/reduced-motion';

type ToastOptions = { message: string; actionLabel?: string; onAction?: () => void };
type ToastContextValue = { showToast: (options: ToastOptions) => void; hideToast: () => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: React.PropsWithChildren) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const hideToast = useCallback(() => {
    if (!toast) return;
    if (reduceMotion) {
      clearToast();
      return;
    }
    opacity.value = withTiming(0, { duration: theme.motion.fast }, (finished) => {
      if (finished) runOnJS(clearToast)();
    });
    translateY.value = withTiming(4, { duration: theme.motion.fast });
  }, [clearToast, opacity, reduceMotion, theme.motion.fast, toast, translateY]);

  const showToast = useCallback((next: ToastOptions) => {
    setToast(next);
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = 0;
    translateY.value = 8;
    opacity.value = withTiming(1, { duration: theme.motion.fast });
    translateY.value = withTiming(0, { duration: theme.motion.fast });
  }, [opacity, reduceMotion, theme.motion.fast, translateY]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(hideToast, toast.actionLabel ? 5200 : 3600);
    return () => clearTimeout(timer);
  }, [hideToast, toast]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const value = useMemo(() => ({ showToast, hideToast }), [hideToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View style={[styles.host, { bottom: Math.max(insets.bottom, 12) + 88 }, animatedStyle]}>
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
        </Animated.View>
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
