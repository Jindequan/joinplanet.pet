import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { EnvelopeSimpleIcon, GlobeHemisphereWestIcon, UserCircleIcon } from '../src/ui/icons';
import { AppText, Button, Card, LoadingState, PageHeader, QueryErrorState, Screen, SectionRow, StaleDataNotice, TextField } from '../src/ui/components';
import { useTheme } from '../src/core/providers/theme-provider';
import { useSession } from '../src/core/providers/session-provider';
import { useInvalidateApi, useMe, useMeUsage } from '../src/core/query/hooks';
import { planetApi } from '../src/core/api/planet-api';
import { ApiError } from '../src/core/network/api-client';
import { useMutation } from '@tanstack/react-query';
import { accountDeleteSchema, displayNameSchema } from '../src/core/forms';

export default function AccountRoute() {
  const { theme } = useTheme();
  const { signOut } = useSession();
  const me = useMe();
  const usage = useMeUsage();
  const invalidate = useInvalidateApi();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  useEffect(() => { if (me.data?.user.display_name) setName(me.data.user.display_name); }, [me.data?.user.display_name]);
  const update = useMutation({ mutationFn: () => planetApi.me.update(name.trim()), onSuccess: () => { setMessage('Profile saved.'); invalidate.me(); }, onError: (err) => setMessage(err instanceof ApiError ? err.message : 'Unable to save profile.') });
  const deleteAccount = useMutation({ mutationFn: () => planetApi.me.deleteAccount(confirmEmail.trim()), onSuccess: () => { void signOut(); }, onError: (err) => setMessage(err instanceof ApiError ? err.message : 'Unable to delete this account.') });
  function submitProfile() {
    const parsed = displayNameSchema.safeParse({ display_name: name });
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? 'Enter a display name.'); return; }
    setMessage(''); update.mutate();
  }
  function submitDelete() {
    const parsed = accountDeleteSchema.safeParse({ confirm: confirmEmail });
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? 'Type your email to confirm.'); return; }
    setMessage('');
    deleteAccount.mutate();
  }
  const retryAccount = () => { void me.refetch(); void usage.refetch(); };
  if (me.isLoading) return <Screen><LoadingState label="Loading your profile" /></Screen>;
  if (me.isError && !me.data) return <Screen contentContainerStyle={styles.center}><QueryErrorState title="Your profile is unavailable" body="We could not load your account details right now." onRetry={retryAccount} /></Screen>;
  const user = me.data?.user;
  if (!user) return <Screen><AppText variant="title">Profile unavailable</AppText><Button label="Try again" onPress={() => me.refetch()} /></Screen>;
  const petUsage = usage.data?.resources?.pets_created;
  return <Screen scroll contentContainerStyle={styles.content}>{me.isError || usage.isError ? <StaleDataNotice onRetry={retryAccount} retrying={me.isFetching || usage.isFetching} message="Some account details are from the last saved view. Reconnect to refresh them." /> : null}<PageHeader eyebrow="YOU / PROFILE" title="Your profile" /><Card style={styles.identity}><View style={[styles.avatar, { backgroundColor: theme.colors.iconSurface }]}><UserCircleIcon size={34} color={theme.colors.brandStrong} weight="regular" /></View><View style={styles.copy}><AppText variant="heading">{user.display_name || 'Your profile'}</AppText><AppText variant="caption" muted>{user.email}</AppText></View></Card><Card style={styles.form}><TextField label="Display name" value={name} onChangeText={(value) => { setName(value); setMessage(''); }} placeholder="Your name" maxLength={60} /><Button label="Save profile" loading={update.isPending} disabled={!name.trim()} onPress={submitProfile} />{message ? <AppText variant="caption" style={{ color: message === 'Profile saved.' ? theme.colors.success : theme.colors.danger }}>{message}</AppText> : null}</Card><AppText variant="caption" muted style={styles.label}>ACCOUNT DETAILS</AppText><Card style={styles.menu}><SectionRow icon={EnvelopeSimpleIcon} title="Email & sign-in" description={user.email} /><SectionRow icon={GlobeHemisphereWestIcon} title="Language" description={user.locale || 'English'} last /></Card>{petUsage ? <Card style={styles.usage}><AppText variant="heading">Your care capacity</AppText><AppText muted>{petUsage.used} of {petUsage.limit} active Pets used on your plan.</AppText></Card> : null}<Card style={styles.dangerCard}><AppText variant="heading">Delete account</AppText><AppText muted>This is permanent. If you still own a Pet, transfer or delete it first so its shared history is not orphaned.</AppText>{deleting ? <View style={styles.form}><TextField label={`Type ${user.email} to confirm`} value={confirmEmail} onChangeText={(value) => { setConfirmEmail(value); setMessage(''); }} autoCapitalize="none" autoCorrect={false} placeholder={user.email} /><View style={styles.actions}><Button label="Cancel" variant="secondary" onPress={() => { setDeleting(false); setConfirmEmail(''); }} /><Button label="Delete account" variant="danger" loading={deleteAccount.isPending} onPress={submitDelete} /></View></View> : <Button label="Delete account" variant="danger" onPress={() => setDeleting(true)} />}</Card></Screen>;
}
const styles = StyleSheet.create({ center: { justifyContent: 'center', alignItems: 'stretch' }, content: { maxWidth: 640, alignSelf: 'center', width: '100%', paddingBottom: 48, gap: 12 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 }, avatar: { width: 58, height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, copy: { gap: 3 }, form: { gap: 12 }, label: { letterSpacing: 1.2, fontWeight: '700', marginTop: 12 }, menu: { paddingHorizontal: 16, paddingVertical: 2 }, usage: { gap: 7 }, dangerCard: { gap: 10 }, actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' } });
