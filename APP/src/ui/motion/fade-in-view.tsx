import React, { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../core/providers/theme-provider';
import { enterDuration, shouldStaggerListEnter, useReducedMotion } from './reduced-motion';

type Props = React.PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  /** Stagger index for list enter; each step adds motion.stagger ms. */
  index?: number;
  /** Skip animation on first paint when false (e.g. loading → content). */
  animate?: boolean;
}>;

export function FadeInView({ children, style, index = 0, animate = true }: Props) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();

  const shouldAnimate = animate && !reduceMotion && shouldStaggerListEnter(index);
  const opacity = useSharedValue(shouldAnimate ? 0 : 1);
  const translateY = useSharedValue(shouldAnimate ? theme.motion.enterOffset : 0);

  useEffect(() => {
    if (!shouldAnimate) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    const delay = index * theme.motion.stagger;
    const duration = enterDuration(theme.motion.normal);
    opacity.value = withDelay(delay, withTiming(1, { duration }));
    translateY.value = withDelay(delay, withTiming(0, { duration }));
  }, [animate, index, opacity, shouldAnimate, theme.motion.enterOffset, theme.motion.normal, theme.motion.stagger, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
