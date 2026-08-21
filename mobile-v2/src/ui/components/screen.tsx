import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ScrollViewProps, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../core/providers/theme-provider';

export function Screen({ children, scroll = false, contentContainerStyle, ...props }: ViewProps & { scroll?: boolean; contentContainerStyle?: ScrollViewProps['contentContainerStyle'] }) {
  const { theme } = useTheme();
  const content = scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[screenStyles.scrollContent, { padding: theme.spacing.page, paddingBottom: theme.spacing.bottomClearance }, contentContainerStyle]}>{children}</ScrollView> : <View style={[screenStyles.content, { padding: theme.spacing.page, gap: theme.spacing.md }, contentContainerStyle]}>{children}</View>;
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[screenStyles.safe, { backgroundColor: theme.colors.background }]}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} style={screenStyles.flex} {...props}>{content}</KeyboardAvoidingView></SafeAreaView>;
}

export const screenStyles = StyleSheet.create({ flex: { flex: 1 }, safe: { flex: 1 }, content: { flex: 1 }, scrollContent: { gap: 16 } });
