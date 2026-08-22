import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Button, Card, LoadingState, PageHeader, Screen } from '../src/ui/components';
import { useSession } from '../src/core/providers/session-provider';
import { useTheme } from '../src/core/providers/theme-provider';
import { WorkspaceBar } from '../src/ui/navigation/workspace-bar';
import { readViewPreference } from '../src/core/storage/view-preference';
import { useCircles, useInvalidateApi, useMe, useNotificationPrefs } from '../src/core/query/hooks';
import { planetApi } from '../src/core/api/planet-api';
import { useMutation } from '@tanstack/react-query';
import { BellSimpleIcon, MoonStarsIcon, ShieldCheckIcon, SignOutIcon } from '../src/ui/icons';

function PreferenceRow({ title, description, value, onChange, disabled = false }: { title: string; description: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const { theme } = useTheme();
  return <View style={[styles.preference, { borderBottomColor: theme.colors.border, opacity: disabled ? theme.motion.disabledOpacity : 1 }]}><View style={styles.preferenceCopy}><AppText variant="label">{title}</AppText><AppText variant="caption" muted>{description}</AppText></View><Switch accessibilityLabel={title} disabled={disabled} value={value} onValueChange={onChange} trackColor={{ false: theme.colors.border, true: theme.colors.brand }} thumbColor={theme.colors.surface} /> </View>;
}

export default function SettingsRoute() {
  const { theme } = useTheme();
  const { signOut } = useSession();
  const circles = useCircles();
  const me = useMe();
  const [activeCircleId, setActiveCircleId] = React.useState<string>();
  const [preferredFamilyId, setPreferredFamilyId] = React.useState<string>();
  const [draft, setDraft] = React.useState<{ reminders: boolean; digest: boolean; alerts: boolean }>();
  const [saveMessage, setSaveMessage] = React.useState('');
  React.useEffect(() => {
    const userId = me.data?.user.id;
    if (!userId) return;
    void readViewPreference(userId).then((preference) => {
      if (preference?.kind === 'family') setPreferredFamilyId(preference.familyId);
    });
  }, [me.data?.user.id]);
  const circleId = circles.data?.circles.find((circle) => circle.id === activeCircleId)?.id ?? circles.data?.circles.find((circle) => circle.id === preferredFamilyId)?.id ?? circles.data?.circles[0]?.id;
  const prefs = useNotificationPrefs(circleId);
  const invalidate = useInvalidateApi();
  React.useEffect(() => { if (prefs.data?.prefs) setDraft(prefs.data.prefs); }, [prefs.data?.prefs]);
  const updatePrefs = useMutation({ mutationFn: (body: { reminders?: boolean; digest?: boolean; alerts?: boolean }) => planetApi.circles.updateNotificationPrefs(circleId!, body), onSuccess: () => { if (circleId) invalidate.notificationPrefs(circleId); setSaveMessage('Saved'); }, onError: () => setSaveMessage('We could not save that preference. Try again.') });
  if (circles.isLoading || (circleId && prefs.isLoading)) return <Screen><LoadingState label="Loading your settings" /></Screen>;
  if (circles.isError || prefs.isError) return <Screen contentContainerStyle={styles.center}><AppText variant="title">Settings are unavailable</AppText><AppText muted>We could not load your notification preferences.</AppText><Button label="Try again" onPress={() => { void circles.refetch(); void prefs.refetch(); }} /></Screen>;
  if (!circleId) return <Screen scroll contentContainerStyle={styles.content}><PageHeader eyebrow="YOU / NOTIFICATIONS" title="Notifications" /><Card style={styles.emptyCard}><View style={[styles.heroIcon, { backgroundColor: theme.colors.accentSurface }]}><ShieldCheckIcon size={24} color={theme.colors.brandStrong} weight="duotone" /></View><AppText variant="heading">Create or join a Family first</AppText><AppText muted>Notification preferences belong to a Family. Once you have a shared care space, you can choose which care updates reach you.</AppText><Button label="Open Family" onPress={() => router.push('/(tabs)/family')} /></Card><Button label="Sign out" variant="ghost" icon={<SignOutIcon size={18} color={theme.colors.danger} weight="regular" />} onPress={() => void signOut()} /></Screen>;
  const current = draft ?? prefs.data?.prefs ?? { reminders: true, digest: true, alerts: true };
  function changePreference(key: keyof typeof current, value: boolean) {
    const previous = current;
    setDraft({ ...current, [key]: value });
    setSaveMessage('Saving…');
    updatePrefs.mutate({ [key]: value }, { onError: () => { setDraft(previous); } });
  }
  return <Screen scroll contentContainerStyle={styles.content}><WorkspaceBar familyName={circles.data?.circles.find((circle) => circle.id === circleId)?.name} onPressWorkspace={() => router.push('/(tabs)/family')} /><PageHeader eyebrow="YOU / NOTIFICATIONS" title="Notifications" /><AppText muted style={styles.intro}>Choose which care updates PLANET sends for each Family.</AppText><Card style={styles.hero}><View style={[styles.heroIcon, { backgroundColor: theme.colors.accentSurface }]}><MoonStarsIcon size={24} color={theme.colors.accentStrong} weight="duotone" /></View><View style={styles.heroCopy}><AppText variant="heading">Notification controls</AppText><AppText muted>Change these settings at any time. Your care records are not affected.</AppText></View></Card>{circles.data?.circles.length && circles.data.circles.length > 1 ? <View style={styles.familyPicker}><AppText variant="caption" muted>NOTIFICATIONS FOR</AppText><View style={styles.familyOptions}>{circles.data.circles.map((circle) => { const selected = circle.id === circleId; return <Pressable key={circle.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setActiveCircleId(circle.id); setDraft(undefined); setSaveMessage(''); }} style={[styles.familyOption, { borderColor: selected ? theme.colors.brandStrong : theme.colors.border, backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface }]}><AppText variant="label" style={{ color: selected ? theme.colors.brandStrong : theme.colors.textMuted }}>{circle.name}</AppText></Pressable>; })}</View></View> : null}<View style={styles.sectionHeading}><View><AppText variant="title">Notification types</AppText><AppText variant="caption" muted>{circles.data?.circles.find((circle) => circle.id === circleId)?.name ?? 'Your care circle'}</AppText></View><BellSimpleIcon size={22} color={theme.colors.brandStrong} weight="duotone" /></View><Card style={styles.menu}><PreferenceRow title="Care reminders" description="A nudge when something is due." value={current.reminders} disabled={updatePrefs.isPending} onChange={(value) => changePreference('reminders', value)} /><PreferenceRow title="Daily digest" description="A gentle summary of the day ahead." value={current.digest} disabled={updatePrefs.isPending} onChange={(value) => changePreference('digest', value)} /><PreferenceRow title="Important alerts" description="Changes that need your attention." value={current.alerts} disabled={updatePrefs.isPending} onChange={(value) => changePreference('alerts', value)} /></Card>{saveMessage ? <AppText variant="caption" style={{ color: saveMessage.startsWith('We could') ? theme.colors.danger : theme.colors.success }}>{saveMessage}</AppText> : null}<Card style={styles.privacy}><ShieldCheckIcon size={22} color={theme.colors.brandStrong} weight="duotone" /><View style={styles.privacyCopy}><AppText variant="heading">Private by default</AppText><AppText muted>Your Pet records are shared only through the Family and Pet relationships you choose.</AppText></View></Card><Button label="Sign out" variant="ghost" icon={<SignOutIcon size={18} color={theme.colors.danger} weight="regular" />} onPress={() => void signOut()} /></Screen>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 680, alignSelf: 'center', width: '100%', paddingBottom: 192, gap: 16 },
  center: { justifyContent: 'center', alignItems: 'stretch' },
  intro: { maxWidth: 550, lineHeight: 23 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, gap: 3 },
  familyPicker: { gap: 8 },
  familyOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  familyOption: { minHeight: 44, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 },
  menu: { paddingHorizontal: 16, paddingVertical: 2 },
  preference: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  preferenceCopy: { flex: 1, gap: 2 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  privacyCopy: { flex: 1, gap: 3 },
  emptyCard: { gap: 12, alignItems: 'flex-start' },
});
