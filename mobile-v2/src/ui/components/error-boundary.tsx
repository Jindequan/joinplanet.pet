import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './app-text';
import { Button } from './button';
import { useTheme } from '../../core/providers/theme-provider';

type State = { hasError: boolean };
export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { if (__DEV__) console.error('[PLANET] Unhandled render error', error, info); }
  render() { if (!this.state.hasError) return this.props.children; return <ErrorFallback onRetry={() => this.setState({ hasError: false })} />; }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { theme } = useTheme();
  return <View style={[styles.container, { padding: theme.spacing.xl, gap: theme.spacing.sm, backgroundColor: theme.colors.background }]}><View style={[styles.mark, { backgroundColor: theme.colors.accentSurface }]}><AppText variant="title" style={{ color: theme.colors.accentStrong }}>!</AppText></View><AppText variant="heading">Something went wrong</AppText><AppText muted style={styles.body}>Please try again. Your saved data is safe.</AppText><Button label="Reload this screen" variant="secondary" onPress={onRetry} /></View>;
}
const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center' }, body: { textAlign: 'center', maxWidth: 320 }, mark: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 } });
