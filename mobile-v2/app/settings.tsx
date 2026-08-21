import React from 'react';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';
import { AppText, Button, Card, PageHeader, Screen } from '../src/ui/components';
import { useSession } from '../src/core/providers/session-provider';
import { useTheme } from '../src/core/providers/theme-provider';
import { useCircles, useInvalidateApi, useNotificationPrefs } from '../src/core/query/hooks';
import { planetApi } from '../src/core/api/planet-api';
import { useMutation } from '@tanstack/react-query';
import { BellSimpleIcon, MoonStarsIcon, ShieldCheckIcon, SignOutIcon } from '../src/ui/icons';

function PreferenceRow({ title, description, value, onChange }: { title: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  const { theme } = useTheme();
  return <View style={[styles.preference, { borderBottomColor: theme.colors.border }]}><View style={styles.preferenceCopy}><AppText variant="label">{title}</AppText><AppText variant="caption" muted>{description}</AppText></View><Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ false: theme.colors.border, true: theme.colors.brand }} thumbColor={theme.colors.surface} /> </View>;
}

export default function SettingsRoute() {
  const { theme } = useTheme();
  const { signOut } = useSession();
  const circles = useCircles();
  const circleId = circles.data?.circles[0]?.id;
  const prefs = useNotificationPrefs(circleId);
  const invalidate = useInvalidateApi();
  const updatePrefs = useMutation({ mutationFn: (body: { reminders?: boolean; digest?: boolean; alerts?: boolean }) => planetApi.circles.updateNotificationPrefs(circleId!, body), onSuccess: () => circleId && invalidate.notificationPrefs(circleId) });
  if (circles.isLoading || (circleId && prefs.isLoading)) return <Screen><ActivityIndicator color={theme.colors.brand} /></Screen>;
  const current = prefs.data?.prefs ?? { reminders: true, digest: true, alerts: true };
  return <Screen scroll contentContainerStyle={styles.content}><PageHeader eyebrow="YOU / SETTINGS" title="Make it yours." /><AppText muted style={styles.intro}>PLANET should fit the way your household already cares—not ask you to keep up with another system.</AppText><Card style={styles.hero}><View style={[styles.heroIcon, { backgroundColor: theme.colors.accentSurface }]}><MoonStarsIcon size={24} color={theme.colors.accentStrong} weight="duotone" /></View><View style={styles.heroCopy}><AppText variant="heading">A calm default</AppText><AppText muted>We keep reminders useful, quiet and easy to change.</AppText></View></Card><View style={styles.sectionHeading}><View><AppText variant="title">When PLANET reaches out</AppText><AppText variant="caption" muted>Choose what helps your care rhythm.</AppText></View><BellSimpleIcon size={22} color={theme.colors.brandStrong} weight="duotone" /></View><Card style={styles.menu}><PreferenceRow title="Care reminders" description="A nudge when something is due." value={current.reminders} onChange={(value) => updatePrefs.mutate({ reminders: value })} /><PreferenceRow title="Daily digest" description="A gentle summary of the day ahead." value={current.digest} onChange={(value) => updatePrefs.mutate({ digest: value })} /><PreferenceRow title="Important alerts" description="Changes that need your attention." value={current.alerts} onChange={(value) => updatePrefs.mutate({ alerts: value })} /></Card><Card style={styles.privacy}><ShieldCheckIcon size={22} color={theme.colors.brandStrong} weight="duotone" /><View style={styles.privacyCopy}><AppText variant="heading">Private by default</AppText><AppText muted>Your Pet records are shared only through the Family and Pet relationships you choose.</AppText></View></Card><Button label="Sign out" variant="ghost" icon={<SignOutIcon size={18} color={theme.colors.danger} weight="regular" />} onPress={() => void signOut()} /></Screen>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 680, alignSelf: 'center', width: '100%', paddingBottom: 140, gap: 16 },
  intro: { maxWidth: 550, lineHeight: 23 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, gap: 3 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 },
  menu: { paddingHorizontal: 16, paddingVertical: 2 },
  preference: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  preferenceCopy: { flex: 1, gap: 2 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  privacyCopy: { flex: 1, gap: 3 },
});
