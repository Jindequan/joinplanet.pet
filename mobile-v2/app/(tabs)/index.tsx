import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { AppText, Button, Card, PetFilterSelector, QueryErrorState, Screen, type ViewFilter } from '../../src/ui/components';
import { useTheme } from '../../src/core/providers/theme-provider';
import { useAccessiblePets, useAlertsForCircles, useCircles, useInvalidateApi, useMe, useTodayForCircles } from '../../src/core/query/hooks';
import { planetApi, type TodayItem } from '../../src/core/api/planet-api';
import { ApiError } from '../../src/core/network/api-client';
import { useToast } from '../../src/core/providers/toast-provider';
import { CaretRightIcon, CheckIcon, ClockIcon, PawPrintIcon, PlusIcon, SparkleIcon, WarningCircleIcon } from '../../src/ui/icons';

function dayGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function dateKey(offset = 0, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function shortDateLabel(value: string, offset: number) {
  if (offset === 0) return 'Today';
  if (offset === -1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
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

function carePeriod(value?: string) {
  if (!value) return 'Any time';
  const hour = Number(value.split(':')[0]);
  if (!Number.isFinite(hour)) return 'Any time';
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

function AlertCard({ title, body, petName, severity, onPress }: { title: string; body: string; petName: string; severity: 'watch' | 'warn'; onPress: () => void }) {
  const { theme } = useTheme();
  const color = severity === 'warn' ? theme.colors.danger : theme.colors.warning;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open alert: ${title}`} onPress={onPress} style={({ pressed }) => [styles.alertCard, { backgroundColor: theme.colors.surface, borderColor: color }, pressed && { opacity: theme.motion.pressOpacity }]}><View style={[styles.alertIcon, { backgroundColor: severity === 'warn' ? theme.colors.accentSurface : theme.colors.surfaceRaised }]}><WarningCircleIcon size={19} color={color} weight="duotone" /></View><View style={styles.alertCopy}><AppText variant="label">{title}</AppText><AppText variant="caption" muted>{petName} · {body}</AppText></View><CaretRightIcon size={17} color={theme.colors.textSubtle} weight="bold" /></Pressable>;
}

function CareMoment({ item, petName, date }: { item: TodayItem; petName: string; date: string }) {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const invalidate = useInvalidateApi();
  const done = item.log?.status === 'done' || item.log?.status === 'completed';
  const skipped = item.log?.status === 'skipped';
  const mutation = useMutation({
    mutationFn: async (action: 'done' | 'undo' | 'skip'): Promise<void> => {
      if (action === 'undo') await planetApi.tasks.undo(item.log!.id);
      else await planetApi.tasks.complete(item.task.id, { status: action === 'skip' ? 'skipped' : 'done', date });
    },
    onSuccess: (_result, action) => { void Haptics.impactAsync(action === 'skip' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light); invalidate.todayAll(); invalidate.timeline(item.task.pet_id); },
    onError: (error) => showToast({ message: error instanceof ApiError ? error.message : 'That care moment could not be updated.' }),
  });
  return <View style={[styles.moment, { backgroundColor: done || skipped ? theme.colors.surfaceRaised : theme.colors.surface, borderColor: done ? theme.colors.brandSoft : theme.colors.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={item.log ? `Undo ${skipped ? 'skip' : 'completion'} of ${item.task.title}` : `Complete ${item.task.title}`} disabled={mutation.isPending} onPress={() => mutation.mutate(item.log ? 'undo' : 'done')} style={({ pressed }) => [styles.momentMain, pressed && { opacity: theme.motion.pressOpacity }]}>
      <View style={[styles.momentIcon, { backgroundColor: done ? theme.colors.brand : theme.colors.accentSurface }]}>{done ? <CheckIcon size={19} color={theme.colors.onBrand} weight="bold" /> : <PawPrintIcon size={19} color={theme.colors.accentStrong} weight="duotone" />}</View>
      <View style={styles.momentCopy}><AppText variant="label" style={done || skipped ? { textDecorationLine: 'line-through', color: theme.colors.textMuted } : undefined}>{item.task.title}</AppText><AppText variant="caption" muted>{petName} · {timeLabel(item.task.time_of_day)}{item.log?.done_by_name ? ` · ${item.log.done_by_name}` : ''}{skipped ? ' · skipped' : ''}</AppText></View>
      <View style={[styles.momentStatus, { borderColor: done ? theme.colors.brand : theme.colors.border, backgroundColor: done ? theme.colors.brand : theme.colors.surface }]}>{done ? <CheckIcon size={14} color={theme.colors.onBrand} weight="bold" /> : skipped ? <AppText variant="caption" muted>—</AppText> : null}</View>
    </Pressable>
    {!item.log ? <Pressable accessibilityRole="button" accessibilityLabel={`Skip ${item.task.title}`} disabled={mutation.isPending} onPress={() => mutation.mutate('skip')} style={({ pressed }) => [styles.skipButton, { borderColor: theme.colors.border }, pressed && { opacity: theme.motion.pressOpacity }]}><AppText variant="caption" style={{ color: theme.colors.textMuted }}>Skip</AppText></Pressable> : null}
  </View>;
}

export default function TodayRoute() {
  const { theme } = useTheme();
  const me = useMe();
  const circles = useCircles();
  const families = circles.data?.circles ?? [];
  const familyIds = families.map((family) => family.id);
  const accessiblePets = useAccessiblePets(familyIds);
  const [filter, setFilter] = useState<ViewFilter>({ kind: 'all' });
  const [dayOffset, setDayOffset] = useState(0);
  const effectiveFilter = useMemo(() => {
    if (filter.kind === 'family' && !familyIds.includes(filter.familyId)) return { kind: 'all' } satisfies ViewFilter;
    if (filter.kind === 'pet' && !accessiblePets.pets.some((pet) => pet.id === filter.petId)) return { kind: 'all' } satisfies ViewFilter;
    return filter;
  }, [accessiblePets.pets, familyIds, filter]);
  const activeFamilyId = effectiveFilter.kind === 'family' ? effectiveFilter.familyId : undefined;
  const displayTimezone = families.find((family) => family.id === activeFamilyId)?.timezone ?? families[0]?.timezone;
  const historicalDate = dayOffset === 0 ? '' : dateKey(dayOffset, displayTimezone);
  const visibleDate = dateKey(dayOffset, displayTimezone);
  const today = useTodayForCircles(activeFamilyId ? [activeFamilyId] : familyIds, historicalDate);
  const alertsQuery = useAlertsForCircles(dayOffset === 0 ? (activeFamilyId ? [activeFamilyId] : familyIds) : []);
  const pets = useMemo(() => effectiveFilter.kind === 'pet' ? today.data.pets.filter((pet) => pet.pet_id === effectiveFilter.petId) : today.data.pets, [effectiveFilter, today.data.pets]);
  const visibleAlerts = useMemo(() => effectiveFilter.kind === 'pet' ? alertsQuery.alerts.filter((alert) => alert.pet_id === effectiveFilter.petId) : alertsQuery.alerts, [alertsQuery.alerts, effectiveFilter]);
  const items = pets.flatMap((pet) => pet.items.map((item) => ({ item, petName: pet.pet_name })));
  const completed = items.filter(({ item }) => item.log?.status === 'done' || item.log?.status === 'completed').length;
  const skipped = items.filter(({ item }) => item.log?.status === 'skipped').length;
  const groupedItems = (['Morning', 'Afternoon', 'Evening', 'Any time'] as const)
    .map((label) => ({ label, items: items.filter(({ item }) => carePeriod(item.task.time_of_day) === label) }))
    .filter((group) => group.items.length > 0);
  const firstName = me.data?.user.display_name?.split(' ')[0] || 'there';

  if (circles.isLoading || accessiblePets.isLoading || today.isLoading || me.isLoading) return <Screen><ActivityIndicator color={theme.colors.brand} /></Screen>;
  if (circles.isError || today.isError || accessiblePets.isError || me.isError) return <Screen contentContainerStyle={styles.center}><QueryErrorState title="Today is waiting" body="We could not reach your care plan right now." onRetry={() => { void me.refetch(); void circles.refetch(); void accessiblePets.refetch(); void today.refetch(); }} /></Screen>;

  if (families.length === 0) return <Screen scroll contentContainerStyle={styles.content}><View style={styles.welcomeTop}><View><AppText variant="caption" muted>PLANET / TODAY</AppText><AppText variant="display">A softer way to care.</AppText></View><View style={[styles.avatar, { backgroundColor: theme.colors.brandSoft }]}><SparkleIcon size={21} color={theme.colors.brandStrong} weight="duotone" /></View></View><LinearGradient colors={[theme.colors.brandStrong, theme.colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyHero}><PawPrintIcon size={30} color={theme.colors.onBrand} weight="duotone" /><AppText variant="title" style={{ color: theme.colors.onBrand }}>Start with one little world.</AppText><AppText style={{ color: 'rgba(255,255,255,0.82)' }}>Create your care circle, add a Pet, and PLANET will turn the everyday into something clear.</AppText></LinearGradient><Card style={styles.setupCard}><AppText variant="heading">Your first step</AppText><AppText muted>Invite the people who help, then add the Pet you all care about.</AppText><View style={styles.setupActions}><Button label="Create a Family" onPress={() => router.push('/(tabs)/family')} /><Button label="I have an invite" variant="secondary" onPress={() => router.push('/(tabs)/family')} /></View></Card></Screen>;

  return <Screen scroll contentContainerStyle={styles.content}>
    <View style={styles.header}><View style={styles.headerCopy}><AppText variant="caption" muted>{dateLabel(visibleDate).toUpperCase()}</AppText><AppText variant="display">{dayOffset === 0 ? `${dayGreeting()}, ${firstName}.` : `Care on ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${visibleDate}T12:00:00`))}.`}</AppText><AppText muted>{completed === items.length && items.length > 0 ? 'Everything important is cared for.' : dayOffset === 0 ? 'Here is what deserves your attention today.' : 'Review or complete a recent care moment.'}</AppText></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}><View style={styles.dayRow}>{[0, -1, -2, -3, -4, -5, -6].map((offset) => { const value = dateKey(offset, displayTimezone); const selected = offset === dayOffset; return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setDayOffset(offset)} style={[styles.dayChip, { borderColor: selected ? theme.colors.brandStrong : theme.colors.border, backgroundColor: selected ? theme.colors.brandStrong : theme.colors.surface }]}><AppText variant="caption" style={{ color: selected ? theme.colors.onBrand : theme.colors.textMuted }}>{shortDateLabel(value, offset)}</AppText></Pressable>; })}</View></ScrollView>
    <View style={styles.filterRow}><PetFilterSelector value={effectiveFilter} families={families} pets={accessiblePets.pets} onChange={setFilter} /><Pressable accessibilityRole="button" accessibilityLabel={accessiblePets.pets.length === 1 ? 'Add care' : 'Choose a Pet for care'} onPress={() => { if (accessiblePets.pets.length === 1) router.push({ pathname: '/(tabs)/pet', params: { petId: accessiblePets.pets[0]?.id, intent: 'care' } }); else router.push({ pathname: '/(tabs)/pets', params: { intent: 'care' } }); }} style={({ pressed }) => [styles.addButton, { backgroundColor: theme.colors.brandStrong }, pressed && { opacity: theme.motion.pressOpacity }]}><PlusIcon size={17} color={theme.colors.onBrand} weight="bold" /><AppText variant="label" style={{ color: theme.colors.onBrand }}>{accessiblePets.pets.length === 1 ? 'Add care' : 'Choose Pet'}</AppText></Pressable></View>
    {visibleAlerts.length ? <View style={styles.alerts}><AppText variant="caption" muted style={styles.alertLabel}>NEEDS A CLOSER LOOK</AppText>{visibleAlerts.slice(0, 3).map((alert) => <AlertCard key={alert.id} title={alert.title} body={alert.body} petName={alert.pet_name} severity={alert.severity} onPress={() => router.push({ pathname: '/(tabs)/timeline', params: { petId: alert.pet_id } })} />)}</View> : alertsQuery.isError ? <View style={styles.alertRetry}><AppText variant="caption" muted>We could not check for care alerts.</AppText><Button label="Retry" variant="ghost" onPress={() => void alertsQuery.refetch()} /></View> : null}
    <LinearGradient colors={[theme.colors.accentSurface, theme.colors.brandSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.progressCard}><View style={styles.progressCopy}><AppText variant="caption" style={{ color: theme.colors.accentStrong }}>TODAY'S CARE</AppText><AppText variant="title">{completed} of {items.length} moments done</AppText><AppText muted>{items.length === 0 ? 'Add a routine from a Pet to build your day.' : completed === items.length ? 'A clear day is a good day.' : skipped ? `${skipped} skipped · ${items.length - completed - skipped} still open` : 'Small actions add up to a cared-for life.'}</AppText></View><View style={[styles.progressRing, { borderColor: theme.colors.surface }]}><AppText variant="title" style={{ color: theme.colors.brandStrong }}>{items.length ? Math.round((completed / items.length) * 100) : 0}%</AppText></View></LinearGradient>
    <View style={styles.sectionHeading}><View><AppText variant="title">What needs you</AppText><AppText variant="caption" muted>{items.length ? `${items.length - completed - skipped} still to care for` : 'Your day is open'}</AppText></View><ClockIcon size={22} color={theme.colors.textSubtle} weight="duotone" /></View>
    {items.length === 0 ? <Card style={styles.emptyCard}><View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceRaised }]}><PawPrintIcon size={24} color={theme.colors.brandStrong} weight="duotone" /></View><AppText variant="heading">No care moments on this day</AppText><AppText muted>{dayOffset === 0 ? 'Add the first care plan for one of your Pets and it will appear here every day.' : 'Nothing was scheduled or recorded for this day.'}</AppText>{dayOffset === 0 ? <Button label="Open Pets" variant="secondary" onPress={() => router.push('/(tabs)/pets')} /> : null}</Card> : <View style={styles.moments}>{groupedItems.map((group) => <View key={group.label} style={styles.momentGroup}><View style={styles.groupHeader}><AppText variant="caption" muted>{group.label.toUpperCase()}</AppText><AppText variant="caption" muted>{group.items.length} {group.items.length === 1 ? 'moment' : 'moments'}</AppText></View><View style={styles.groupItems}>{group.items.map(({ item, petName }) => <CareMoment key={item.task.id} item={item} petName={petName} date={historicalDate} />)}</View></View>)}</View>}
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
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  alerts: { gap: 8 },
  alertLabel: { letterSpacing: 1.1, marginLeft: 3 },
  alertCard: { minHeight: 68, padding: 11, borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  alertCopy: { flex: 1, gap: 2 },
  alertRetry: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayStrip: { paddingRight: 8 },
  dayRow: { flexDirection: 'row', gap: 8 },
  dayChip: { minHeight: 38, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
  addButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressCard: { minHeight: 168, borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 18, overflow: 'hidden' },
  progressCopy: { flex: 1, gap: 6 },
  progressRing: { width: 86, height: 86, borderRadius: 43, borderWidth: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.42)' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  moments: { gap: 9 },
  momentGroup: { gap: 8 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 3 },
  groupItems: { gap: 9 },
  moment: { minHeight: 78, borderRadius: 19, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  momentMain: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  momentIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  momentCopy: { flex: 1, gap: 3 },
  momentStatus: { width: 25, height: 25, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  skipButton: { minHeight: 38, paddingHorizontal: 9, borderLeftWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  emptyHero: { minHeight: 218, borderRadius: 26, padding: 22, justifyContent: 'flex-end', gap: 9, overflow: 'hidden' },
  setupCard: { gap: 9 },
  setupActions: { gap: 9, marginTop: 5 },
  emptyCard: { gap: 10, alignItems: 'flex-start' },
  emptyIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  historyLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3 },
});
