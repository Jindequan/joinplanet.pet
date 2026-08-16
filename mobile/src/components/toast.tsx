/**
 * Toast (spec §88) — short feedback only, optional single action (e.g. Undo).
 * Hand-drawn overlay: appears from the top with a spring, auto-dismisses.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography, withAlpha } from '../theme';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  message: string;
  action?: ToastAction;
  /** ms; default 3000. Pass 0 to require manual dismiss. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const DEFAULT_DURATION = 3000;

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const progress = useRef(new Animated.Value(0)).current; // 0 = above screen, 1 = settled

  useEffect(() => {
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [progress]);

  const dismiss = useCallback(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => onDismiss(item.id));
  }, [progress, onDismiss, item.id]);

  useEffect(() => {
    if (item.duration === 0) return;
    const timer = setTimeout(dismiss, item.duration ?? DEFAULT_DURATION);
    return () => clearTimeout(timer);
  }, [item.duration, dismiss, item]);

  const action = item.action;

  const runAction = () => {
    action?.onPress();
    dismiss();
  };

  return (
    <Animated.View
      style={[
        styles.toast,
        shadows.floating,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-48, 0],
              }),
            },
          ],
        } as StyleProp<ViewStyle>,
      ]}
    >
      <Text style={styles.message} numberOfLines={2}>
        {item.message}
      </Text>
      {action ? (
        <Pressable hitSlop={spacing.s8} onPress={runAction} accessibilityRole="button">
          {({ pressed }) => (
            <Text style={[styles.action, pressed && styles.actionPressed]}>{action.label}</Text>
          )}
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    setItems((prev) => [...prev.slice(-1), { id: nextId.current++, ...options }]);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <SafeAreaView pointerEvents="box-none" edges={['top']} style={styles.overlay}>
          {items.map((item) => (
            <ToastView key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </SafeAreaView>
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    paddingHorizontal: spacing.s16,
    gap: spacing.s8,
  },
  toast: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s16,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
  },
  message: {
    flex: 1,
    ...typography.bodySm,
    color: colors.text,
  },
  action: {
    ...typography.card,
    color: colors.brand700,
    fontWeight: '600',
  },
  actionPressed: {
    color: withAlpha(colors.brand700, 0.5),
  },
});
