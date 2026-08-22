import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import {
  AppText,
  Button,
  Card,
  DateTimeField,
  LoadingState,
  PageHeader,
  PetFilterSelector,
  QueryErrorState,
  Screen,
  SegmentedControl,
  StaleDataNotice,
  TextField,
} from "../../src/ui/components";
import { useTheme } from "../../src/core/providers/theme-provider";
import { WorkspaceBar } from "../../src/ui/navigation/workspace-bar";
import { useToast } from "../../src/core/providers/toast-provider";
import { useIdempotencyKey } from "../../src/core/hooks/use-idempotency-key";
import {
  useAccessiblePets,
  useCircles,
  useInvalidateApi,
  useMe,
  useTimeline,
} from "../../src/core/query/hooks";
import { planetApi, type TimelineEvent } from "../../src/core/api/planet-api";
import { timelinePayload, timelineSchema } from "../../src/core/forms";
import { ApiError } from "../../src/core/network/api-client";
import {
  BookOpenIcon,
  CalendarDotsIcon,
  CheckCircleIcon,
  DotsThreeIcon,
  PlusIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  WarningCircleIcon,
  XIcon,
} from "../../src/ui/icons";
import { actorLabel } from "../../src/core/presentation/labels";

type EventType = "note" | "symptom" | "weight" | "vaccine" | "vet_visit";
type TimelineFilter = "all" | "notes" | "health" | "care";

function eventTitle(type: string, payload?: Record<string, unknown>) {
  const labels: Record<string, string> = {
    note: "Note",
    symptom: "Symptom",
    weight: "Weight",
    vaccine: "Vaccine",
    vet_visit: "Vet visit",
    care_task_completed: "Care completed",
    care_task_undone: "Care completion undone",
    medication: "Medication update",
    transfer: "Pet handoff",
  };
  if (type === "care_task_completed" && typeof payload?.title === "string" && payload.title.trim()) return `Completed: ${payload.title}`;
  if (type === "care_task_undone" && typeof payload?.title === "string" && payload.title.trim()) return `Reopened: ${payload.title}`;
  if (labels[type]) return labels[type];
  const readable = type.replace(/[_-]+/g, " ").trim();
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : "Care record";
}

function eventText(payload: Record<string, unknown>) {
  const value =
    payload.text ??
    payload.title ??
    payload.detail ??
    payload.summary ??
    payload.name;
  if (typeof value === "string" && value.trim()) return value;
  if (typeof payload.weight_g === "number") return `${payload.weight_g} g`;
  return "Care record";
}

function eventBucket(event: TimelineEvent): TimelineFilter {
  if (event.source === "care" || event.source?.startsWith("auto:care") || event.type === "care_task_completed" || event.type === "care_task_undone") return "care";
  if (event.type === "note" || event.type === "symptom") return "notes";
  return "health";
}

function EventGlyph({ event }: { event: TimelineEvent }) {
  const { theme } = useTheme();
  if (event.source !== "user") return <CheckCircleIcon size={18} color={theme.colors.brandStrong} weight="duotone" />;
  if (event.type === "symptom") return <WarningCircleIcon size={18} color={theme.colors.warning} weight="duotone" />;
  if (event.type === "vaccine") return <ShieldCheckIcon size={18} color={theme.colors.brandStrong} weight="duotone" />;
  if (event.type === "vet_visit") return <StethoscopeIcon size={18} color={theme.colors.accentStrong} weight="duotone" />;
  if (event.type === "note") return <BookOpenIcon size={18} color={theme.colors.brandStrong} weight="duotone" />;
  return <CalendarDotsIcon size={18} color={theme.colors.lavender} weight="duotone" />;
}

