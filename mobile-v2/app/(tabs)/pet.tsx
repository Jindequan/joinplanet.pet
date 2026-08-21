import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import {
  CatIcon,
  CheckCircleIcon,
  DotsThreeIcon,
  DogIcon,
  PawPrintIcon,
  PlusIcon,
} from "../../src/ui/icons";
import {
  AppText,
  Button,
  Card,
  PageHeader,
  QueryErrorState,
  Screen,
  SegmentedControl,
  TextField,
} from "../../src/ui/components";
import { useTheme } from "../../src/core/providers/theme-provider";
import {
  useAccessiblePets,
  useCircles,
  useInvalidateApi,
  useMedications,
  usePet,
  useTasks,
} from "../../src/core/query/hooks";
import { planetApi, type Task } from "../../src/core/api/planet-api";
import {
  careItemPayload,
  careItemSchema,
  medicationSchema,
  petSchema,
  taskPayload,
  taskSchema,
} from "../../src/core/forms";
import { ApiError } from "../../src/core/network/api-client";

type CareType =
  "medication" | "feeding" | "health" | "grooming" | "exercise" | "custom";
type ScheduleKind = "daily" | "weekly" | "monthly" | "interval";

const careTypeOptions: readonly { value: CareType; label: string }[] = [
  { value: "medication", label: "Medication" },
  { value: "feeding", label: "Feeding" },
  { value: "health", label: "Health" },
  { value: "grooming", label: "Grooming" },
  { value: "exercise", label: "Exercise" },
  { value: "custom", label: "Other" },
];
const scheduleOptions: readonly { value: ScheduleKind; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "interval", label: "Every N days" },
];
const dayOptions = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 7, label: "S" },
];

function scheduleLabel(task: Task) {
  const raw = task.schedule;
  const kind = typeof raw.kind === "string" ? raw.kind : "daily";
  if (kind === "weekly" && Array.isArray(raw.days))
    return `Weekly · ${(raw.days as number[]).sort().join(", ")}`;
  if (kind === "monthly" && typeof raw.day === "number")
    return `Monthly · day ${raw.day}`;
  if (kind === "interval" && typeof raw.every_n === "number")
    return `Every ${raw.every_n} days`;
  return "Daily";
}

