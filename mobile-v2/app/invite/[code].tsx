import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card, LoadingState, Screen } from '../../src/ui/components';
import { useTheme } from '../../src/core/providers/theme-provider';
import { useSession } from '../../src/core/providers/session-provider';
import { planetApi } from '../../src/core/api/planet-api';
import { ApiError } from '../../src/core/network/api-client';

export default function InviteRoute() {
  const { theme } = useTheme();
  const { status } = useSession();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === 'string' ? params.code.trim().toUpperCase() : '';
  const [familyName, setFamilyName] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) {
      setError('This invite link is missing its code.');
      setLoading(false);
      return;
    }
    let active = true;
    void planetApi.families.invitePreview(code).then((result) => {
      if (active) setFamilyName(result.family.name);
    }).catch((reason) => {
      if (active) setError(reason instanceof ApiError ? reason.message : 'This invite link is no longer available.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [code]);

  const continueJoin = () => {
    if (status === 'authenticated') {
      router.replace({ pathname: '/(tabs)/family', params: { mode: 'join', code } });
    } else {
      router.push({ pathname: '/onboarding', params: { inviteCode: code } });
    }
  };

  if (loading) return <Screen><LoadingState label="Checking invite" /></Screen>;
  return <Screen scroll contentContainerStyle={styles.content}>
    <AppText variant="caption" muted>PLANET / INVITE</AppText>
    <AppText variant="display">Join a shared care space.</AppText>
    <Card style={styles.card}>
      {error ? <AppText style={{ color: theme.colors.danger }}>{error}</AppText> : <>
        <AppText variant="heading">{familyName ?? 'Family invite'}</AppText>
        <AppText muted>Join this Family to see its Pets and help with the care plan. You can review the invite before accepting it.</AppText>
        <AppText variant="caption" muted>Invite code · {code}</AppText>
        <Button label={status === 'authenticated' ? 'Continue to Join Family' : 'Sign in to join'} onPress={continueJoin} />
      </>}
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 560, alignSelf: 'center', width: '100%', gap: 18, paddingTop: 34 },
  card: { gap: 14, padding: 18 },
});
