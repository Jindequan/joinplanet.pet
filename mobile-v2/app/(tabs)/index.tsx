import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { AppText, Button, Card, PetFilterSelector, Screen, type ViewFilter } from '../../src/ui/components';
import { useTheme } from '../../src/core/providers/theme-provider';
import { useAccessiblePets, useCircles, useInvalidateApi, useMe, useTodayForCircles } from '../../src/core/query/hooks';
import { planetApi, type TodayItem } from '../../src/core/api/planet-api';
import { BellSimpleIcon, CaretRightIcon, CheckIcon, ClockIcon, PawPrintIcon, PlusIcon, SparkleIcon } from '../../src/ui/icons';

function dayGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function dateLabel() {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

function timeLabel(value?: string) {
  if (!value) return 'Any time';
  const parts = value.split(':');
  const hours = Number(parts[0] ?? '');
  const minutes = Number(parts[1] ?? 0);
  if (!Number.isFinite(hours)) return value;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes || 0).padStart(2, '0')} ${suffix}`;
}

function CareMoment({ item, petName }: { item: TodayItem; petName: string }) {
  const { theme } = useTheme();
  const invalidate = useInvalidateApi();
  const done = Boolean(item.log);
  const mutation = useMutation({
    mutationFn: async (): Promise<void> => { if (done) await planetApi.tasks.undo(item.log!.id); else await planetApi.tasks.complete(item.task.id, { status: 'done' }); },
    onSuccess: () => { invalidate.todayAll(); invalidate.timeline(item.task.pet_id); },
  });
  return <Pressable accessibilityRole="button" accessibilityLabel={done ? `Undo ${item.task.title}` : `Complete ${item.task.title}`} disabled={mutation.isPending} onPress={() => mutation.mutate()} style={({ pressed }) => [styles.moment, { backgroundColor: done ? theme.colors.surfaceRaised : theme.colors.surface, borderColor: done ? theme.colors.brandSoft : theme.colors.border }, pressed && { opacity: theme.motion.pressOpacity }]}>
    <View style={[styles.momentIcon, { backgroundColor: done ? theme.colors.brand : theme.colors.accentSurface }]}>{done ? <CheckIcon size={19} color={theme.colors.onBrand} weight="bold" /> : <PawPrintIcon size={19} color={theme.colors.accentStrong} weight="duotone" />}</View>
    <View style={styles.momentCopy}><AppText variant="label" style={done ? { textDecorationLine: 'line-through', color: theme.colors.textMuted } : undefined}>{item.task.title}</AppText><AppText variant="caption" muted>{petName} · {timeLabel(item.task.time_of_day)}</AppText></View>
    <View style={[styles.momentStatus, { borderColor: done ? theme.colors.brand : theme.colors.border, backgroundColor: done ? theme.colors.brand : theme.colors.surface }]}>{done ? <CheckIcon size={14} color={theme.colors.onBrand} weight="bold" /> : null}</View>
  </Pressable>;
}

export default function TodayRoute() {
  const { theme } = useTheme();
  const me = useMe();
  const circles = useCircles();
  const families = circles.data?.circles ?? [];
  const familyIds = families.map((family) => family.id);
  const accessiblePets = useAccessiblePets(familyIds);
  const [filter, setFilter] = useState<ViewFilter>({ kind: 'all' });
  const effectiveFilter = useMemo(() => {
    if (filter.kind === 'family' && !familyIds.includes(filter.familyId)) return { kind: 'all' } satisfies ViewFilter;
    if (filter.kind === 'pet' && !accessiblePets.pets.some((pet) => pet.id === filter.petId)) return { kind: 'all' } satisfies ViewFilter;
    return filter;
  }, [accessiblePets.pets, familyIds, filter]);
  const activeFamilyId = effectiveFilter.kind === 'family' ? effectiveFilter.familyId : undefined;
  const today = useTodayForCircles(activeFamilyId ? [activeFamilyId] : familyIds);
  const pets = useMemo(() => effectiveFilter.kind === 'pet' ? today.data.pets.filter((pet) => pet.pet_id === effectiveFilter.petId) : today.data.pets, [effectiveFilter, today.data.pets]);
  const items = pets.flatMap((pet) => pet.items.map((item) => ({ item, petName: pet.pet_name })));
  const completed = items.filter(({ item }) => Boolean(item.log)).length;
  const firstName = me.data?.user.display_name?.split(' ')[0] || 'there';

  if (circles.isLoading || accessiblePets.isLoading || today.isLoading || me.isLoading) return <Screen><ActivityIndicator color={theme.colors.brand} /></Screen>;
  if (circles.isError || today.isError || accessiblePets.isError) return <Screen contentContainerStyle={styles.center}><AppText variant="title">Today is waiting</AppText><AppText muted>We could not reach your care plan.</AppText><Button label="Try again" onPress={() => { void circles.refetch(); void today.refetch(); }} /></Screen>;

  if (families.length === 0) return <Screen scroll contentContainerStyle={styles.content}><View style={styles.welcomeTop}><View><AppText variant="caption" muted>PLANET / TODAY</AppText><AppText variant="display">A softer way to care.</AppText></View><View style={[styles.avatar, { backgroundColor: theme.colors.brandSoft }]}><SparkleIcon size={21} color={theme.colors.brandStrong} weight="duotone" /></View></View><LinearGradient colors={[theme.colors.brandStrong, theme.colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyHero}><PawPrintIcon size={30} color={theme.colors.onBrand} weight="duotone" /><AppText variant="title" style={{ color: theme.colors.onBrand }}>Start with one little world.</AppText><AppText style={{ color: 'rgba(255,255,255,0.82)' }}>Create your care circle, add a Pet, and PLANET will turn the everyday into something clear.</AppText></LinearGradient><Card style={styles.setupCard}><AppText variant="heading">Your first step</AppText><AppText muted>Invite the people who help, then add the Pet you all care about.</AppText><View style={styles.setupActions}><Button label="Create a Family" onPress={() => router.push('/(tabs)/family')} /><Button label="I have an invite" variant="secondary" onPress={() => router.push('/(tabs)/family')} /></View></Card></Screen>;

  return <Screen scroll contentContainerStyle={styles.content}>
    <View style={styles.header}><View style={styles.headerCopy}><AppText variant="caption" muted>{dateLabel().toUpperCase()}</AppText><AppText variant="display">{dayGreeting()}, {firstName}.</AppText><AppText muted>{completed === items.length && items.length > 0 ? 'Everything important is cared for.' : 'Here is what deserves your attention today.'}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push('/settings')} style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><BellSimpleIcon size={21} color={theme.colors.brandStrong} weight="regular" /></Pressable></View>
    <View style={styles.filterRow}><PetFilterSelector value={effectiveFilter} families={families} pets={accessiblePets.pets} onChange={setFilter} /><Pressable accessibilityRole="button" accessibilityLabel="Add care" onPress={() => router.push('/(tabs)/pets')} style={({ pressed }) => [styles.addButton, { backgroundColor: theme.colors.brandStrong }, pressed && { opacity: theme.motion.pressOpacity }]}><PlusIcon size={17} color={theme.colors.onBrand} weight="bold" /><AppText variant="label" style={{ color: theme.colors.onBrand }}>Add care</AppText></Pressable></View>
    <LinearGradient colors={[theme.colors.accentSurface, theme.colors.brandSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.progressCard}><View style={styles.progressCopy}><AppText variant="caption" style={{ color: theme.colors.accentStrong }}>TODAY'S CARE</AppText><AppText variant="title">{completed} of {items.length} moments done</AppText><AppText muted>{items.length === 0 ? 'Add a routine from a Pet to build your day.' : completed === items.length ? 'A clear day is a good day.' : 'Small actions add up to a cared-for life.'}</AppText></View><View style={[styles.progressRing, { borderColor: theme.colors.surface }]}><AppText variant="title" style={{ color: theme.colors.brandStrong }}>{items.length ? Math.round((completed / items.length) * 100) : 0}%</AppText></View></LinearGradient>
    <View style={styles.sectionHeading}><View><AppText variant="title">What needs you</AppText><AppText variant="caption" muted>{items.length ? `${items.length - completed} still to care for` : 'Your day is open'}</AppText></View><ClockIcon size={22} color={theme.colors.textSubtle} weight="duotone" /></View>
    {items.length === 0 ? <Card style={styles.emptyCard}><View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceRaised }]}><PawPrintIcon size={24} color={theme.colors.brandStrong} weight="duotone" /></View><AppText variant="heading">No routines yet</AppText><AppText muted>Add the first care plan for one of your Pets and it will appear here every day.</AppText><Button label="Open Pets" variant="secondary" onPress={() => router.push('/(tabs)/pets')} /></Card> : <View style={styles.moments}>{items.map(({ item, petName }) => <CareMoment key={item.task.id} item={item} petName={petName} />)}</View>}
    <Pressable accessibilityRole="button" accessibilityLabel="Open pet timeline" onPress={() => router.push('/(tabs)/timeline')} style={({ pressed }) => [styles.historyLink, pressed && { opacity: theme.motion.pressOpacity }]}><AppText variant="label" style={{ color: theme.colors.brandStrong }}>See the care history</AppText><CaretRightIcon size={18} color={theme.colors.brandStrong} weight="bold" /></Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 680, alignSelf: 'center', width: '100%', paddingBottom: 140, gap: 18 },
  center: { justifyContent: 'center', alignItems: 'stretch' },
  welcomeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 },
  headerCopy: { flex: 1, gap: 5 },
  avatar: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 46, height: 46, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  addButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressCard: { minHeight: 168, borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 18, overflow: 'hidden' },
  progressCopy: { flex: 1, gap: 6 },
  progressRing: { width: 86, height: 86, borderRadius: 43, borderWidth: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.42)' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  moments: { gap: 9 },
  moment: { minHeight: 78, borderRadius: 19, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  momentIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  momentCopy: { flex: 1, gap: 3 },
  momentStatus: { width: 25, height: 25, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  emptyHero: { minHeight: 218, borderRadius: 26, padding: 22, justifyContent: 'flex-end', gap: 9, overflow: 'hidden' },
  setupCard: { gap: 9 },
  setupActions: { gap: 9, marginTop: 5 },
  emptyCard: { gap: 10, alignItems: 'flex-start' },
  emptyIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  historyLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3 },
});
