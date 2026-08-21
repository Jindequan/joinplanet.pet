import React from 'react';
import { Button, StyleSheet, View } from 'react-native';
import { AppText } from './app-text';

type State = { hasError: boolean };
export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { if (__DEV__) console.error('[PLANET] Unhandled render error', error, info); }
  render() { if (!this.state.hasError) return this.props.children; return <View style={styles.container}><AppText variant="heading">Something went wrong</AppText><AppText muted style={styles.body}>Please try again. Your saved data is safe.</AppText><Button title="Reload this screen" onPress={() => this.setState({ hasError: false })} /></View>; }
}
const styles = StyleSheet.create({ container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 12 }, body: { textAlign: 'center' } });
