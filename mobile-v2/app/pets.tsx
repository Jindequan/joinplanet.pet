import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router, useLocalSearchParams, useNavigation, useSegments } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { AppText, Button, Card, DateTimeField, LoadingState, QueryErrorState, Screen, SegmentedControl, StaleDataNotice, TextField } from '../src/ui/components';
import { useTheme } from '../src/core/providers/theme-provider';
import { WorkspaceBar } from '../src/ui/navigation/workspace-bar';
import { useIdempotencyKey } from '../src/core/hooks/use-idempotency-key';
import { useAccessiblePets, useCircles, useInvalidateApi, useTodayForCircles } from '../src/core/query/hooks';
import { planetApi, type Pet } from '../src/core/api/planet-api';
import { ApiError } from '../src/core/network/api-client';
import { petPayload, petSchema } from '../src/core/forms';
import { CalendarDotsIcon, CaretRightIcon, CatIcon, DogIcon, ExportIcon, PawPrintIcon, PlusIcon } from '../src/ui/icons';

const speciesOptions = [{ value: 'dog', label: 'Dog' }, { value: 'cat', label: 'Cat' }, { value: 'other', label: 'Other' }] as const;

function dateKey(value: Date | null) {
  if (!value) return '';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function PetGlyph({ species, color, size = 32 }: { species: Pet['species']; color: string; size?: number }) {
  if (species === 'cat') return <CatIcon size={size} color={color} weight="duotone" />;
  if (species === 'dog') return <DogIcon size={size} color={color} weight="duotone" />;
  return <PawPrintIcon size={size} color={color} weight="duotone" />;
}

type PetTodaySummary = { total: number; completed: number; open: number };

function PetCard({ pet, intent, today }: { pet: Pet; intent?: string; today?: PetTodaySummary }) {
  const { theme } = useTheme();
  const isArchived = Boolean(pet.archived_at);
  return <Pressable accessibilityRole="button" accessibilityLabel={intent === 'care' ? `Add care for ${pet.name}` : intent === 'export' ? `Export ${pet.name}` : `Open ${pet.name}`} onPress={() => router.push({ pathname: '/(tabs)/pet', params: { petId: pet.id, intent: intent === 'care' || intent === 'export' ? intent : undefined } })} style={({ pressed }) => [styles.petCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, isArchived && { opacity: 0.78 }, pressed && { opacity: theme.motion.pressOpacity }]}>
    <LinearGradient colors={isArchived ? [theme.colors.surfaceRaised, theme.colors.surface] : [theme.colors.accentSurface, theme.colors.brandSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.petArt}><PetGlyph species={pet.species} color={isArchived ? theme.colors.textMuted : theme.colors.accentStrong} size={42} /><View style={[styles.pawDot, { backgroundColor: theme.colors.surface }]}><PawPrintIcon size={13} color={isArchived ? theme.colors.textMuted : theme.colors.brandStrong} weight="fill" /></View></LinearGradient>
    <View style={styles.petCopy}><View style={styles.petTitle}><AppText variant="title">{pet.name}</AppText><CaretRightIcon size={21} color={theme.colors.textSubtle} weight="bold" /></View><AppText muted>{pet.breed || (pet.species === 'other' ? 'Pet' : pet.species)} · {isArchived ? 'Memory mode' : 'Active care'}</AppText><View style={styles.petMeta}><View style={styles.metaItem}><CalendarDotsIcon size={15} color={isArchived ? theme.colors.textMuted : theme.colors.brandStrong} weight="duotone" /><AppText variant="caption" muted>{intent === 'care' ? 'Tap to add care' : isArchived ? 'History preserved' : today ? today.total === 0 ? 'No care due today' : `${today.open} open · ${today.completed}/${today.total} done` : 'Care plan'}</AppText></View><AppText variant="caption" muted>{pet.weight_g ? `${(pet.weight_g / 1000).toFixed(1)} kg` : isArchived ? 'History preserved' : 'Profile details'}</AppText></View></View>
  </Pressable>;
}

export default function PetsRouteEntry() {
  const params = useLocalSearchParams<{ intent?: string; familyId?: string; add?: string }>();
  const segments = useSegments();
  if (segments[0] === 'pets') {
    return <Redirect href={{ pathname: '/(tabs)/pets', params: { intent: params.intent, familyId: params.familyId, add: params.add } }} />;
  }
  return <PetsRoute />;
}

function PetsRoute() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ intent?: string; familyId?: string; add?: string }>();
  const circles = useCircles();
  const circleIds = circles.data?.circles.map((item) => item.id) ?? [];
  const accessiblePets = useAccessiblePets(circleIds);
  const directPetIds = accessiblePets.pets
    .filter((pet) => !(pet.family_ids ?? []).some((familyId) => circleIds.includes(familyId)))
    .map((pet) => pet.id);
  const today = useTodayForCircles(circleIds, '', directPetIds);
  const [activeCircleId, setActiveCircleId] = useState<string>();
  useEffect(() => {
    if (typeof params.familyId === 'string' && circleIds.includes(params.familyId)) setActiveCircleId(params.familyId);
  }, [circleIds, params.familyId]);
  const createIntent = useIdempotencyKey();
  const circle = circles.data?.circles.find((item) => item.id === activeCircleId) ?? circles.data?.circles[0] ?? { id: '', name: 'your care space', timezone: '', created_at: '', role: 'viewer' as const };
  const [adding, setAdding] = useState(params.add === '1');
  const canCreatePet = Boolean(circle && circle.role !== 'viewer' && circle.role !== 'read_only');
  const invalidate = useInvalidateApi();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<Pet['species']>('dog');
  const [breed, setBreed] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [sex, setSex] = useState<Pet['sex']>('');
  const [neutered, setNeutered] = useState(false);
  const [weightG, setWeightG] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: adding ? { display: 'none' } : undefined });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [adding, navigation]);
  useEffect(() => {
    if (params.add === '1') {
      setAdding(true);
      setError('');
    }
  }, [params.add]);
  const create = useMutation({
    mutationFn: () => planetApi.pets.create(circle!.id, petPayload({ name, species, breed, birth_date: dateKey(birthDate), sex, neutered, weight_g: weightG }), createIntent.current()),
    onSuccess: (result) => { createIntent.reset(); setName(''); setBreed(''); setBirthDate(null); setSex(''); setNeutered(false); setWeightG(''); setSpecies('dog'); setAdding(false); invalidate.pets(circle!.id); invalidate.circles(); router.push({ pathname: '/(tabs)/pet', params: { petId: result.pet.id, intent: 'care' } }); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Unable to add this Pet.'),
  });
  function submitPet() {
    const parsed = petSchema.safeParse({ name, species, breed, birth_date: dateKey(birthDate), sex, neutered, weight_g: weightG });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Please check the Pet details.'); return; }
    setError(''); create.mutate();
  }
  const retryPets = () => { void circles.refetch(); void accessiblePets.refetch(); void today.refetch(); };
  const blockingError = (circles.isError && !circles.data) || (accessiblePets.isError && !accessiblePets.hasData);
  const hasStaleData = Boolean((circles.isError && circles.data) || (accessiblePets.isError && accessiblePets.hasData) || (today.isError && today.hasData));
  // Keep derived hooks above the loading/error branches. On the first render
  // the queries are loading; putting this useMemo below an early return changes
  // the hook order when data arrives and crashes the Pets tab in production.
  const list = useMemo(() => {
    const visibleFamilyId = activeCircleId ?? (typeof params.familyId === 'string' ? params.familyId : undefined);
    if (!visibleFamilyId) return accessiblePets.pets;
    return accessiblePets.pets.filter((pet) => (pet.family_ids ?? [pet.circle_id]).includes(visibleFamilyId));
  }, [accessiblePets.pets, activeCircleId, params.familyId]);
  if (circles.isLoading || accessiblePets.isLoading) return <Screen><LoadingState label="Loading your Pets" /></Screen>;
  if (blockingError) return <Screen contentContainerStyle={styles.center}><QueryErrorState title="Pets are taking a moment" body="We could not load the Pets you can access." onRetry={retryPets} /></Screen>;
  if (today.isError && !today.hasData) return <Screen contentContainerStyle={styles.center}><QueryErrorState title="Care status is unavailable" body="Your Pet records are here, but today’s care status could not be refreshed." onRetry={retryPets} /></Screen>;
  const todayByPet = new Map(
    today.data.pets.map((pet) => {
      const completed = pet.items.filter((item) => item.log?.status === 'done' || item.log?.status === 'completed').length;
      const skipped = pet.items.filter((item) => item.log?.status === 'skipped').length;
      return [pet.pet_id, { total: pet.items.length, completed, open: pet.items.length - completed - skipped } satisfies PetTodaySummary];
    }),
  );
  if (!circles.data?.circles.length && list.length === 0) return <Screen scroll contentContainerStyle={styles.content}>{hasStaleData ? <StaleDataNotice onRetry={retryPets} /> : null}<AppText variant="caption" muted>YOUR ORBIT / PETS</AppText><AppText variant="display">Start with a care space.</AppText><Card style={styles.emptyCard}><View style={[styles.emptyIcon, { backgroundColor: theme.colors.accentSurface }]}><PawPrintIcon size={27} color={theme.colors.accentStrong} weight="duotone" /></View><AppText variant="heading">Create or join a Family first</AppText><AppText muted>Your Family is the shared boundary that keeps every Pet and every care record in the right hands.</AppText><Button label="Open Family" onPress={() => router.push('/(tabs)/family')} /></Card></Screen>;
  return <Screen scroll contentContainerStyle={styles.content}>{hasStaleData ? <StaleDataNotice onRetry={retryPets} retrying={circles.isFetching || accessiblePets.isFetching || today.isFetching} /> : null}<WorkspaceBar familyName={circle.name} onPressWorkspace={() => router.push('/(tabs)/family')} /><View style={styles.header}><View style={styles.headerCopy}><AppText variant="caption" muted>{list.length ? `${list.length} ACTIVE RECORD${list.length === 1 ? '' : 'S'}` : 'PET RECORDS'}</AppText><AppText variant="display">Pets</AppText><AppText muted>{list.length ? 'Open a Pet to see care, history and people with access.' : 'Add a Pet to start a care plan.'}</AppText></View>{canCreatePet ? <Pressable accessibilityRole="button" accessibilityLabel="Add a Pet" onPress={() => { setAdding(true); setError(''); }} style={({ pressed }) => [styles.floatingAdd, { backgroundColor: theme.colors.brandStrong }, pressed && { opacity: theme.motion.pressOpacity }]}><PlusIcon size={18} color={theme.colors.onBrand} weight="bold" /><AppText variant="label" style={{ color: theme.colors.onBrand }}>Add Pet</AppText></Pressable> : null}</View>{params.intent === 'care' ? <Card style={[styles.intentCard, { backgroundColor: theme.colors.brandSoft }]}><PawPrintIcon size={20} color={theme.colors.brandStrong} weight="duotone" /><View style={styles.intentCopy}><AppText variant="label">Choose a Pet to add care</AppText><AppText variant="caption" muted>Open their record, then add the recurring care item there.</AppText></View></Card> : null}{params.intent === 'export' ? <Card style={[styles.intentCard, { backgroundColor: theme.colors.accentSurface }]}><ExportIcon size={20} color={theme.colors.brandStrong} weight="duotone" /><View style={styles.intentCopy}><AppText variant="label">Choose a Pet to export</AppText><AppText variant="caption" muted>Open the record, then use Manage to export its history.</AppText></View></Card> : null}{circleIds.length > 1 ? <View style={styles.familyPicker}><AppText variant="caption" muted>ADD NEW PET TO</AppText><View style={styles.familyOptions}>{circles.data?.circles.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === circle?.id }} onPress={() => setActiveCircleId(item.id)} style={[styles.familyOption, { borderColor: item.id === circle?.id ? theme.colors.brandStrong : theme.colors.border, backgroundColor: item.id === circle?.id ? theme.colors.brandSoft : theme.colors.surface }]}><AppText variant="label" style={{ color: item.id === circle?.id ? theme.colors.brandStrong : theme.colors.textMuted }}>{item.name}</AppText></Pressable>)}</View></View> : null}{list.length ? <View style={styles.list}>{list.map((pet) => <PetCard key={pet.id} pet={pet} intent={params.intent} today={todayByPet.get(pet.id)} />)}</View> : <Card style={styles.emptyCard}><View style={[styles.emptyIcon, { backgroundColor: theme.colors.accentSurface }]}><PawPrintIcon size={27} color={theme.colors.accentStrong} weight="duotone" /></View><AppText variant="heading">No Pets yet</AppText><AppText muted>Add one and PLANET will give their everyday care a clear place to land.</AppText>{canCreatePet ? <Button label="Add your first Pet" onPress={() => setAdding(true)} /> : <AppText variant="caption" muted>Your Family owner controls Pet creation.</AppText>}</Card>}{adding ? <Card style={styles.form}><View style={styles.formHeader}><View><AppText variant="title">Add a Pet</AppText><AppText variant="caption" muted>Adding to {circle.name}.</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Close add Pet form" onPress={() => setAdding(false)}><AppText variant="label" style={{ color: theme.colors.brandStrong }}>Cancel</AppText></Pressable></View><TextField label="Name" value={name} onChangeText={(value) => { setName(value); setError(''); }} placeholder="Milo" autoFocus /><SegmentedControl label="What kind of Pet?" value={species} onChange={setSpecies} options={speciesOptions} /><TextField label="Breed (optional)" value={breed} onChangeText={(value) => { setBreed(value); setError(''); }} placeholder="Golden retriever" /><DateTimeField label="Birthday (optional)" value={birthDate} onChange={(value) => { setBirthDate(value); setError(''); }} onClear={() => { setBirthDate(null); setError(''); }} placeholder="Choose a date" maximumDate={new Date()} /><SegmentedControl label="Sex" value={sex} onChange={setSex} options={[{ value: '', label: 'Not set' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} /><View style={styles.toggleRow}><View style={styles.toggleCopy}><AppText variant="label">Spayed / neutered</AppText><AppText variant="caption" muted>Keep this detail visible in their profile.</AppText></View><Switch accessibilityLabel="Spayed or neutered" value={neutered} onValueChange={setNeutered} trackColor={{ false: theme.colors.border, true: theme.colors.brand }} thumbColor={theme.colors.surface} /></View><TextField label="Starting weight (g, optional)" value={weightG} onChangeText={(value) => { setWeightG(value.replace(/\D/g, '').slice(0, 6)); setError(''); }} keyboardType="number-pad" placeholder="5350" error={error} /><Button label="Create Pet" loading={create.isPending} disabled={!name.trim()} onPress={submitPet} /></Card> : null}</Screen>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 680, alignSelf: 'center', width: '100%', paddingBottom: 192, gap: 18 },
  center: { justifyContent: 'center', alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  headerCopy: { flex: 1, gap: 5 },
  floatingAdd: { minWidth: 88, height: 48, borderRadius: 17, paddingHorizontal: 12, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  familyPicker: { gap: 8 },
  familyOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  familyOption: { minHeight: 44, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 12 },
  petCard: { minHeight: 144, borderRadius: 24, borderWidth: 1, padding: 12, flexDirection: 'row', gap: 14 },
  petArt: { width: 112, borderRadius: 19, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  pawDot: { position: 'absolute', right: 9, top: 9, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  petCopy: { flex: 1, justifyContent: 'center', gap: 7 },
  petTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  petMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  emptyCard: { gap: 10, alignItems: 'flex-start' },
  intentCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  intentCopy: { flex: 1, gap: 3 },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  form: { gap: 14 },
  toggleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleCopy: { flex: 1, gap: 2 },
  formHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
});
