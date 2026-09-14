import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../core/providers/theme-provider';
import { useReducedMotion } from '../motion/reduced-motion';

type Props = {
  /** 0–100 */
  value: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function ProgressBar({ value, style, accessibilityLabel }: Props) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(value);

  useEffect(() => {
    const next = Math.min(100, Math.max(0, value));
    progress.value = reduceMotion
      ? next
      : withTiming(next, { duration: theme.motion.normal });
  }, [progress, reduceMotion, theme.motion.normal, value]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(100, Math.max(0, value))) }}
      style={[styles.track, { backgroundColor: theme.colors.sageSoft }, style]}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: theme.colors.forest2, borderRadius: 999 },
          fillStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 56,
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
