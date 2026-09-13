import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';

type Props = React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>;

export function Card({ children, style }: Props) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.paperStrong,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.xl,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    overflow: 'hidden',
  },
});
