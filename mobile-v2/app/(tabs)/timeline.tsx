import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { AppText, Button, Card, PageHeader, Screen, SegmentedControl, TextField } from '../../src/ui/components';
import { useTheme } from '../../src/core/providers/theme-provider';
import { useAccessiblePets, useCircles, useInvalidateApi, useTimeline } from '../../src/core/query/hooks';
import { planetApi } from '../../src/core/api/planet-api';
import { timelinePayload, timelineSchema } from '../../src/core/forms';
import { ApiError } from '../../src/core/network/api-client';
import { CalendarDotsIcon, CheckCircleIcon, PlusIcon } from '../../src/ui/icons';

type EventType = 'note' | 'symptom' | 'weight' | 'vaccine' | 'vet_visit';

function eventTitle(type: string) {
  return type === 'vet_visit' ? 'Vet visit' : type.charAt(0).toUpperCase() + type.slice(1);
}

function eventText(payload: Record<string, unknown>) {
  const value = payload.text ?? payload.title ?? payload.detail ?? payload.summary ?? payload.name;
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof payload.weight_g === 'number') return `${payload.weight_g} g`;
  return 'Care record';
}

export default function TimelineRoute() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ petId?: string }>();
  const circles = useCircles();
  const circleIds = circles.data?.circles.map((item) => item.id) ?? [];
  const accessiblePets = useAccessiblePets(circleIds);
  const selectedPetId = typeof params.petId === 'string' ? params.petId : undefined;
  const pet = accessiblePets.pets.find((candidate) => candidate.id === selectedPetId) ?? accessiblePets.pets[0];
  const timeline = useTimeline(pet?.id);
  const invalidate = useInvalidateApi();
  const [eventType, setEventType] = useState<EventType>('note');
  const [text, setText] = useState('');
  const [weight, setWeight] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const create = useMutation({ mutationFn: () => planetApi.pets.createEvent(pet!.id, timelinePayload({ type: eventType, occurred_at: new Date().toISOString(), text, weight_g: weight })), onSuccess: () => { setText(''); setWeight(''); setAdding(false); invalidate.timeline(pet!.id); invalidate.pet(pet!.id); }, onError: (err) => setError(err instanceof ApiError ? err.message : 'Unable to save this record.') });
  function submit() {
    const parsed = timelineSchema.safeParse({ type: eventType, occurred_at: new Date().toISOString(), text, weight_g: eventType === 'weight' ? weight : '' });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the record.'); return; }
    setError(''); create.mutate();
  }
  if (circles.isLoading || accessiblePets.isLoading || (pet && timeline.isLoading)) return <Screen><ActivityIndicator color={theme.colors.brand} /></Screen>;
  if (!pet) return <Screen scroll contentContainerStyle={styles.content}><PageHeader eyebrow="PET / HISTORY" title="The story" /><Card style={styles.empty}><CalendarDotsIcon size={27} color={theme.colors.brandStrong} weight="duotone" /><AppText variant="heading">Choose a Pet first</AppText><AppText muted>Your Pet's notes, visits and patterns will live here.</AppText></Card></Screen>;
  const events = timeline.data?.events ?? [];
  return <Screen scroll contentContainerStyle={styles.content}><PageHeader eyebrow={`${pet.name.toUpperCase()} / HISTORY`} title="The story" /><View style={styles.intro}><View style={[styles.introIcon, { backgroundColor: theme.colors.accentSurface }]}><CalendarDotsIcon size={24} color={theme.colors.accentStrong} weight="duotone" /></View><View style={styles.introCopy}><AppText variant="heading">A living record of {pet.name}</AppText><AppText muted>Keep the details that help you notice, remember and care.</AppText></View></View><Button label={adding ? 'Close record form' : 'Record something'} variant="secondary" icon={<PlusIcon size={17} color={theme.colors.brandStrong} weight="bold" />} onPress={() => { setAdding((value) => !value); setError(''); }} />{adding ? <Card style={styles.form}><AppText variant="title">Add to the story</AppText><SegmentedControl label="What happened?" value={eventType} onChange={setEventType} options={[{ value: 'note', label: 'Note' }, { value: 'symptom', label: 'Symptom' }, { value: 'weight', label: 'Weight' }]} /><TextField label={eventType === 'weight' ? 'Context (optional)' : 'A detail worth keeping'} value={text} onChangeText={(value) => { setText(value); setError(''); }} placeholder={eventType === 'weight' ? 'After a meal, morning weigh-in…' : 'Milo had a good walk'} multiline error={error} />{eventType === 'weight' ? <TextField label="Weight (g)" value={weight} onChangeText={(value) => { setWeight(value); setError(''); }} keyboardType="number-pad" placeholder="5350" /> : null}<Button label="Save record" loading={create.isPending} disabled={eventType === 'weight' ? !weight.trim() : !text.trim()} onPress={submit} /></Card> : null}<View style={styles.sectionHeader}><View><AppText variant="title">Recent notes</AppText><AppText variant="caption" muted>{events.length ? `${events.length} records` : 'The first chapter is waiting'}</AppText></View></View>{events.length === 0 ? <Card style={styles.empty}><CheckCircleIcon size={27} color={theme.colors.brandStrong} weight="duotone" /><AppText variant="heading">Nothing recorded yet</AppText><AppText muted>Start with the small thing you noticed today. It may matter later.</AppText></Card> : <View style={styles.events}>{events.map((event) => <Card key={event.id} style={styles.event}><View style={styles.eventTop}><View style={[styles.eventDot, { backgroundColor: theme.colors.brandSoft }]}><CheckCircleIcon size={17} color={theme.colors.brandStrong} weight="duotone" /></View><View style={styles.eventMeta}><AppText variant="label">{eventTitle(event.type)}</AppText><AppText variant="caption" muted>{new Date(event.occurred_at).toLocaleDateString()} · {event.source === 'user' ? 'Recorded by you' : 'From care'}</AppText></View></View><AppText muted>{eventText(event.payload)}</AppText></Card>)}</View>}</Screen>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 680, alignSelf: 'center', width: '100%', paddingBottom: 140, gap: 16 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  introIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  introCopy: { flex: 1, gap: 3 },
  form: { gap: 13 },
  sectionHeader: { marginTop: 7 },
  events: { gap: 10 },
  event: { gap: 11 },
  eventTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventDot: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  eventMeta: { flex: 1, gap: 2 },
  empty: { gap: 9, alignItems: 'flex-start' },
});