function eventDayLabel(value: string, timeZone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Earlier";
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

export default function TimelineRoute() {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const navigation = useNavigation();
  const me = useMe();
  const params = useLocalSearchParams<{ petId?: string; choosePet?: string }>();
  const circles = useCircles();
  const circleIds = circles.data?.circles.map((item) => item.id) ?? [];
  const accessiblePets = useAccessiblePets(circleIds);
  const selectedPetId =
    typeof params.petId === "string" ? params.petId : undefined;
  const choosePet = params.choosePet === "1";
  const [timelinePetId, setTimelinePetId] = useState<string | undefined>(
    selectedPetId,
  );
  const routePetId = useRef(selectedPetId);
  const activePetId =
    (timelinePetId && accessiblePets.pets.some((candidate) => candidate.id === timelinePetId)
      ? timelinePetId
      : undefined) ??
    (selectedPetId && accessiblePets.pets.some((candidate) => candidate.id === selectedPetId)
      ? selectedPetId
      : undefined) ??
    (choosePet || accessiblePets.pets.length > 1
      ? undefined
      : accessiblePets.pets[0]?.id);
  const pet =
    accessiblePets.pets.find((candidate) => candidate.id === activePetId) ??
    accessiblePets.pets[0];
  const petFamily = pet
    ? circles.data?.circles.find((circle) => (pet.family_ids ?? [pet.circle_id]).includes(circle.id))
    : undefined;
  const petTimeZone = petFamily?.timezone || undefined;
  const timeline = useTimeline(pet?.id);
  const invalidate = useInvalidateApi();
  const [eventType, setEventType] = useState<EventType>("note");
  const [text, setText] = useState("");
  const [weight, setWeight] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventMenuId, setEventMenuId] = useState<string | null>(null);
  const [confirmEventId, setConfirmEventId] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState(new Date());
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [olderEvents, setOlderEvents] = useState<TimelineEvent[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const createIntent = useIdempotencyKey();

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: adding ? { display: "none" } : undefined });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [adding, navigation]);

  // Journal is a tab route that stays mounted. A deep link from Today must
  // win over the last locally selected Pet, otherwise an alert can open the
  // wrong story after the user has browsed another Pet.
  useEffect(() => {
    if (!selectedPetId || selectedPetId === routePetId.current) return;
    routePetId.current = selectedPetId;
    setTimelinePetId(selectedPetId);
    setAdding(false);
    setError("");
  }, [selectedPetId]);
  const create = useMutation({
    mutationFn: () =>
      planetApi.pets.createEvent(
        pet!.id,
        timelinePayload({
          type: eventType,
          occurred_at: occurredAt.toISOString(),
          text,
          weight_g: weight,
        }),
        createIntent.current(),
      ),
    onSuccess: () => {
      setText("");
      setWeight("");
      setOccurredAt(new Date());
      setAdding(false);
      createIntent.reset();
      invalidate.timeline(pet!.id);
      invalidate.pet(pet!.id);
      invalidate.alertsAll();
      showToast({ message: "Record added to the Journal." });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Unable to save this record.",
      ),
  });
  const updateEvent = useMutation({
    mutationFn: () =>
      planetApi.timeline.update(
        editingEventId!,
        {
          occurred_at: occurredAt.toISOString(),
          payload: timelinePayload({
            type: eventType,
            occurred_at: occurredAt.toISOString(),
            text,
            weight_g: weight,
          }).payload,
        },
      ),
    onSuccess: () => {
      setText("");
      setWeight("");
      setOccurredAt(new Date());
      setEditingEventId(null);
      setAdding(false);
      invalidate.timeline(pet!.id);
      invalidate.pet(pet!.id);
      invalidate.alertsAll();
      showToast({ message: "Journal record updated." });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Unable to update this record.",
      ),
  });
  const deleteEvent = useMutation({
    mutationFn: () => planetApi.timeline.delete(confirmEventId!),
    onSuccess: () => {
      setConfirmEventId(null);
      setEventMenuId(null);
      invalidate.timeline(pet!.id);
      invalidate.pet(pet!.id);
      invalidate.alertsAll();
      showToast({ message: "Journal record removed." });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Unable to remove this record.";
      setError(message);
      showToast({ message });
    },
  });
  const loadOlder = useMutation({
    mutationFn: () => {
      const last = [...(timeline.data?.events ?? []), ...olderEvents].at(-1);
      if (!last) return Promise.resolve({ events: [] as TimelineEvent[] });
      return planetApi.pets.timeline(pet!.id, { before: last.occurred_at, before_id: last.id, limit: 100 });
    },
    onSuccess: (result) => {
      setOlderEvents((current) => [...current, ...result.events]);
      if (result.events.length < 100) setHasMore(false);
    },
    onError: (err) => { const message = err instanceof ApiError ? err.message : "Unable to load older records."; setError(message); showToast({ message }); },
  });
  useEffect(() => {
    setOlderEvents([]);
    setHasMore(true);
  }, [pet?.id]);
  function openEventEditor(event: { id: string; type: string; occurred_at: string; payload: Record<string, unknown> }) {
    if (event.type !== "note" && event.type !== "symptom" && event.type !== "weight" && event.type !== "vaccine" && event.type !== "vet_visit") return;
    setEditingEventId(event.id);
    setOccurredAt(new Date(event.occurred_at));
    setEventMenuId(null);
    setConfirmEventId(null);
    setEventType(event.type);
    setText(typeof event.payload.text === "string" ? event.payload.text : eventText(event.payload));
    setWeight(typeof event.payload.weight_g === "number" ? String(event.payload.weight_g) : "");
    setError("");
    setAdding(true);
  }
  function submit() {
    const parsed = timelineSchema.safeParse({
      type: eventType,
      occurred_at: occurredAt.toISOString(),
      text,
      weight_g: eventType === "weight" ? weight : "",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the record.");
      return;
    }
    setError("");
    if (editingEventId) {
      updateEvent.mutate();
      return;
    }
    create.mutate();
  }
  const retryTimeline = () => { void me.refetch(); void circles.refetch(); void accessiblePets.refetch(); if (pet) void timeline.refetch(); };
  const blockingError = (me.isError && !me.data) || (circles.isError && !circles.data) || (accessiblePets.isError && !accessiblePets.hasData) || (timeline.isError && !timeline.data);
  const hasStaleData = Boolean((me.isError && me.data) || (circles.isError && circles.data) || (accessiblePets.isError && accessiblePets.hasData) || (timeline.isError && timeline.data));
  if (
    me.isLoading ||
    circles.isLoading ||
    accessiblePets.isLoading ||
    (pet && timeline.isLoading)
  )
    return (
      <Screen><LoadingState label="Loading the journal" /></Screen>
    );
  if (blockingError)
    return (
      <Screen contentContainerStyle={styles.center}>
        <QueryErrorState
          title="The story is unavailable"
          body="We could not load this Pet's timeline right now."
          onRetry={retryTimeline}
        />
      </Screen>
    );
  if (!pet)
    return (
      <Screen scroll contentContainerStyle={styles.content}>
        <PageHeader eyebrow="JOURNAL" title="Journal" />
        <Card style={styles.empty}>
          <CalendarDotsIcon
            size={27}
            color={theme.colors.brandStrong}
            weight="duotone"
          />
          <AppText variant="heading">Choose a Pet to open its story</AppText>
          <AppText muted>
            Journal is kept with the Pet it belongs to. Choose one before reading or adding a record.
          </AppText>
          <View style={styles.emptyActions}>
            <Button label="Choose a Pet" onPress={() => router.push("/(tabs)/pets")} />
            <Button label="Open Family" variant="secondary" onPress={() => router.push("/(tabs)/family")} />
          </View>
        </Card>
      </Screen>
    );
  const events = [...(timeline.data?.events ?? []), ...olderEvents].sort((left, right) => {
    const occurred = new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime();
    return occurred || right.id.localeCompare(left.id);
  });
  const visibleEvents = timelineFilter === "all" ? events : events.filter((event) => eventBucket(event) === timelineFilter);
  const groupedEvents = visibleEvents.reduce<Array<{ label: string; events: TimelineEvent[] }>>((groups, event) => {
    const label = eventDayLabel(event.occurred_at, petTimeZone);
    const current = groups[groups.length - 1];
    if (current?.label === label) current.events.push(event);
    else groups.push({ label, events: [event] });
    return groups;
  }, []);
  const linkedFamilyIds = new Set(pet.family_ids?.length ? pet.family_ids : [pet.circle_id]);
  const hasOwnerAccess = pet.current_owner_user_id === me.data?.user.id || Boolean(circles.data?.circles.some((circle) => linkedFamilyIds.has(circle.id) && circle.role === "owner"));
  const knownFamilyRoles = circles.data?.circles.filter((circle) => linkedFamilyIds.has(circle.id)).map((circle) => circle.role).filter(Boolean) ?? [];
  const canRecord = (pet.access_role && pet.access_role !== "viewer" && pet.access_role !== "read_only") || pet.current_owner_user_id === me.data?.user.id || knownFamilyRoles.some((role) => role !== "viewer" && role !== "read_only");
  const canEditEvent = (event: TimelineEvent) => event.source === "user" && (event.recorded_by === me.data?.user.id || hasOwnerAccess);
  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <WorkspaceBar familyName={petFamily?.name} petName={pet.name} onPressWorkspace={() => router.push('/(tabs)/family')} />
      <PageHeader
        eyebrow={`${pet.name.toUpperCase()} / HISTORY`}
        title="Journal"
        showBack={false}
      />
      {accessiblePets.pets.length > 1 ? (
        <View style={styles.petPicker}>
          <AppText variant="caption" muted>
            VIEWING THE STORY OF
          </AppText>
          <PetFilterSelector value={{ kind: "pet", petId: pet.id }} families={[]} pets={accessiblePets.pets} onChange={(next) => { if (next.kind === "pet") { setTimelinePetId(next.petId); setAdding(false); setError(""); } else router.push("/(tabs)/pets"); }} />
        </View>
      ) : null}
      {hasStaleData ? <StaleDataNotice onRetry={retryTimeline} retrying={timeline.isFetching || accessiblePets.isLoading} /> : null}
      <View style={styles.intro}>
        <View
          style={[
            styles.introIcon,
            { backgroundColor: theme.colors.accentSurface },
          ]}
        >
          <CalendarDotsIcon
            size={24}
            color={theme.colors.accentStrong}
            weight="duotone"
          />
        </View>
        <View style={styles.introCopy}>
          <AppText variant="heading">{pet.name}'s care history</AppText>
          <AppText muted>
            Keep the details that help you notice, remember and care.
          </AppText>
        </View>
      </View>
      {canRecord ? <Button
        label={adding ? "Close record form" : "Record something"}
        variant="secondary"
        icon={adding
          ? <XIcon size={17} color={theme.colors.brandStrong} weight="bold" />
          : <PlusIcon size={17} color={theme.colors.brandStrong} weight="bold" />}
        onPress={() => {
          if (!adding) {
            setEditingEventId(null);
            setText("");
            setWeight("");
            setOccurredAt(new Date());
          }
          setAdding((value) => !value);
          setError("");
        }}
      /> : <AppText variant="caption" muted>This Pet is view-only for you. A caregiver or owner can add to the story.</AppText>}
      <SegmentedControl
        label="Filter care history"
        value={timelineFilter}
        onChange={setTimelineFilter}
        compact
        options={[
          { value: "all", label: "All" },
          { value: "notes", label: "Notes" },
          { value: "health", label: "Health" },
          { value: "care", label: "Care" },
        ]}
      />
      {adding && canRecord ? (
        <Card style={styles.form}>
          <AppText variant="title">Add to the story</AppText>
          <SegmentedControl
            label="What happened?"
            value={eventType}
            onChange={setEventType}
            wrap
            options={[
              { value: "note", label: "Note" },
              { value: "symptom", label: "Symptom" },
              { value: "weight", label: "Weight" },
              { value: "vet_visit", label: "Vet visit" },
              { value: "vaccine", label: "Vaccine" },
            ]}
          />
          <DateTimeField label="When did it happen?" value={occurredAt} onChange={setOccurredAt} maximumDate={new Date()} />
          <TextField
            label={eventType === "weight" ? "Details (optional)" : eventType === "vaccine" ? "Vaccine name" : eventType === "vet_visit" ? "Visit summary" : "A detail worth keeping"}
            value={text}
            onChangeText={(value) => {
              setText(value);
              setError("");
            }}
            placeholder={eventType === "weight" ? "After a meal, morning weigh-in…" : eventType === "vaccine" ? "Rabies vaccine" : eventType === "vet_visit" ? "Annual check-up" : "Milo had a good walk"}
            multiline
            error={error}
          />
          {eventType === "weight" ? (
            <TextField
              label="Weight (g)"
              value={weight}
              onChangeText={(value) => {
                setWeight(value);
                setError("");
              }}
              keyboardType="number-pad"
              placeholder="5350"
            />
          ) : null}
          <Button
            label={editingEventId ? "Save changes" : "Save record"}
            loading={create.isPending || updateEvent.isPending}
            disabled={eventType === "weight" ? !weight.trim() : !text.trim()}
            onPress={submit}
          />
        </Card>
      ) : null}
      <View style={styles.sectionHeader}>
        <View>
            <AppText variant="title">Recent records</AppText>
          <AppText variant="caption" muted>
            {visibleEvents.length
              ? `${visibleEvents.length} ${timelineFilter === "all" ? (visibleEvents.length === 1 ? "record" : "records") : (visibleEvents.length === 1 ? "matching record" : "matching records")}`
              : timelineFilter === "all" ? "The first chapter is waiting" : "Nothing matches this filter"}
          </AppText>
        </View>
      </View>
      {visibleEvents.length === 0 ? (
        <Card style={styles.empty}>
          <CheckCircleIcon
            size={27}
            color={theme.colors.brandStrong}
            weight="duotone"
          />
          <AppText variant="heading">{timelineFilter === "all" ? "Nothing recorded yet" : "No matching records"}</AppText>
          <AppText muted>
            {timelineFilter === "all" ? "Start with the small thing you noticed today. It may matter later." : "Try another filter or record a new moment."}
          </AppText>
        </Card>
      ) : (
        <View style={styles.events}>
          {groupedEvents.map((group) => <View key={group.label} style={styles.eventGroup}>
            <View style={styles.eventDay}><AppText variant="caption" muted>{group.label.toUpperCase()}</AppText><View style={[styles.eventRule, { backgroundColor: theme.colors.border }]} /></View>
            {group.events.map((event) => (
            <Card key={event.id} style={styles.event}>
              <View style={styles.eventTop}>
                <View style={[styles.eventDot, { backgroundColor: event.source === "user" && event.type === "symptom" ? theme.colors.accentSurface : event.source === "user" && event.type === "vet_visit" ? theme.colors.lavenderSurface : theme.colors.brandSoft }]}>
                  <EventGlyph event={event} />
                </View>
                <View style={styles.eventMeta}>
                  <AppText variant="label">{eventTitle(event.type, event.payload)}</AppText>
                  <AppText variant="caption" muted>
                    {new Date(event.occurred_at).toLocaleDateString(undefined, { timeZone: petTimeZone })} ·{" "}
                    {event.source === "user" ? `Recorded by ${actorLabel(event.recorded_by, me.data?.user.id, event.recorded_by_name)}` : "From care"}
                  </AppText>
                </View>
                {canEditEvent(event) &&
                (event.type === "note" ||
                  event.type === "symptom" ||
                  event.type === "weight" ||
                  event.type === "vaccine" ||
                  event.type === "vet_visit") ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Actions for ${eventTitle(event.type, event.payload)}`}
                    onPress={() => {
                      setEventMenuId((current) =>
                        current === event.id ? null : event.id,
                      );
                      setConfirmEventId(null);
                      setError("");
                    }}
                    hitSlop={8}
                    style={styles.eventMenu}
                  >
                    <DotsThreeIcon
                      size={22}
                      color={theme.colors.textSubtle}
                      weight="bold"
                    />
                  </Pressable>
                ) : null}
              </View>
              <AppText muted>{eventText(event.payload)}</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel={expandedEventId === event.id ? "Hide details" : "View details"} accessibilityState={{ expanded: expandedEventId === event.id }} onPress={() => setExpandedEventId((current) => current === event.id ? null : event.id)} hitSlop={6} style={({ pressed }) => [styles.eventDetailsToggle, pressed && { opacity: theme.motion.pressOpacity }]}>
                <AppText variant="caption" style={{ color: theme.colors.brandStrong }}>{expandedEventId === event.id ? "Hide details" : "View details"}</AppText>
              </Pressable>
              {expandedEventId === event.id ? <View style={[styles.eventDetails, { backgroundColor: theme.colors.surfaceRaised }]}><AppText variant="caption" muted>Occurred {new Date(event.occurred_at).toLocaleString(undefined, { timeZone: petTimeZone })}</AppText><AppText variant="caption" muted>{event.source === "user" ? `Recorded by ${actorLabel(event.recorded_by, me.data?.user.id, event.recorded_by_name)}` : "Generated from a care plan"}</AppText><AppText variant="caption" muted>Type: {eventTitle(event.type, event.payload)}</AppText></View> : null}
              {eventMenuId === event.id ? (
                <View style={styles.eventActions}>
                  <Button
                    label="Edit"
                    variant="secondary"
                    onPress={() => openEventEditor(event)}
                  />
                  <Button
                    label="Remove"
                    variant="danger"
                    onPress={() => {
                      setConfirmEventId(event.id);
                      setEventMenuId(null);
                    }}
                  />
                </View>
              ) : null}
              {confirmEventId === event.id ? (
                <View
                  style={[
                    styles.confirmBox,
                    { backgroundColor: theme.colors.accentSurface },
                  ]}
                >
                  <AppText variant="label">Remove this record?</AppText>
                  <AppText variant="caption" muted>
                    This removes the record you added. Care history from your plans stays intact.
                  </AppText>
                  <View style={styles.eventActions}>
                    <Button
                      label="Keep it"
                      variant="secondary"
                      onPress={() => setConfirmEventId(null)}
                    />
                    <Button
                      label="Remove record"
                      variant="danger"
                      loading={deleteEvent.isPending}
                      onPress={() => deleteEvent.mutate()}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
            ))}
          </View>)}
          {((timeline.data?.events.length ?? 0) === 100 || olderEvents.length > 0) && hasMore ? (
            <Button label="Load older records" variant="secondary" loading={loadOlder.isPending} onPress={() => { setError(""); loadOlder.mutate(); }} />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "stretch" },
  content: {
    maxWidth: 680,
    alignSelf: "center",
    width: "100%",
    paddingBottom: 192,
    gap: 16,
  },
  intro: { flexDirection: "row", alignItems: "center", gap: 12 },
  introIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  introCopy: { flex: 1, gap: 3 },
  petPicker: { gap: 8 },
  form: { gap: 13 },
  sectionHeader: { marginTop: 7 },
  events: { gap: 10 },
  eventGroup: { gap: 9 },
  eventDay: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 3, paddingTop: 4 },
  eventRule: { flex: 1, height: StyleSheet.hairlineWidth },
  event: { gap: 11 },
  eventDetails: { borderRadius: 12, padding: 10, gap: 3 },
  eventTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  eventDot: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  eventMeta: { flex: 1, gap: 2 },
  eventMenu: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  eventDetailsToggle: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center" },
  eventActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, paddingTop: 4 },
  confirmBox: { borderRadius: 16, padding: 14, gap: 8, marginTop: 2 },
  empty: { gap: 9, alignItems: "flex-start" },
  emptyActions: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 4 },
});
