import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { AppText, Button, Card, LoadingState, QueryErrorState, Screen, StaleDataNotice, ViewFilterBar, type ViewFilter } from '../../src/ui/components';
import { useTheme } from '../../src/core/providers/theme-provider';
import { useAccessiblePets, useAlertsForCircles, useCircles, useInvalidateApi, useMe, useTodayForCircles } from '../../src/core/query/hooks';
import { planetApi, type TodayItem } from '../../src/core/api/planet-api';
import { ApiError } from '../../src/core/network/api-client';
import { useToast } from '../../src/core/providers/toast-provider';
import { readViewPreference, writeViewPreference } from '../../src/core/storage/view-preference';
import { actorLabel } from '../../src/core/presentation/labels';
import { WorkspaceBar } from '../../src/ui/navigation/workspace-bar';
import { CaretRightIcon, CheckIcon, ClockIcon, PawPrintIcon, PlusIcon, SparkleIcon, WarningCircleIcon } from '../../src/ui/icons';

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

function CareMoment({ item, petName, date, canAct, assignedLabel, doneByLabel }: { item: TodayItem; petName: string; date: string; canAct: boolean; assignedLabel: string; doneByLabel?: string }) {
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
    onSuccess: (_result, action) => { void Haptics.impactAsync(action === 'skip' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light); invalidate.todayAll(); invalidate.timeline(item.task.pet_id); showToast({ message: action === 'done' ? 'Care moment marked complete.' : action === 'skip' ? 'Care moment skipped for today.' : 'Care moment reopened.' }); },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'TASK_LOG_EXISTS') {
        invalidate.todayAll();
        showToast({ message: 'This care moment was already recorded. Today has been refreshed.' });
        return;
      }
      showToast({ message: error instanceof ApiError ? error.message : 'That care moment could not be updated.' });
    },
  });
  return <View style={[styles.moment, { backgroundColor: done || skipped ? theme.colors.surfaceRaised : theme.colors.surface, borderColor: done ? theme.colors.brandSoft : theme.colors.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={item.log ? `Undo ${skipped ? 'skip' : 'completion'} of ${item.task.title}` : `Complete ${item.task.title}`} accessibilityState={{ disabled: !canAct }} disabled={mutation.isPending || !canAct} onPress={() => mutation.mutate(item.log ? 'undo' : 'done')} style={({ pressed }) => [styles.momentMain, pressed && { opacity: theme.motion.pressOpacity }, !canAct && { opacity: 0.72 }]}>
      <View style={[styles.momentIcon, { backgroundColor: done ? theme.colors.brand : theme.colors.accentSurface }]}>{done ? <CheckIcon size={19} color={theme.colors.onBrand} weight="bold" /> : <PawPrintIcon size={19} color={theme.colors.accentStrong} weight="duotone" />}</View>
      <View style={styles.momentCopy}><AppText variant="label" style={done || skipped ? { textDecorationLine: 'line-through', color: theme.colors.textMuted } : undefined}>{item.task.title}</AppText><AppText variant="caption" muted>{petName} · {timeLabel(item.task.time_of_day)} · {doneByLabel ? `Done by ${doneByLabel}` : assignedLabel}{skipped ? ' · skipped' : ''}{!canAct ? ' · view only' : ''}</AppText></View>
      <View style={[styles.momentStatus, { borderColor: done ? theme.colors.brand : theme.colors.border, backgroundColor: done ? theme.colors.brand : theme.colors.surface }]}>{done ? <CheckIcon size={14} color={theme.colors.onBrand} weight="bold" /> : skipped ? <AppText variant="caption" muted>—</AppText> : null}</View>
    </Pressable>
    {!item.log && canAct ? <Pressable accessibilityRole="button" accessibilityLabel={`Skip ${item.task.title}`} disabled={mutation.isPending} onPress={() => mutation.mutate('skip')} style={({ pressed }) => [styles.skipButton, { borderColor: theme.colors.border }, pressed && { opacity: theme.motion.pressOpacity }]}><AppText variant="caption" style={{ color: theme.colors.textMuted }}>Skip</AppText></Pressable> : null}
  </View>;
}

export default function TodayRoute() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ petId?: string }>();
  const me = useMe();
  const circles = useCircles();
  const families = circles.data?.circles ?? [];
  const familyIds = families.map((family) => family.id);
  const accessiblePets = useAccessiblePets(familyIds);
  const [filter, setFilter] = useState<ViewFilter>({ kind: 'all' });
  const [careView, setCareView] = useState<'all' | 'mine'>('all');
  const [viewPreferenceLoaded, setViewPreferenceLoaded] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  useEffect(() => {
    const userId = me.data?.user.id;
    if (!userId) return;
    let active = true;
    setViewPreferenceLoaded(false);
    void readViewPreference(userId).then((preference) => {
      if (!active) return;
      if (preference) setFilter(preference);
      setViewPreferenceLoaded(true);
    });
    return () => { active = false; };
  }, [me.data?.user.id]);
  useEffect(() => {
    const routePetId = typeof params.petId === 'string' ? params.petId : undefined;
    if (!routePetId || !viewPreferenceLoaded) return;
    if (accessiblePets.pets.some((pet) => pet.id === routePetId)) setFilter({ kind: 'pet', petId: routePetId });
  }, [accessiblePets.pets, params.petId, viewPreferenceLoaded]);
  const effectiveFilter = useMemo(() => {
    if (filter.kind === 'family' && !familyIds.includes(filter.familyId)) return { kind: 'all' } satisfies ViewFilter;
    if (filter.kind === 'pet' && !accessiblePets.pets.some((pet) => pet.id === filter.petId)) return { kind: 'all' } satisfies ViewFilter;
    return filter;
  }, [accessiblePets.pets, familyIds, filter]);
  const effectiveFilterKey = JSON.stringify(effectiveFilter);
  useEffect(() => {
    const userId = me.data?.user.id;
    if (!userId || !viewPreferenceLoaded) return;
    void writeViewPreference(userId, JSON.parse(effectiveFilterKey) as ViewFilter);
  }, [effectiveFilterKey, me.data?.user.id, viewPreferenceLoaded]);
  const activeFamilyId = effectiveFilter.kind === 'family' ? effectiveFilter.familyId : undefined;
  const displayTimezone = families.find((family) => family.id === activeFamilyId)?.timezone ?? families[0]?.timezone;
  const datesByFamily = useMemo(() => Object.fromEntries(families.map((family) => [family.id, dateKey(dayOffset, family.timezone)])), [dayOffset, families]);
  const historicalDate = dayOffset === 0 ? '' : activeFamilyId ? datesByFamily[activeFamilyId] ?? '' : datesByFamily;
  const visibleDate = dateKey(dayOffset, displayTimezone);
  const directPetIds = useMemo(() => effectiveFilter.kind === 'family' ? [] : accessiblePets.pets.filter((pet) => !(pet.family_ids ?? []).some((familyId) => familyIds.includes(familyId))).map((pet) => pet.id), [accessiblePets.pets, effectiveFilter.kind, familyIds]);
  const today = useTodayForCircles(activeFamilyId ? [activeFamilyId] : familyIds, historicalDate, directPetIds, dayOffset === 0 ? '' : visibleDate);
  const alertsQuery = useAlertsForCircles(dayOffset === 0 ? (activeFamilyId ? [activeFamilyId] : familyIds) : []);
  const pets = useMemo(() => effectiveFilter.kind === 'pet' ? today.data.pets.filter((pet) => pet.pet_id === effectiveFilter.petId) : today.data.pets, [effectiveFilter, today.data.pets]);
  const visibleAlerts = useMemo(() => effectiveFilter.kind === 'pet' ? alertsQuery.alerts.filter((alert) => alert.pet_id === effectiveFilter.petId) : alertsQuery.alerts, [alertsQuery.alerts, effectiveFilter]);
  const canActOnPet = (petId: string) => {
    const accessiblePet = accessiblePets.pets.find((candidate) => candidate.id === petId);
    if (!accessiblePet) return false;
    if (accessiblePet.access_role) return accessiblePet.access_role !== 'viewer' && accessiblePet.access_role !== 'read_only';
    if (accessiblePet.current_owner_user_id === me.data?.user.id) return true;
    const linkedFamilyIds = accessiblePet.family_ids?.length ? accessiblePet.family_ids : [accessiblePet.circle_id];
    const roles = families.filter((family) => linkedFamilyIds.includes(family.id)).map((family) => family.role).filter(Boolean);
    return roles.some((role) => role !== 'viewer' && role !== 'read_only');
  };
  const allItems = pets.flatMap((pet) => pet.items.map((item) => {
    const assignedLabel = item.task.assigned_to_user_id
      ? item.task.assigned_to_user_id === me.data?.user.id
        ? 'Assigned to you'
        : item.task.assigned_to_name
          ? `Assigned to ${item.task.assigned_to_name}`
          : 'Assigned to a caregiver'
      : 'Anyone can help';
    return { item, petName: pet.pet_name, date: dateKey(dayOffset, item.task.timezone || displayTimezone), canAct: canActOnPet(pet.pet_id), assignedLabel, doneByLabel: item.log ? actorLabel(item.log.done_by, me.data?.user.id, item.log.done_by_name) : undefined, assignedToMe: item.task.assigned_to_user_id === me.data?.user.id };
  }));
  const items = careView === 'mine' ? allItems.filter(({ assignedToMe, item }) => assignedToMe || item.log?.done_by === me.data?.user.id) : allItems;
  const canAddCare = accessiblePets.pets.some((pet) => canActOnPet(pet.id));
  const completed = items.filter(({ item }) => item.log?.status === 'done' || item.log?.status === 'completed').length;
  const skipped = items.filter(({ item }) => item.log?.status === 'skipped').length;
  const openCount = items.length - completed - skipped;
  const openItems = items.filter(({ item }) => !item.log);
  const skippedItems = items.filter(({ item }) => item.log?.status === 'skipped');
  const completedItems = items.filter(({ item }) => item.log?.status === 'done' || item.log?.status === 'completed');
  const groupItems = (source: typeof items) => (['Morning', 'Afternoon', 'Evening', 'Any time'] as const)
    .map((label) => ({ label, items: source.filter(({ item }) => carePeriod(item.task.time_of_day) === label) }))
    .filter((group) => group.items.length > 0);
  const groupedOpenItems = groupItems(openItems);
  const groupedSkippedItems = groupItems(skippedItems);
  const groupedCompletedItems = groupItems(completedItems);
  type MomentGroups = ReturnType<typeof groupItems>;
  const renderGroups = (groups: MomentGroups) => groups.map((group) => <View key={group.label} style={styles.momentGroup}><View style={styles.groupHeader}><AppText variant="caption" muted>{group.label.toUpperCase()}</AppText><AppText variant="caption" muted>{group.items.length} {group.items.length === 1 ? 'moment' : 'moments'}</AppText></View><View style={styles.groupItems}>{group.items.map(({ item, petName, date, canAct, assignedLabel, doneByLabel }) => <CareMoment key={item.task.id} item={item} petName={petName} date={date} canAct={canAct} assignedLabel={assignedLabel} doneByLabel={doneByLabel} />)}</View></View>);
  const displayName = me.data?.user.display_name?.trim();
  const emailLocalPart = me.data?.user.email?.split('@')[0]?.trim();
  const firstName = displayName && displayName !== emailLocalPart ? displayName.split(' ')[0] : '';
  const workspaceFamilyName = effectiveFilter.kind === 'family'
    ? families.find((family) => family.id === effectiveFilter.familyId)?.name
    : families.length === 1 ? families[0]?.name : undefined;
  const workspacePetName = effectiveFilter.kind === 'pet'
    ? accessiblePets.pets.find((pet) => pet.id === effectiveFilter.petId)?.name
    : undefined;
  const openCareSetup = () => {
    if (accessiblePets.pets.length === 1) {
      router.push({ pathname: '/(tabs)/pet', params: { petId: accessiblePets.pets[0]?.id, intent: 'care' } });
      return;
    }
    router.push({ pathname: '/(tabs)/pets', params: { intent: 'care' } });
  };

  const retryToday = () => { void me.refetch(); void circles.refetch(); void accessiblePets.refetch(); void today.refetch(); };
  const blockingError = (me.isError && !me.data) || (circles.isError && !circles.data) || (accessiblePets.isError && !accessiblePets.hasData) || (today.isError && !today.hasData);
  const hasStaleData = Boolean((me.isError && me.data) || (circles.isError && circles.data) || (accessiblePets.isError && accessiblePets.hasData) || (today.isError && today.hasData));
  if (circles.isLoading || accessiblePets.isLoading || today.isLoading || me.isLoading) return <Screen><LoadingState label="Loading today’s care" /></Screen>;
  if (blockingError) return <Screen contentContainerStyle={styles.center}><QueryErrorState title="Today is waiting" body="We could not reach your care plan right now." onRetry={retryToday} /></Screen>;

  if (families.length === 0 && accessiblePets.pets.length === 0) return <Screen scroll contentContainerStyle={styles.content}><View style={styles.welcomeTop}><View style={styles.welcomeCopy}><AppText variant="caption" muted>PLANET / TODAY</AppText><AppText variant="display">Build your care space.</AppText></View><View style={[styles.avatar, { backgroundColor: theme.colors.brandSoft }]}><SparkleIcon size={21} color={theme.colors.brandStrong} weight="duotone" /></View></View><LinearGradient colors={[theme.colors.brandStrong, theme.colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyHero}><PawPrintIcon size={30} color={theme.colors.onBrand} weight="duotone" /><AppText variant="title" style={{ color: theme.colors.onBrand }}>Start with the people and Pet you care about.</AppText><AppText style={{ color: theme.colors.onBrandSoft }}>Create a Family or join one with an invite. Today will become useful as soon as there is a shared care space.</AppText></LinearGradient><Card style={styles.setupCard}><AppText variant="heading">Choose your starting point</AppText><AppText muted>Create a shared space for the people, Pets and care that belong together.</AppText><View style={styles.setupActions}><Button label="Create a Family" onPress={() => router.push({ pathname: '/(tabs)/family', params: { mode: 'create' } })} /><Button label="Join with an invite" variant="secondary" onPress={() => router.push({ pathname: '/(tabs)/family', params: { mode: 'join' } })} /></View></Card></Screen>;

  if (accessiblePets.pets.length === 0) return <Screen scroll contentContainerStyle={styles.content}><View style={styles.welcomeTop}><View><AppText variant="caption" muted>PLANET / TODAY</AppText><AppText variant="display">Your space is ready.</AppText></View><View style={[styles.avatar, { backgroundColor: theme.colors.brandSoft }]}><CheckIcon size={21} color={theme.colors.brandStrong} weight="bold" /></View></View><LinearGradient colors={[theme.colors.accentSurface, theme.colors.brandSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.readyHero}><AppText variant="caption" style={{ color: theme.colors.accentStrong }}>FIRST CARE SETUP</AppText><AppText variant="title">Add the Pet who makes this place matter.</AppText><AppText muted>{families[0]?.name ?? 'Your Family'} is ready. One Pet and one care plan will turn this empty day into something useful.</AppText></LinearGradient><Card style={styles.setupCard}><AppText variant="heading">A clear beginning</AppText><View style={styles.setupSteps}><View style={styles.setupStep}><View style={[styles.stepMark, { backgroundColor: theme.colors.brand }]}><CheckIcon size={15} color={theme.colors.onBrand} weight="bold" /></View><View style={styles.stepCopy}><AppText variant="label">Family created</AppText><AppText variant="caption" muted>{families[0]?.name ?? 'Your Family'} · shared care space</AppText></View></View><View style={styles.setupStep}><View style={[styles.stepMark, { backgroundColor: theme.colors.accentSurface }]}><PawPrintIcon size={16} color={theme.colors.accentStrong} weight="duotone" /></View><View style={styles.stepCopy}><AppText variant="label">Add your first Pet</AppText><AppText variant="caption" muted>Their profile and routines live together.</AppText></View></View></View><Button label="Add a Pet" onPress={() => router.push('/(tabs)/pets')} /><Button label="Invite someone to help" variant="secondary" onPress={() => router.push('/(tabs)/family')} /></Card></Screen>;

  return <Screen scroll contentContainerStyle={styles.content}>
    <WorkspaceBar familyName={workspaceFamilyName} petName={workspacePetName} onPressWorkspace={() => router.push('/(tabs)/family')} />
    <View style={styles.header}><View style={styles.headerCopy}><AppText variant="caption" muted>{dateLabel(visibleDate).toUpperCase()}</AppText><AppText variant="display">Today</AppText><AppText muted>{completed === items.length && items.length > 0 ? 'Everything important is cared for.' : dayOffset === 0 ? firstName ? `Here is what needs attention, ${firstName}.` : 'Here is what needs attention today.' : 'Review or complete a recent care moment.'}</AppText></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}><View style={styles.dayRow}>{[0, -1, -2, -3, -4, -5, -6].map((offset) => { const value = dateKey(offset, displayTimezone); const selected = offset === dayOffset; return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setDayOffset(offset)} style={[styles.dayChip, { borderColor: selected ? theme.colors.brandStrong : theme.colors.border, backgroundColor: selected ? theme.colors.brandStrong : theme.colors.surface }]}><AppText variant="caption" style={{ color: selected ? theme.colors.onBrand : theme.colors.textMuted }}>{shortDateLabel(value, offset)}</AppText></Pressable>; })}</View></ScrollView>
    <View style={styles.filterRow}><View style={styles.filterGrow}><ViewFilterBar value={effectiveFilter} families={families} pets={accessiblePets.pets} onChange={setFilter} /></View>{canAddCare ? <Pressable accessibilityRole="button" accessibilityLabel={accessiblePets.pets.length === 1 ? 'Add care' : 'Choose a Pet for care'} onPress={openCareSetup} style={({ pressed }) => [styles.addButton, { backgroundColor: theme.colors.brandStrong }, pressed && { opacity: theme.motion.pressOpacity }]}><PlusIcon size={17} color={theme.colors.onBrand} weight="bold" /><AppText variant="label" style={{ color: theme.colors.onBrand }}>Add care</AppText></Pressable> : null}</View>
    <View style={styles.careViewRow}><AppText variant="caption" muted>CARE VIEW</AppText><View style={[styles.careViewToggle, { backgroundColor: theme.colors.brandSoft }]}><Pressable accessibilityRole="button" accessibilityLabel="Show all care" accessibilityState={{ selected: careView === 'all' }} onPress={() => setCareView('all')} style={[styles.careViewOption, careView === 'all' && { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}><AppText variant="caption" style={{ color: careView === 'all' ? theme.colors.text : theme.colors.textMuted }}>All care</AppText></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Show my care" accessibilityState={{ selected: careView === 'mine' }} onPress={() => setCareView('mine')} style={[styles.careViewOption, careView === 'mine' && { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}><AppText variant="caption" style={{ color: careView === 'mine' ? theme.colors.text : theme.colors.textMuted }}>My care</AppText></Pressable></View></View>
    {hasStaleData ? <StaleDataNotice onRetry={retryToday} retrying={circles.isFetching || accessiblePets.isLoading || today.isLoading || me.isFetching} /> : null}
    {visibleAlerts.length ? <View style={styles.alerts}><AppText variant="caption" muted style={styles.alertLabel}>NEEDS A CLOSER LOOK</AppText>{visibleAlerts.slice(0, 3).map((alert) => <AlertCard key={alert.id} title={alert.title} body={alert.body} petName={alert.pet_name} severity={alert.severity} onPress={() => router.push({ pathname: '/(tabs)/timeline', params: { petId: alert.pet_id } })} />)}</View> : alertsQuery.isError ? <View style={styles.alertRetry}><AppText variant="caption" muted>We could not check for care alerts.</AppText><Button label="Retry" variant="ghost" onPress={() => void alertsQuery.refetch()} /></View> : null}
    {items.length > 0 ? <><View style={[styles.progressCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={styles.progressHeader}><View style={styles.progressCopy}><AppText variant="caption" style={{ color: theme.colors.accentStrong }}>TODAY'S CARE</AppText><AppText variant="title">{completed} of {items.length} done</AppText></View><AppText variant="title" style={{ color: theme.colors.brandStrong }}>{Math.round((completed / items.length) * 100)}%</AppText></View><View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceRaised }]}><View style={[styles.progressFill, { backgroundColor: theme.colors.brandStrong, width: `${Math.round((completed / items.length) * 100)}%` }]} /></View><AppText variant="caption" muted>{completed === items.length ? 'Everything important is cared for.' : skipped ? `${skipped} skipped · ${openCount} still open` : 'Small actions add up to a cared-for life.'}</AppText></View>{openCount > 0 ? <View style={styles.sectionHeading}><View><AppText variant="title">What needs you</AppText><AppText variant="caption" muted>{openCount} still to care for</AppText></View><ClockIcon size={22} color={theme.colors.textSubtle} weight="duotone" /></View> : skipped > 0 ? <View style={styles.sectionHeading}><View><AppText variant="title">Still to revisit</AppText><AppText variant="caption" muted>{skipped} skipped today</AppText></View><ClockIcon size={22} color={theme.colors.warning} weight="duotone" /></View> : <View style={styles.sectionHeading}><View><AppText variant="title">All caught up</AppText><AppText variant="caption" muted>{completed} {completed === 1 ? 'care moment' : 'care moments'} completed</AppText></View><CheckIcon size={22} color={theme.colors.brandStrong} weight="bold" /></View>}</> : null}
    {items.length === 0 ? <Card style={styles.emptyCard}><View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceRaised }]}><PawPrintIcon size={24} color={theme.colors.brandStrong} weight="duotone" /></View><AppText variant="heading">{careView === 'mine' && allItems.length > 0 ? 'No care assigned to you' : dayOffset === 0 ? 'Give today a first care moment' : 'No care moments on this day'}</AppText><AppText muted>{careView === 'mine' && allItems.length > 0 ? 'Switch to All care to see the full shared plan.' : dayOffset === 0 ? 'Choose a simple routine and it will appear here whenever it is due.' : 'Nothing was scheduled or recorded for this day.'}</AppText>{careView === 'mine' && allItems.length > 0 ? <Button label="Show all care" variant="secondary" onPress={() => setCareView('all')} /> : dayOffset === 0 && canAddCare ? <Button label={accessiblePets.pets.length === 1 ? 'Add first care plan' : 'Choose a Pet'} variant="secondary" onPress={openCareSetup} /> : dayOffset === 0 ? <AppText variant="caption" muted>Care plans are managed by a Pet owner or caregiver.</AppText> : null}</Card> : <View style={styles.moments}>{openCount > 0 ? renderGroups(groupedOpenItems) : null}{skipped > 0 ? <View style={styles.statusSection}><View style={styles.statusSectionHeading}><AppText variant="caption" muted>SKIPPED TODAY</AppText></View>{renderGroups(groupedSkippedItems)}</View> : null}{completed > 0 ? <View style={styles.statusSection}><View style={styles.statusSectionHeading}><AppText variant="caption" muted>COMPLETED TODAY</AppText></View>{renderGroups(groupedCompletedItems)}</View> : null}</View>}
    <Pressable accessibilityRole="button" accessibilityLabel="Open care Journal" onPress={() => { const historyPetId = effectiveFilter.kind === 'pet' ? effectiveFilter.petId : items.length === 1 ? items[0]?.item.task.pet_id : undefined; router.push({ pathname: '/(tabs)/timeline', params: historyPetId ? { petId: historyPetId } : { choosePet: '1' } }); }} style={({ pressed }) => [styles.historyLink, pressed && { opacity: theme.motion.pressOpacity }]}><AppText variant="label" style={{ color: theme.colors.brandStrong }}>{effectiveFilter.kind === 'pet' || items.length === 1 ? 'Open care Journal' : 'Choose a Pet for Journal'}</AppText><CaretRightIcon size={18} color={theme.colors.brandStrong} weight="bold" /></Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 680, alignSelf: 'center', width: '100%', paddingBottom: 192, gap: 18 },
  center: { justifyContent: 'center', alignItems: 'stretch' },
  welcomeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  welcomeCopy: { flex: 1, minWidth: 0, gap: 5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 },
  headerCopy: { flex: 1, gap: 5 },
  avatar: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  filterGrow: { flex: 1 },
  careViewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 2 },
  careViewToggle: { flexDirection: 'row', gap: 3, padding: 4, borderRadius: 13 },
  careViewOption: { minHeight: 40, minWidth: 78, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  alerts: { gap: 8 },
  alertLabel: { letterSpacing: 1.1, marginLeft: 3 },
  alertCard: { minHeight: 68, padding: 11, borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  alertCopy: { flex: 1, gap: 2 },
  alertRetry: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayStrip: { paddingRight: 8 },
  dayRow: { flexDirection: 'row', gap: 8 },
  dayChip: { minHeight: 44, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
  addButton: { minHeight: 48, paddingHorizontal: 11, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  progressCard: { minHeight: 126, borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  progressCopy: { flex: 1, gap: 3 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  moments: { gap: 9 },
  statusSection: { gap: 9, marginTop: 4 },
  statusSectionHeading: { paddingHorizontal: 3 },
  momentGroup: { gap: 8 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 3 },
  groupItems: { gap: 9 },
  moment: { minHeight: 78, borderRadius: 19, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  momentMain: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  momentIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  momentCopy: { flex: 1, gap: 3 },
  momentStatus: { width: 25, height: 25, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  skipButton: { minHeight: 44, paddingHorizontal: 9, borderLeftWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  emptyHero: { minHeight: 218, borderRadius: 26, padding: 22, justifyContent: 'flex-end', gap: 9, overflow: 'hidden' },
  readyHero: { minHeight: 190, borderRadius: 26, padding: 22, justifyContent: 'flex-end', gap: 9, overflow: 'hidden' },
  setupCard: { gap: 9 },
  setupActions: { gap: 9, marginTop: 5 },
  setupSteps: { gap: 12, paddingVertical: 4 },
  setupStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepMark: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepCopy: { flex: 1, gap: 2 },
  emptyCard: { gap: 10, alignItems: 'flex-start' },
  emptyIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  historyLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3 },
});
