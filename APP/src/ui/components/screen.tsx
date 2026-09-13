import React from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../core/providers/theme-provider';

type Props = React.PropsWithChildren<{
  scroll?: boolean;
  /** Tab 页给悬浮底栏留空；Stack 子页只用紧凑底距。 */
  inset?: 'tabs' | 'stack' | 'none';
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
}>;

export function Screen({
  children,
  scroll = true,
  inset = 'stack',
  style,
  contentStyle,
  edges = ['top', 'left', 'right'],
}: Props) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const pageFrame = width >= 960 ? theme.layout.pageMax : undefined;
  const paddingBottom =
    inset === 'tabs'
      ? theme.spacing.bottomClearance
      : inset === 'stack'
        ? theme.spacing.xxl
        : theme.spacing.md;
  const body = (
    <View
      style={[
        {
          width: '100%',
          maxWidth: pageFrame,
          alignSelf: 'center',
          paddingHorizontal: width >= 960 ? 28 : theme.spacing.page,
          paddingBottom,
          gap: width >= 960 ? 18 : theme.spacing.section,
          flex: scroll ? undefined : 1,
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={edges}
      // React Navigation's web Tab scene uses box-none on its active wrapper.
      // RN Web resolves that inherited value to pointer-events:none for the
      // whole scene, so the page can paint correctly while every action misses
      // the hit target. Re-enable hit testing at the shared page boundary;
      // overlays still opt into their own pointer-event behavior.
      style={[styles.root, styles.hitTarget, { backgroundColor: Platform.OS === 'web' ? theme.colors.canvas : theme.colors.paper }, style]}
    >
      {scroll ? (
        <ScrollView
          style={styles.scrollView}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hitTarget: { pointerEvents: 'auto' },
  // Stack screens on web do not always give an unstyled ScrollView a
  // measurable viewport. Without this, the content is painted but its hit
  // area is clipped to 0px, so page actions look present and cannot be used.
  scrollView: { flex: 1, height: '100%' },
  scroll: { flexGrow: 1, paddingTop: 24, alignItems: 'stretch' },
});