function CareRow({ task, onActions }: { task: Task; onActions: () => void }) {
  const { theme } = useTheme();
  return (
    <View style={styles.careRow}>
      <View
        style={[styles.careIcon, { backgroundColor: theme.colors.brandSoft }]}
      >
        <CheckCircleIcon
          size={20}
          color={theme.colors.brandStrong}
          weight="regular"
        />
      </View>
      <View style={styles.rowCopy}>
        <AppText variant="label">{task.title}</AppText>
        <AppText variant="caption" muted>
          {scheduleLabel(task)}
          {task.time_of_day ? ` · ${task.time_of_day}` : ""}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Actions for ${task.title}`}
        onPress={onActions}
        hitSlop={8}
        style={styles.rowMenu}
      >
        <DotsThreeIcon size={22} color={theme.colors.textSubtle} weight="bold" />
      </Pressable>
    </View>
  );
}

function PetGlyph({ species }: { species: "dog" | "cat" | "other" }) {
  if (species === "cat")
    return <CatIcon size={46} color="#B86843" weight="duotone" />;
  return <DogIcon size={46} color="#B86843" weight="duotone" />;
}

export default function PetRoute() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ petId?: string }>();
  const circles = useCircles();
  const circleIds = circles.data?.circles.map((item) => item.id) ?? [];
  const accessiblePets = useAccessiblePets(circleIds);
  const selectedPetId =
    typeof params.petId === "string" ? params.petId : undefined;
  const pet =
    accessiblePets.pets.find((candidate) => candidate.id === selectedPetId) ??
    accessiblePets.pets[0];
  const detail = usePet(pet?.id);
  const medications = useMedications(pet?.id);
  const tasks = useTasks(pet?.id);
  const invalidate = useInvalidateApi();

  const [form, setForm] = useState<"care" | "medication" | "profile" | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskMenuId, setTaskMenuId] = useState<string | null>(null);
  const [confirmTaskId, setConfirmTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [careType, setCareType] = useState<CareType>("custom");
  const [careTitle, setCareTitle] = useState("");
  const [careDescription, setCareDescription] = useState("");
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("daily");
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
  const [monthlyDay, setMonthlyDay] = useState("1");
  const [everyN, setEveryN] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("");
  const [medName, setMedName] = useState("");
  const [editName, setEditName] = useState("");
  const [editSpecies, setEditSpecies] = useState<"dog" | "cat" | "other">("dog");
  const [editBreed, setEditBreed] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medSchedule, setMedSchedule] = useState("");
  const [medNote, setMedNote] = useState("");
  const [lifecycleAction, setLifecycleAction] = useState<"archive" | "restore" | "delete" | null>(null);

  const resetCareForm = () => {
    setCareType("custom");
    setCareTitle("");
    setCareDescription("");
    setScheduleKind("daily");
    setWeeklyDays([]);
    setMonthlyDay("1");
    setEveryN("");
    setTimeOfDay("");
    setError("");
    setEditingTaskId(null);
    setTaskMenuId(null);
    setConfirmTaskId(null);
    setForm(null);
  };
  const addCare = useMutation({
    mutationFn: () =>
      planetApi.pets.createCareItem(
        pet!.id,
        careItemPayload({
          type: careType,
          title: careTitle,
          description: careDescription,
          schedule_kind: scheduleKind,
          weekly_days: weeklyDays,
          monthly_day: monthlyDay,
          every_n: everyN,
          time_of_day: timeOfDay,
        }),
      ),
    onSuccess: () => {
      resetCareForm();
      invalidate.tasks(pet!.id);
      invalidate.todayAll();
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Unable to add this care plan.",
      ),
  });
  const updateTask = useMutation({
    mutationFn: () =>
      planetApi.tasks.update(
        editingTaskId!,
        taskPayload({
          title: careTitle,
          schedule_kind: scheduleKind,
          weekly_days: weeklyDays,
          monthly_day: monthlyDay,
          every_n: everyN,
          time_of_day: timeOfDay,
        }),
      ),
    onSuccess: () => {
      resetCareForm();
      invalidate.tasks(pet!.id);
      invalidate.todayAll();
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Unable to update this care plan.",
      ),
  });
  const archiveTask = useMutation({
    mutationFn: () => planetApi.tasks.update(confirmTaskId!, { archived: true }),
    onSuccess: () => {
      setConfirmTaskId(null);
      setTaskMenuId(null);
      invalidate.tasks(pet!.id);
      invalidate.todayAll();
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Unable to archive this care plan.",
      ),
  });
  const addMedication = useMutation({
    mutationFn: () =>
      planetApi.pets.createMedication(pet!.id, {
        name: medName.trim(),
        dose: medDose.trim(),
        schedule: medSchedule.trim(),
        note: medNote.trim(),
      }),
    onSuccess: () => {
      setMedName("");
      setMedDose("");
      setMedSchedule("");
      setMedNote("");
      setError("");
      setForm(null);
      invalidate.medications(pet!.id);
      invalidate.timeline(pet!.id);
    },
    onError: (err) =>
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to add this medication.",
      ),
  });
  const editProfile = useMutation({
    mutationFn: async () => {
      await Promise.all([
        planetApi.pets.update(pet!.id, {
          version: pet!.version,
          name: editName.trim(),
          species: editSpecies,
          breed: editBreed.trim(),
        }),
        planetApi.pets.updateProfile(pet!.id, { notes: editNotes.trim() }),
      ]);
    },
    onSuccess: () => {
      setError("");
      setForm(null);
      invalidate.pet(pet!.id);
      invalidate.petsAll();
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Unable to save the Pet details.",
      ),
  });
  const archivePet = useMutation({
    mutationFn: () => planetApi.pets.archive(pet!.id),
    onSuccess: () => {
      setLifecycleAction(null);
      setForm(null);
      setError("");
      invalidate.pet(pet!.id);
      invalidate.petsAll();
      invalidate.todayAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to archive this Pet."),
  });
  const restorePet = useMutation({
    mutationFn: () => planetApi.pets.unarchive(pet!.id),
    onSuccess: () => {
      setLifecycleAction(null);
      setError("");
      invalidate.pet(pet!.id);
      invalidate.petsAll();
      invalidate.todayAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to restore this Pet."),
  });
  const deletePet = useMutation({
    mutationFn: () => planetApi.pets.delete(pet!.id),
    onSuccess: () => {
      invalidate.petsAll();
      invalidate.circles();
      router.replace("/(tabs)/pets");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to delete this Pet."),
  });
  const taskList = useMemo(() => tasks.data?.tasks ?? [], [tasks.data?.tasks]);
  const isArchived = Boolean(pet?.archived_at);

  function openTaskEditor(task: Task) {
    const raw = task.schedule;
    const kind = raw.kind === "weekly" || raw.kind === "monthly" || raw.kind === "interval" ? raw.kind : "daily";
    setEditingTaskId(task.id);
    setTaskMenuId(null);
    setConfirmTaskId(null);
    setCareTitle(task.title);
    setScheduleKind(kind);
    setWeeklyDays(Array.isArray(raw.days) ? (raw.days as number[]) : []);
    setMonthlyDay(typeof raw.day === "number" ? String(raw.day) : "1");
    setEveryN(typeof raw.every_n === "number" ? String(raw.every_n) : "");
    setTimeOfDay(task.time_of_day ?? "");
    setError("");
    setForm("care");
  }

  function submitCare() {
    if (editingTaskId) {
      const parsed = taskSchema.safeParse({
        title: careTitle,
        schedule_kind: scheduleKind,
        weekly_days: weeklyDays,
        monthly_day: monthlyDay,
        every_n: everyN,
        time_of_day: timeOfDay,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check the care plan.");
        return;
      }
      setError("");
      updateTask.mutate();
      return;
    }
    const parsed = careItemSchema.safeParse({
      type: careType,
      title: careTitle,
      description: careDescription,
      schedule_kind: scheduleKind,
      weekly_days: weeklyDays,
      monthly_day: monthlyDay,
      every_n: everyN,
      time_of_day: timeOfDay,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the care plan.");
      return;
    }
    setError("");
    addCare.mutate();
  }
  function submitMedication() {
    const parsed = medicationSchema.safeParse({
      name: medName,
      dose: medDose,
      schedule: medSchedule,
      note: medNote,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Name the medication.");
      return;
    }
    setError("");
    addMedication.mutate();
  }
  function submitProfile() {
    const parsed = petSchema.safeParse({
      name: editName,
      species: editSpecies,
      breed: editBreed,
      birth_date: "",
      sex: "",
      neutered: false,
      weight_g: "",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the Pet details.");
      return;
    }
    setError("");
    editProfile.mutate();
  }

  if (
    circles.isLoading ||
    accessiblePets.isLoading ||
    (pet && detail.isLoading)
  )
    return (
      <Screen>
        <ActivityIndicator color={theme.colors.brand} />
      </Screen>
    );
  if (circles.isError || accessiblePets.isError || detail.isError || medications.isError || tasks.isError)
    return (
      <Screen contentContainerStyle={styles.center}>
        <QueryErrorState
          title="This Pet is unavailable"
          body="We could not load the care record and routines right now."
          onRetry={() => {
            void circles.refetch();
            void accessiblePets.refetch();
            if (pet) {
              void detail.refetch();
              void medications.refetch();
              void tasks.refetch();
            }
          }}
        />
      </Screen>
    );
  if (!pet)
    return (
      <Screen scroll contentContainerStyle={styles.content}>
        <AppText variant="title">Your pet</AppText>
        <Card>
          <AppText variant="heading">No pet selected</AppText>
          <AppText muted>
            Add a pet from the Pets page to start their care record.
          </AppText>
        </Card>
      </Screen>
    );
  const profile = detail.data?.profile;

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <PageHeader eyebrow="YOUR PET / CARE" title={pet.name} />
      <LinearGradient
        colors={[theme.colors.accentSurface, theme.colors.brandSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View
          style={[styles.petMark, { backgroundColor: theme.colors.surface }]}
        >
          <PetGlyph species={pet.species} />
        </View>
        <View style={styles.heroCopy}>
          <AppText
            variant="caption"
            style={{ color: theme.colors.accentStrong }}
          >
            {pet.archived_at ? "MEMORY MODE" : "ACTIVE CARE"}
          </AppText>
          <AppText variant="title">{pet.name}'s care world</AppText>
          <AppText muted>
            {pet.breed || pet.species} · {taskList.length} ongoing{" "}
            {taskList.length === 1 ? "routine" : "routines"}
          </AppText>
        </View>
      </LinearGradient>
      <View style={styles.quickActions}>
        <Button
          label="Add care"
          variant="secondary"
          disabled={isArchived}
          icon={
            <PlusIcon
              size={17}
              color={theme.colors.brandStrong}
              weight="bold"
            />
          }
          onPress={() => {
            setEditingTaskId(null);
            setForm("care");
            setError("");
          }}
        />
        <Button
          label="Timeline"
          variant="ghost"
          icon={
            <PawPrintIcon
              size={17}
              color={theme.colors.brandStrong}
              weight="duotone"
            />
          }
          onPress={() =>
            router.push({
              pathname: "/(tabs)/timeline",
              params: { petId: pet.id },
            })
          }
        />
      </View>
      <Card style={styles.card}>
        <View style={styles.cardHeading}>
          <View>
            <AppText variant="heading">About {pet.name}</AppText>
            <AppText variant="caption" muted>
              The details that help someone care well.
            </AppText>
          </View>
          <Button
            label="Edit details"
            variant="ghost"
            disabled={isArchived}
            onPress={() => {
              setEditName(pet.name);
              setEditSpecies(pet.species);
              setEditBreed(pet.breed ?? "");
              setEditNotes(profile?.notes ?? "");
              setError("");
              setForm("profile");
            }}
          />
        </View>
        <AppText muted>
          {profile?.notes ||
            "Add notes about personality, needs and the things a new caregiver should know."}
        </AppText>
        <View style={styles.profileStats}>
          <View>
            <AppText variant="caption" muted>
              HEALTH NOTES
            </AppText>
            <AppText variant="label">
              {(profile?.allergies?.length ?? 0) +
                (profile?.conditions?.length ?? 0)}{" "}
              recorded
            </AppText>
          </View>
          <View>
            <AppText variant="caption" muted>
              WEIGHT
            </AppText>
            <AppText variant="label">
              {pet.weight_g
                ? `${(pet.weight_g / 1000).toFixed(1)} kg`
                : "Not added"}
            </AppText>
          </View>
        </View>
        {form === "profile" ? (
          <View style={styles.form}>
            <TextField
              label="Name"
              value={editName}
              onChangeText={(value) => {
                setEditName(value);
                setError("");
              }}
              placeholder="Milo"
            />
            <SegmentedControl
              label="What kind of Pet?"
              value={editSpecies}
              onChange={setEditSpecies}
              options={[
                { value: "dog", label: "Dog" },
                { value: "cat", label: "Cat" },
                { value: "other", label: "Other" },
              ]}
            />
            <TextField
              label="Breed (optional)"
              value={editBreed}
              onChangeText={setEditBreed}
              placeholder="Golden retriever"
            />
            <TextField
              label="Notes for a caregiver"
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Personality, needs, and the little things to know…"
              multiline
              maxLength={2000}
            />
            {error ? (
              <AppText style={{ color: theme.colors.danger }}>{error}</AppText>
            ) : null}
            <View style={styles.actions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setForm(null);
                  setError("");
                }}
              />
              <Button
                label="Save details"
                loading={editProfile.isPending}
                disabled={!editName.trim()}
                onPress={submitProfile}
              />
            </View>
          </View>
        ) : null}
      </Card>
      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <View>
            <AppText variant="heading">Care plan</AppText>
            <AppText variant="caption" muted>
              {taskList.length} ongoing{" "}
              {taskList.length === 1 ? "item" : "items"}
            </AppText>
          </View>
          <Button
            label="Add care"
            variant="secondary"
            disabled={isArchived}
            icon={
              <PlusIcon
                size={17}
                color={theme.colors.brandStrong}
                weight="regular"
              />
            }
            onPress={() => {
              setEditingTaskId(null);
              setForm("care");
              setError("");
            }}
          />
        </View>
        {taskList.length === 0 ? (
          <AppText muted>
            No ongoing care yet. Add the first routine for {pet.name}.
          </AppText>
        ) : (
          taskList.map((task) => (
            <View key={task.id}>
              <CareRow
                task={task}
                onActions={() => {
                  setTaskMenuId((current) => (current === task.id ? null : task.id));
                  setConfirmTaskId(null);
                  setError("");
                }}
              />
              {taskMenuId === task.id ? (
                <View style={styles.taskActions}>
                  <Button
                    label="Edit"
                    variant="secondary"
                    onPress={() => openTaskEditor(task)}
                  />
                  <Button
                    label="Archive"
                    variant="danger"
                    onPress={() => {
                      setConfirmTaskId(task.id);
                      setTaskMenuId(null);
                    }}
                  />
                </View>
              ) : null}
              {confirmTaskId === task.id ? (
                <View style={[styles.confirmBox, { backgroundColor: theme.colors.accentSurface }]}>
                  <AppText variant="label">Archive this care plan?</AppText>
                  <AppText variant="caption" muted>
                    Future moments will stop appearing. Past care records stay safe.
                  </AppText>
                  <View style={styles.actions}>
                    <Button
                      label="Keep it"
                      variant="secondary"
                      onPress={() => setConfirmTaskId(null)}
                    />
                    <Button
                      label="Archive plan"
                      variant="danger"
                      loading={archiveTask.isPending}
                      onPress={() => archiveTask.mutate()}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ))
        )}
        {form === "care" ? (
          <View style={styles.form}>
            <SegmentedControl
              label="Care type"
              value={careType}
              onChange={setCareType}
              options={careTypeOptions}
            />
            <TextField
              label="What needs to happen?"
              value={careTitle}
              onChangeText={(value) => {
                setCareTitle(value);
                setError("");
              }}
              placeholder="Give heart medicine"
            />
            <TextField
              label="Notes (optional)"
              value={careDescription}
              onChangeText={setCareDescription}
              placeholder="With food"
              multiline
            />
            <AppText variant="label">When does it repeat?</AppText>
            <SegmentedControl
              label="Repeat schedule"
              value={scheduleKind}
              onChange={setScheduleKind}
              options={scheduleOptions}
            />
            {scheduleKind === "weekly" ? (
              <View style={styles.dayRow}>
                {dayOptions.map((day) => {
                  const selected = weeklyDays.includes(day.value);
                  return (
                    <Pressable
                      key={day.value}
                      accessibilityRole="button"
                      accessibilityLabel={`Weekday ${day.value}`}
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setWeeklyDays((current) =>
                          selected
                            ? current.filter((value) => value !== day.value)
                            : [...current, day.value].sort(),
                        )
                      }
                      style={[
                        styles.dayButton,
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
                        {day.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {scheduleKind === "monthly" ? (
              <TextField
                label="Day of month"
                value={monthlyDay}
                onChangeText={setMonthlyDay}
                keyboardType="number-pad"
                placeholder="1"
              />
            ) : null}
            {scheduleKind === "interval" ? (
              <TextField
                label="Repeat every (days)"
                value={everyN}
                onChangeText={setEveryN}
                keyboardType="number-pad"
                placeholder="2"
              />
            ) : null}
            <TextField
              label="Time (optional)"
              value={timeOfDay}
              onChangeText={setTimeOfDay}
              placeholder="08:00"
              keyboardType="numbers-and-punctuation"
              hint="Use 24-hour time, for example 08:00."
            />
            {error ? (
              <AppText style={{ color: theme.colors.danger }}>{error}</AppText>
            ) : null}
            <View style={styles.actions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={resetCareForm}
              />
              <Button
                label={editingTaskId ? "Save changes" : "Save care plan"}
                loading={addCare.isPending || updateTask.isPending}
                disabled={!careTitle.trim()}
                onPress={submitCare}
              />
            </View>
          </View>
        ) : null}
      </Card>
      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <View>
            <AppText variant="heading">Medication history</AppText>
            <AppText variant="caption" muted>
              {medications.data?.medications.length ?? 0} records
            </AppText>
          </View>
          <Button
            label="Add"
            variant="secondary"
            disabled={isArchived}
            onPress={() => {
              setForm("medication");
              setError("");
            }}
          />
        </View>
        {medications.data?.medications.slice(0, 3).map((med) => (
          <View key={med.id} style={styles.medicationRow}>
            <AppText variant="label">
              {med.name}
              {med.ended_on ? " · stopped" : ""}
            </AppText>
            {med.dose || med.schedule ? (
              <AppText variant="caption" muted>
                {[med.dose, med.schedule].filter(Boolean).join(" · ")}
              </AppText>
            ) : null}
          </View>
        ))}
        {form === "medication" ? (
          <View style={styles.form}>
            <TextField
              label="Medication name"
              value={medName}
              onChangeText={(value) => {
                setMedName(value);
                setError("");
              }}
              placeholder="Heartworm prevention"
              error={error}
            />
            <TextField
              label="Dose (optional)"
              value={medDose}
              onChangeText={(value) => {
                setMedDose(value);
                setError("");
              }}
              placeholder="1 tablet"
            />
            <TextField
              label="Schedule (optional)"
              value={medSchedule}
              onChangeText={(value) => {
                setMedSchedule(value);
                setError("");
              }}
              placeholder="Every morning with food"
            />
            <TextField
              label="Note (optional)"
              value={medNote}
              onChangeText={setMedNote}
              placeholder="Started after the vet visit"
              multiline
            />
            <View style={styles.actions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setForm(null);
                  setError("");
                }}
              />
              <Button
                label="Save medication"
                loading={addMedication.isPending}
                disabled={!medName.trim()}
                onPress={submitMedication}
              />
            </View>
          </View>
        ) : null}
      </Card>
      <Card style={styles.lifecycleCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.rowCopy}>
            <AppText variant="heading">Pet records</AppText>
            <AppText variant="caption" muted>
              {isArchived ? "This Pet is read-only. History is preserved." : "Archive when care ends; delete only when the record should disappear."}
            </AppText>
          </View>
          {isArchived ? <AppText variant="caption" style={{ color: theme.colors.textMuted }}>MEMORY MODE</AppText> : null}
        </View>
        {error ? <AppText variant="caption" style={{ color: theme.colors.danger }}>{error}</AppText> : null}
        {lifecycleAction ? (
          <View style={[styles.confirmBox, { backgroundColor: lifecycleAction === "delete" ? theme.colors.surfaceRaised : theme.colors.accentSurface }]}>
            <AppText variant="label">{lifecycleAction === "archive" ? `Archive ${pet.name}?` : lifecycleAction === "restore" ? `Restore ${pet.name}?` : `Delete ${pet.name} permanently?`}</AppText>
            <AppText variant="caption" muted>
              {lifecycleAction === "archive" ? "Future care moments and reminders stop. The profile and history remain available." : lifecycleAction === "restore" ? "Active care can be scheduled again after restoring this Pet." : "This removes the Pet and its care history. Export anything you need first."}
            </AppText>
            <View style={styles.actions}>
              <Button label="Cancel" variant="secondary" onPress={() => setLifecycleAction(null)} />
              <Button
                label={lifecycleAction === "archive" ? "Archive Pet" : lifecycleAction === "restore" ? "Restore Pet" : "Delete permanently"}
                variant={lifecycleAction === "delete" ? "danger" : "primary"}
                loading={archivePet.isPending || restorePet.isPending || deletePet.isPending}
                onPress={() => lifecycleAction === "archive" ? archivePet.mutate() : lifecycleAction === "restore" ? restorePet.mutate() : deletePet.mutate()}
              />
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            {isArchived ? <Button label="Restore Pet" variant="secondary" onPress={() => setLifecycleAction("restore")} /> : <Button label="Archive Pet" variant="secondary" onPress={() => setLifecycleAction("archive")} />}
            <Button label="Delete Pet" variant="danger" onPress={() => setLifecycleAction("delete")} />
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "stretch" },
  content: {
    maxWidth: 720,
    alignSelf: "center",
    width: "100%",
    paddingBottom: 140,
    gap: 14,
  },
  hero: {
    minHeight: 158,
    borderRadius: 24,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroCopy: { flex: 1, gap: 5 },
  petMark: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  card: { gap: 11 },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  profileStats: { flexDirection: "row", gap: 30, paddingTop: 4 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  form: { gap: 12 },
  actions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  careRow: {
    minHeight: 58,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  careIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, gap: 2 },
  rowMenu: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  taskActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingBottom: 10 },
  confirmBox: { borderRadius: 16, padding: 14, gap: 8, marginBottom: 10 },
  medicationRow: { gap: 2, paddingVertical: 4 },
  lifecycleCard: { gap: 12 },
  dayRow: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  dayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
