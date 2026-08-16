/**
 * Welcome — placeholder auth screen (spec §13). Reached from the bootstrap when
 * there is no valid token. The real email/code flow will replace this file.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from 'lucide-react-native';
import { EmptyState } from '../src/components/ui';
import { colors, spacing } from '../src/theme';

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <EmptyState
          icon={Feather}
          title="Welcome to PLANET"
          subtitle="Sign-in screen placeholder — this will be built next."
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s16,
  },
});
