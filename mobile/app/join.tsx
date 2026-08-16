/**
 * Join — enter an invite code manually (contract F2 POST /circles/join).
 * Reached from create-pet's "Have an invite code? Join instead" link.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Field, PrimaryButton } from '../src/components/ui';
import { ApiError, AuthError, post } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { qk } from '../src/lib/queries';
import { colors, spacing, typography } from '../src/theme';

function errText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'Network unavailable — check your connection.';
    if (err.message && !err.message.startsWith('Request failed')) return err.message;
  }
  return fallback;
}

export default function JoinScreen() {
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const join = useCallback(async () => {
    const inviteCode = code.trim();
    if (!inviteCode) {
      setFormError('Enter the invite code you were sent.');
      return;
    }
    setJoining(true);
    setFormError(null);
    try {
      await post('/circles/join', { invite_code: inviteCode });
      await queryClient.invalidateQueries({ queryKey: qk.me });
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof AuthError) {
        router.replace('/welcome');
        return;
      }
      setFormError(errText(err, "Couldn't join with that code."));
      setJoining(false);
    }
  }, [code]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/create-pet');
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.prompt}>Join a care circle</Text>
        <Text style={styles.subtitle}>
          Enter the invite code shared by the pet's family.
        </Text>
        <Field
          label="Invite code"
          placeholder="e.g. 7KQ2-XM4"
          value={code}
          onChangeText={setCode}
          error={formError}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={join}
        />
        <PrimaryButton label="Join" onPress={join} loading={joining} style={styles.cta} />
        <Pressable
          accessibilityRole="button"
          onPress={goBack}
          hitSlop={spacing.s8}
          style={styles.altLink}
        >
          {({ pressed }) => (
            <Text style={[styles.altLinkText, pressed && styles.linkDim]}>
              Creating a pet instead? Go back
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s32,
    gap: spacing.s16,
  },
  prompt: { ...typography.page, color: colors.text, textAlign: 'center' },
  subtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cta: { marginTop: spacing.s4 },
  altLink: { minHeight: spacing.s40, justifyContent: 'center', alignItems: 'center' },
  altLinkText: {
    ...typography.caption,
    color: colors.brand700,
    fontWeight: '600',
    textAlign: 'center',
  },
  linkDim: { opacity: 0.5 },
});
