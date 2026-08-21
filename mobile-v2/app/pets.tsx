import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { AppText, Button, Card, QueryErrorState, Screen, SegmentedControl, TextField } from '../src/ui/components';
import { useTheme } from '../src/core/providers/theme-provider';
import { useAccessiblePets, useCircles, useInvalidateApi, useTasks } from '../src/core/query/hooks';
import { planetApi, type Pet } from '../src/core/api/planet-api';
import { ApiError } from '../src/core/network/api-client';
import { petPayload, petSchema } from '../src/core/forms';
import { CalendarDotsIcon, CaretRightIcon, CatIcon, DogIcon, PawPrintIcon, PlusIcon } from '../src/ui/icons';

const speciesOptions = [{ value: 'dog', label: 'Dog' }, { value: 'cat', label: 'Cat' }, { value: 'other', label: 'Other' }] as const;

function PetGlyph({ species, color, size = 32 }: { species: Pet['species']; color: string; size?: number }) {
  if (species === 'cat') return <CatIcon size={size} color={color} weight="duotone" />;
  return <DogIcon size={size} color={color} weight="duotone" />;
}

function PetCard({ pet }: { pet: Pet }) {
  const { theme } = useTheme();
  const tasks = useTasks(pet.id);
  const count = tasks.data?.tasks.length ?? 0;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${pet.name}`} onPress={() => router.push({ pathname: '/(tabs)/pet', params: { petId: pet.id } })} style={({ pressed }) => [styles.petCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, pressed && { opacity: theme.motion.pressOpacity }]}>
    <LinearGradient colors={[theme.colors.accentSurface, theme.colors.brandSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.petArt}><PetGlyph species={pet.species} color={theme.colors.accentStrong} size={42} /><View style={[styles.pawDot, { backgroundColor: theme.colors.surface }]}><PawPrintIcon size={13} color={theme.colors.brandStrong} weight="fill" /></View></LinearGradient>
    <View style={styles.petCopy}><View style={styles.petTitle}><AppText variant="title">{pet.name}</AppText><CaretRightIcon size={21} color={theme.colors.textSubtle} weight="bold" /></View><AppText muted>{pet.breed || (pet.species === 'other' ? 'Pet' : pet.species)} · {pet.archived_at ? 'Memory mode' : 'Active care'}</AppText><View style={styles.petMeta}><View style={styles.metaItem}><CalendarDotsIcon size={15} color={theme.colors.brandStrong} weight="duotone" /><AppText variant="caption" muted>{count} {count === 1 ? 'routine' : 'routines'}</AppText></View><AppText variant="caption" muted>{pet.weight_g ? `${(pet.weight_g / 1000).toFixed(1)} kg` : 'Profile in progress'}</AppText></View></View>
  </Pressable>;
}

export default function PetsRoute() {
  const { theme } = useTheme();
  const circles = useCircles();
  const circleIds = circles.data?.circles.map((item) => item.id) ?? [];
  const accessiblePets = useAccessiblePets(circleIds);
  const [activeCircleId, setActiveCircleId] = useState<string>();
  const circle = circles.data?.circles.find((item) => item.id === activeCircleId) ?? circles.data?.circles[0];
  const invalidate = useInvalidateApi();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<Pet['species']>('dog');
  const [breed, setBreed] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<Pet['sex']>('');
  const [neutered, setNeutered] = useState(false);
  const [weightG, setWeightG] = useState('');
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () => planetApi.pets.create(circle!.id, petPayload({ name, species, breed, birth_date: birthDate, sex, neutered, weight_g: weightG })),
    onSuccess: (result) => { setName(''); setBreed(''); setBirthDate(''); setSex(''); setNeutered(false); setWeightG(''); setSpecies('dog'); setAdding(false); invalidate.pets(circle!.id); invalidate.circles(); router.push({ pathname: '/(tabs)/pet', params: { petId: result.pet.id } }); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Unable to add this Pet.'),
  });
  function submitPet() {
    const parsed = petSchema.safeParse({ name, species, breed, birth_date: birthDate, sex, neutered, weight_g: weightG });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Please check the Pet details.'); return; }
    setError(''); create.mutate();
  }
  if (circles.isLoading || accessiblePets.isLoading) return <Screen><ActivityIndicator color={theme.colors.brand} /></Screen>;
  if (circles.isError || accessiblePets.isError) return <Screen contentContainerStyle={styles.center}><QueryErrorState title="Pets are taking a moment" body="We could not load the Pet records you can access." onRetry={() => { void circles.refetch(); void accessiblePets.refetch(); }} /></Screen>;
  if (!circle) return <Screen scroll contentContainerStyle={styles.content}><AppText variant="caption" muted>YOUR ORBIT / PETS</AppText><AppText variant="display">Start with a Pet.</AppText><Card style={styles.emptyCard}><View style={[styles.emptyIcon, { backgroundColor: theme.colors.accentSurface }]}><PawPrintIcon size={27} color={theme.colors.accentStrong} weight="duotone" /></View><AppText variant="heading">Your care world is waiting</AppText><AppText muted>Create a Family first so the right people can share the right care.</AppText><Button label="Open Family" onPress={() => router.push('/(tabs)/family')} /></Card></Screen>;
  const list = accessiblePets.pets;
  return <Screen scroll contentContainerStyle={styles.content}><View style={styles.header}><View style={styles.headerCopy}><AppText variant="caption" muted>YOUR ORBIT / PETS</AppText><AppText variant="display">The little worlds.</AppText><AppText muted>{list.length ? `${list.length} Pet${list.length === 1 ? '' : 's'} · each one with a life of their own` : 'A focused home for every Pet you care for.'}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Add a Pet" onPress={() => { setAdding(true); setError(''); }} style={({ pressed }) => [styles.floatingAdd, { backgroundColor: theme.colors.brandStrong }, pressed && { opacity: theme.motion.pressOpacity }]}><PlusIcon size={20} color={theme.colors.onBrand} weight="bold" /></Pressable></View>{circleIds.length > 1 ? <View style={styles.familyPicker}><AppText variant="caption" muted>ADD NEW PET TO</AppText><View style={styles.familyOptions}>{circles.data?.circles.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === circle?.id }} onPress={() => setActiveCircleId(item.id)} style={[styles.familyOption, { borderColor: item.id === circle?.id ? theme.colors.brandStrong : theme.colors.border, backgroundColor: item.id === circle?.id ? theme.colors.brandSoft : theme.colors.surface }]}><AppText variant="label" style={{ color: item.id === circle?.id ? theme.colors.brandStrong : theme.colors.textMuted }}>{item.name}</AppText></Pressable>)}</View></View> : null}{list.length ? <View style={styles.list}>{list.map((pet) => <PetCard key={pet.id} pet={pet} />)}</View> : <Card style={styles.emptyCard}><View style={[styles.emptyIcon, { backgroundColor: theme.colors.accentSurface }]}><PawPrintIcon size={27} color={theme.colors.accentStrong} weight="duotone" /></View><AppText variant="heading">No Pets yet</AppText><AppText muted>Add one and PLANET will give their everyday care a clear place to land.</AppText><Button label="Add your first Pet" onPress={() => setAdding(true)} /></Card>}{adding ? <Card style={styles.form}><View style={styles.formHeader}><View><AppText variant="title">Welcome a Pet</AppText><AppText variant="caption" muted>Adding to {circle.name}.</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Close add Pet form" onPress={() => setAdding(false)}><AppText variant="label" style={{ color: theme.colors.brandStrong }}>Cancel</AppText></Pressable></View><TextField label="Name" value={name} onChangeText={(value) => { setName(value); setError(''); }} placeholder="Milo" autoFocus /><SegmentedControl label="What kind of Pet?" value={species} onChange={setSpecies} options={speciesOptions} /><TextField label="Breed (optional)" value={breed} onChangeText={setBreed} placeholder="Golden retriever" /><TextField label="Birthday (optional)" value={birthDate} onChangeText={(value) => { setBirthDate(value); setError(''); }} placeholder="YYYY-MM-DD" hint="Use the date you know; you can leave it blank." /><SegmentedControl label="Sex" value={sex} onChange={setSex} options={[{ value: '', label: 'Not set' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} /><View style={styles.toggleRow}><View style={styles.toggleCopy}><AppText variant="label">Spayed / neutered</AppText><AppText variant="caption" muted>Keep this detail visible in their profile.</AppText></View><Switch accessibilityLabel="Spayed or neutered" value={neutered} onValueChange={setNeutered} trackColor={{ false: theme.colors.border, true: theme.colors.brand }} thumbColor={theme.colors.surface} /></View><TextField label="Starting weight (g, optional)" value={weightG} onChangeText={(value) => { setWeightG(value.replace(/\D/g, '').slice(0, 6)); setError(''); }} keyboardType="number-pad" placeholder="5350" error={error} /><Button label="Create Pet" loading={create.isPending} disabled={!name.trim()} onPress={submitPet} /></Card> : null}<View style={styles.footerNote}><PawPrintIcon size={15} color={theme.colors.textSubtle} weight="duotone" /><AppText variant="caption" muted>Every Pet stays a first-class life record—not a task list.</AppText></View></Screen>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 680, alignSelf: 'center', width: '100%', paddingBottom: 140, gap: 18 },
  center: { justifyContent: 'center', alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  headerCopy: { flex: 1, gap: 5 },
  floatingAdd: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  familyPicker: { gap: 8 },
  familyOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  familyOption: { minHeight: 38, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 12 },
  petCard: { minHeight: 144, borderRadius: 24, borderWidth: 1, padding: 12, flexDirection: 'row', gap: 14 },
  petArt: { width: 112, borderRadius: 19, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  pawDot: { position: 'absolute', right: 9, top: 9, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  petCopy: { flex: 1, justifyContent: 'center', gap: 7 },
  petTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  petMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  emptyCard: { gap: 10, alignItems: 'flex-start' },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  form: { gap: 14 },
  toggleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleCopy: { flex: 1, gap: 2 },
  formHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  footerNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
});
