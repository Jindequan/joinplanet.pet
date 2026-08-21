import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AppText, Card, Screen, SectionRow } from '../../src/ui/components';
import { useTheme } from '../../src/core/providers/theme-provider';
import { useAccessiblePets, useCircles, useMe } from '../../src/core/query/hooks';
import { GearSixIcon, HeartIcon, PawPrintIcon, ShieldCheckIcon, UserCircleIcon, UsersThreeIcon } from '../../src/ui/icons';

export default function YouRoute() {
  const { theme } = useTheme();
  const me = useMe();
  const circles = useCircles();
  const circle = circles.data?.circles[0];
  const accessiblePets = useAccessiblePets(circles.data?.circles.map((item) => item.id) ?? []);
  if (me.isLoading || circles.isLoading || accessiblePets.isLoading) return <Screen><ActivityIndicator color={theme.colors.brand} /></Screen>;
  const user = me.data?.user;
  const name = user?.display_name || 'Your space';
  return <Screen scroll contentContainerStyle={styles.content}><View style={styles.header}><View style={styles.headerCopy}><AppText variant="caption" muted>YOUR SPACE</AppText><AppText variant="display">You.</AppText><AppText muted>A quieter place for your account, your people, and your preferences.</AppText></View><View style={[styles.avatar, { backgroundColor: theme.colors.brandSoft }]}><UserCircleIcon size={25} color={theme.colors.brandStrong} weight="duotone" /></View></View><LinearGradient colors={[theme.colors.accentSurface, theme.colors.brandSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.profileHero}><View style={[styles.profileAvatar, { backgroundColor: theme.colors.surface }]}><AppText variant="title" style={{ color: theme.colors.accentStrong }}>{name.slice(0, 1).toUpperCase()}</AppText></View><View style={styles.profileCopy}><AppText variant="title">{name}</AppText><AppText variant="caption" muted>{user?.email}</AppText><AppText variant="caption" style={{ color: theme.colors.brandStrong, marginTop: 4 }}>{accessiblePets.pets.length} Pets · {circles.data?.circles.length ?? 0} Families in your care orbit</AppText></View></LinearGradient><AppText variant="caption" muted style={styles.sectionLabel}>YOUR ORBIT</AppText><Card style={styles.menu}><SectionRow icon={PawPrintIcon} title="Pets" description={`${accessiblePets.pets.length} little worlds`} onPress={() => router.push('/(tabs)/pets')} /><SectionRow icon={UsersThreeIcon} title="Family" description={circle?.name ?? 'Create or join a care circle'} onPress={() => router.push('/(tabs)/family')} last /></Card><AppText variant="caption" muted style={styles.sectionLabel}>YOUR PLANET</AppText><Card style={styles.menu}><SectionRow icon={UserCircleIcon} title="Profile" description="Name, email and personal details" onPress={() => router.push('/account')} /><SectionRow icon={GearSixIcon} title="Settings" description="Notifications and preferences" onPress={() => router.push('/settings')} /><SectionRow icon={ShieldCheckIcon} title="Privacy" description="Your data, your control" last /></Card><View style={styles.closing}><HeartIcon size={15} color={theme.colors.accent} weight="fill" /><AppText variant="caption" muted>Made for the ordinary moments that make a life.</AppText></View></Screen>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 680, alignSelf: 'center', width: '100%', paddingBottom: 140, gap: 16 },
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
