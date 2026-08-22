import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AppText, Card, LoadingState, QueryErrorState, Screen, SectionRow, StaleDataNotice } from '../../src/ui/components';
import { useTheme } from '../../src/core/providers/theme-provider';
import { WorkspaceBar } from '../../src/ui/navigation/workspace-bar';
import { readViewPreference } from '../../src/core/storage/view-preference';
import { useAccessiblePets, useCircles, useMe } from '../../src/core/query/hooks';
import { humanDisplayName, pluralLabel } from '../../src/core/presentation/labels';
import { GearSixIcon, HeartIcon, PawPrintIcon, ShieldCheckIcon, UserCircleIcon, UsersThreeIcon } from '../../src/ui/icons';

export default function YouRoute() {
  const { theme } = useTheme();
  const me = useMe();
  const circles = useCircles();
  const [preferredFamilyId, setPreferredFamilyId] = React.useState<string>();
  React.useEffect(() => {
    const userId = me.data?.user.id;
    if (!userId) return;
    void readViewPreference(userId).then((preference) => {
      if (preference?.kind === 'family') setPreferredFamilyId(preference.familyId);
    });
  }, [me.data?.user.id]);
  const circle = circles.data?.circles.find((item) => item.id === preferredFamilyId) ?? circles.data?.circles[0];
  const accessiblePets = useAccessiblePets(circles.data?.circles.map((item) => item.id) ?? []);
  const retrySpace = () => { void me.refetch(); void circles.refetch(); void accessiblePets.refetch(); };
  const blockingError = (me.isError && !me.data) || (circles.isError && !circles.data) || (accessiblePets.isError && !accessiblePets.hasData);
  const hasStaleData = Boolean((me.isError && me.data) || (circles.isError && circles.data) || (accessiblePets.isError && accessiblePets.hasData));
  if (me.isLoading || circles.isLoading || accessiblePets.isLoading) return <Screen><LoadingState label="Loading your space" /></Screen>;
  if (blockingError) return <Screen contentContainerStyle={styles.center}><QueryErrorState title="Your space is unavailable" body="We could not load your account and care relationships." onRetry={retrySpace} /></Screen>;
  const user = me.data?.user;
  const name = humanDisplayName(user) ?? 'Your PLANET account';
  return <Screen scroll contentContainerStyle={styles.content}>{hasStaleData ? <StaleDataNotice onRetry={retrySpace} retrying={me.isFetching || circles.isFetching} /> : null}<WorkspaceBar familyName={circle?.name} onPressWorkspace={() => router.push('/(tabs)/family')} /><View style={styles.header}><View style={styles.headerCopy}><AppText variant="caption" muted>ACCOUNT & APP</AppText><AppText variant="display">You</AppText><AppText muted>Manage your profile, care spaces and app preferences.</AppText></View><View style={[styles.avatar, { backgroundColor: theme.colors.brandSoft }]}><UserCircleIcon size={25} color={theme.colors.brandStrong} weight="duotone" /></View></View><LinearGradient colors={[theme.colors.accentSurface, theme.colors.brandSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.profileHero}><View style={[styles.profileAvatar, { backgroundColor: theme.colors.surface }]}><AppText variant="title" style={{ color: theme.colors.accentStrong }}>{humanDisplayName(user)?.slice(0, 1).toUpperCase() ?? 'P'}</AppText></View><View style={styles.profileCopy}><AppText variant="title" numberOfLines={2}>{name}</AppText><AppText variant="caption" muted>{user?.email}</AppText><AppText variant="caption" style={{ color: theme.colors.brandStrong, marginTop: 4 }}>{pluralLabel(accessiblePets.pets.length, 'Pet')} · {pluralLabel(circles.data?.circles.length ?? 0, 'Family', 'Families')}</AppText></View></LinearGradient><AppText variant="caption" muted style={styles.sectionLabel}>CARE SPACES</AppText><Card style={styles.menu}><SectionRow icon={PawPrintIcon} title="Pets" description={`${pluralLabel(accessiblePets.pets.length, 'Pet')} you can access`} onPress={() => router.push('/(tabs)/pets')} /><SectionRow icon={UsersThreeIcon} title="Family" description={circle?.name ?? 'Create or join a Family'} onPress={() => router.push('/(tabs)/family')} last /></Card><AppText variant="caption" muted style={styles.sectionLabel}>ACCOUNT</AppText><Card style={styles.menu}><SectionRow icon={UserCircleIcon} title="Profile" description="Name and email" onPress={() => router.push('/account')} /><SectionRow icon={GearSixIcon} title="Settings" description="Notifications and app preferences" onPress={() => router.push('/settings')} /><SectionRow icon={ShieldCheckIcon} title="Privacy & data" description="Sharing, export and deletion" onPress={() => router.push('/privacy')} last /></Card><View style={styles.closing}><HeartIcon size={15} color={theme.colors.accent} weight="fill" /><AppText variant="caption" muted>Care is easier when everyone can see what matters.</AppText></View></Screen>;
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'stretch' },
  content: { maxWidth: 680, alignSelf: 'center', width: '100%', paddingBottom: 192, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  headerCopy: { flex: 1, gap: 5 },
  avatar: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  profileHero: { minHeight: 122, borderRadius: 23, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 13 },
  profileAvatar: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  profileCopy: { flex: 1, gap: 3 },
  sectionLabel: { letterSpacing: 1.2, fontWeight: '700', marginTop: 6, marginLeft: 3 },
  menu: { paddingHorizontal: 16, paddingVertical: 2 },
  closing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 15 },
});
