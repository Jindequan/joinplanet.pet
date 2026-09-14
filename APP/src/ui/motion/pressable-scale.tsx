import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../core/providers/theme-provider';
import { useReducedMotion } from './reduced-motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Scale when pressed; default 0.97 per Fitts affordance without feeling mushy. */
  pressedScale?: number;
  disabled?: boolean;
};

export function PressableScale({
  children,
  style,
  pressedScale = 0.97,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
    opacity: disabled ? theme.motion.disabledOpacity : 1,
  }));

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      disabled={disabled}
      onPressIn={(e) => {
        if (!reduceMotion) scale.value = withTiming(pressedScale, { duration: theme.motion.pressIn });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduceMotion) scale.value = withTiming(1, { duration: theme.motion.pressOut });
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
