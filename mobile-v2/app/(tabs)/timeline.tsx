import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import {
  AppText,
  Button,
  Card,
  PageHeader,
  Screen,
  SegmentedControl,
  TextField,
} from "../../src/ui/components";
import { useTheme } from "../../src/core/providers/theme-provider";
import {
  useAccessiblePets,
  useCircles,
  useInvalidateApi,
  useTimeline,
} from "../../src/core/query/hooks";
import { planetApi } from "../../src/core/api/planet-api";
import { timelinePayload, timelineSchema } from "../../src/core/forms";
import { ApiError } from "../../src/core/network/api-client";
import {
  CalendarDotsIcon,
  CheckCircleIcon,
  DotsThreeIcon,
  PlusIcon,
} from "../../src/ui/icons";

type EventType = "note" | "symptom" | "weight" | "vaccine" | "vet_visit";

function eventTitle(type: string) {
  return type === "vet_visit"
    ? "Vet visit"
    : type.charAt(0).toUpperCase() + type.slice(1);
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

export default function TimelineRoute() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ petId?: string }>();
  const circles = useCircles();
  const circleIds = circles.data?.circles.map((item) => item.id) ?? [];
  const accessiblePets = useAccessiblePets(circleIds);
  const selectedPetId =
    typeof params.petId === "string" ? params.petId : undefined;
  const [timelinePetId, setTimelinePetId] = useState<string | undefined>(
    selectedPetId,
  );
  const activePetId =
    (timelinePetId && accessiblePets.pets.some((candidate) => candidate.id === timelinePetId)
      ? timelinePetId
      : undefined) ??
    (selectedPetId && accessiblePets.pets.some((candidate) => candidate.id === selectedPetId)
      ? selectedPetId
      : undefined) ??
    accessiblePets.pets[0]?.id;
  const pet =
    accessiblePets.pets.find((candidate) => candidate.id === activePetId) ??
    accessiblePets.pets[0];
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
  const [editingOccurredAt, setEditingOccurredAt] = useState<string>("");
  const create = useMutation({
    mutationFn: () =>
      planetApi.pets.createEvent(
        pet!.id,
        timelinePayload({
          type: eventType,
          occurred_at: new Date().toISOString(),
          text,
          weight_g: weight,
        }),
      ),
    onSuccess: () => {
      setText("");
      setWeight("");
      setAdding(false);
      invalidate.timeline(pet!.id);
      invalidate.pet(pet!.id);
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
          occurred_at: editingOccurredAt || new Date().toISOString(),
          payload: timelinePayload({
            type: eventType,
            occurred_at: editingOccurredAt || new Date().toISOString(),
            text,
            weight_g: weight,
          }).payload,
        },
      ),
    onSuccess: () => {
      setText("");
      setWeight("");
      setEditingEventId(null);
      setAdding(false);
      invalidate.timeline(pet!.id);
      invalidate.pet(pet!.id);
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
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Unable to remove this record.",
      ),
  });
  function openEventEditor(event: { id: string; type: string; occurred_at: string; payload: Record<string, unknown> }) {
    if (event.type !== "note" && event.type !== "symptom" && event.type !== "weight") return;
    setEditingEventId(event.id);
    setEditingOccurredAt(event.occurred_at);
    setEventMenuId(null);
    setConfirmEventId(null);
    setEventType(event.type);
    setText(typeof event.payload.text === "string" ? event.payload.text : "");
    setWeight(typeof event.payload.weight_g === "number" ? String(event.payload.weight_g) : "");
    setError("");
    setAdding(true);
  }
  function submit() {
    const parsed = timelineSchema.safeParse({
      type: eventType,
      occurred_at: new Date().toISOString(),
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
  if (
    circles.isLoading ||
    accessiblePets.isLoading ||
    (pet && timeline.isLoading)
  )
    return (
      <Screen>
        <ActivityIndicator color={theme.colors.brand} />
      </Screen>
    );
  if (!pet)
    return (
      <Screen scroll contentContainerStyle={styles.content}>
        <PageHeader eyebrow="PET / HISTORY" title="The story" />
        <Card style={styles.empty}>
          <CalendarDotsIcon
            size={27}
            color={theme.colors.brandStrong}
            weight="duotone"
          />
          <AppText variant="heading">Choose a Pet first</AppText>
          <AppText muted>
            Your Pet's notes, visits and patterns will live here.
          </AppText>
        </Card>
      </Screen>
    );
  const events = timeline.data?.events ?? [];
  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <PageHeader
        eyebrow={`${pet.name.toUpperCase()} / HISTORY`}
        title="The story"
      />
      {accessiblePets.pets.length > 1 ? (
        <View style={styles.petPicker}>
          <AppText variant="caption" muted>
            VIEWING THE STORY OF
          </AppText>
          <View style={styles.petOptions}>
            {accessiblePets.pets.map((candidate) => {
              const selected = candidate.id === pet.id;
              return (
                <Pressable
                  key={candidate.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setTimelinePetId(candidate.id);
                    setAdding(false);
                    setError("");
                  }}
                  style={[
                    styles.petOption,
                    {
                      borderColor: selected
                        ? theme.colors.brandStrong
                        : theme.colors.border,
                      backgroundColor: selected
                        ? theme.colors.brandSoft
                        : theme.colors.surface,
                    },
                  ]}
                >
                  <AppText
                    variant="label"
                    style={{
                      color: selected
                        ? theme.colors.brandStrong
                        : theme.colors.textMuted,
                    }}
                  >
                    {candidate.name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
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
          <AppText variant="heading">A living record of {pet.name}</AppText>
          <AppText muted>
            Keep the details that help you notice, remember and care.
          </AppText>
        </View>
      </View>
      <Button
        label={adding ? "Close record form" : "Record something"}
        variant="secondary"
        icon={
          <PlusIcon size={17} color={theme.colors.brandStrong} weight="bold" />
        }
        onPress={() => {
          if (!adding) {
            setEditingEventId(null);
            setText("");
            setWeight("");
          }
          setAdding((value) => !value);
          setError("");
        }}
      />
      {adding ? (
        <Card style={styles.form}>
          <AppText variant="title">Add to the story</AppText>
          <SegmentedControl
            label="What happened?"
            value={eventType}
            onChange={setEventType}
            options={[
              { value: "note", label: "Note" },
              { value: "symptom", label: "Symptom" },
              { value: "weight", label: "Weight" },
            ]}
          />
          <TextField
            label={
              eventType === "weight"
                ? "Context (optional)"
                : "A detail worth keeping"
            }
            value={text}
            onChangeText={(value) => {
              setText(value);
              setError("");
            }}
            placeholder={
              eventType === "weight"
                ? "After a meal, morning weigh-in…"
                : "Milo had a good walk"
            }
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
            {events.length
              ? `${events.length} records`
              : "The first chapter is waiting"}
          </AppText>
        </View>
      </View>
      {events.length === 0 ? (
        <Card style={styles.empty}>
          <CheckCircleIcon
            size={27}
            color={theme.colors.brandStrong}
            weight="duotone"
          />
          <AppText variant="heading">Nothing recorded yet</AppText>
          <AppText muted>
            Start with the small thing you noticed today. It may matter later.
          </AppText>
        </Card>
      ) : (
        <View style={styles.events}>
          {events.map((event) => (
            <Card key={event.id} style={styles.event}>
              <View style={styles.eventTop}>
                <View
                  style={[
                    styles.eventDot,
                    { backgroundColor: theme.colors.brandSoft },
                  ]}
                >
                  <CheckCircleIcon
                    size={17}
                    color={theme.colors.brandStrong}
                    weight="duotone"
                  />
                </View>
                <View style={styles.eventMeta}>
                  <AppText variant="label">{eventTitle(event.type)}</AppText>
                  <AppText variant="caption" muted>
                    {new Date(event.occurred_at).toLocaleDateString()} ·{" "}
                    {event.source === "user" ? "Recorded by you" : "From care"}
                  </AppText>
                </View>
                {event.source === "user" &&
                (event.type === "note" ||
                  event.type === "symptom" ||
                  event.type === "weight") ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Actions for ${eventTitle(event.type)}`}
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
                    This only removes the note you recorded. Care history stays intact.
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
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    maxWidth: 680,
    alignSelf: "center",
    width: "100%",
    paddingBottom: 140,
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
  petOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  petOption: {
    minHeight: 38,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  form: { gap: 13 },
  sectionHeader: { marginTop: 7 },
  events: { gap: 10 },
  event: { gap: 11 },
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
  eventActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 4 },
  confirmBox: { borderRadius: 16, padding: 14, gap: 8, marginTop: 2 },
  empty: { gap: 9, alignItems: "flex-start" },
});
