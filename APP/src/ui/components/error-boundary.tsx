import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = React.PropsWithChildren;
type State = { hasError: boolean; retryKey: number };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, retryKey: 0 };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.center} accessibilityRole="alert">
          <Text style={styles.title}>页面需要刷新</Text>
          <Text style={styles.body}>这次显示出了问题。刷新后即可继续，已保存的数据不会丢。</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重试加载页面"
            onPress={() => this.setState((current) => ({ hasError: false, retryKey: current.retryKey + 1 }))}
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>重试</Text>
          </Pressable>
        </View>
      );
    }
    // A retry must remount the failed tree. Merely clearing hasError leaves a
    // deterministic render error in the same component instances and traps
    // the user on the recovery screen.
    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#FBF9F8',
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1B1C1B' },
  body: { fontSize: 15, lineHeight: 22, color: '#52605A' },
  button: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#016B54',
    borderRadius: 12,
    minHeight: 44,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonLabel: { color: '#FFFFFF', fontWeight: '700' },
});
