/**
 * Pet — placeholder screen. Replaced by a later pass; kept compilable + themed.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dog } from 'lucide-react-native';
import { EmptyState } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';

export default function PetScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.center}>
        <EmptyState
          icon={Dog}
          title="Pet"
          subtitle="Pet screen placeholder — this will be built next."
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
    paddingBottom: 96,
  },
});
