import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Share as NativeShare, StyleSheet, Switch, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import {
  CatIcon,
  CheckCircleIcon,
  DotsThreeIcon,
  DogIcon,
  PawPrintIcon,
  PlusIcon,
  ShareNetworkIcon,
} from "../../src/ui/icons";
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
import { useToast } from "../../src/core/providers/toast-provider";
import { useIdempotencyKey } from "../../src/core/hooks/use-idempotency-key";
import {
  useAccessiblePets,
  useCircles,
  useInvalidateApi,
  useMedications,
  useMe,
  usePet,
  usePetShares,
  useTasks,
} from "../../src/core/query/hooks";
import { planetApi, type Medication, type Share, type Task } from "../../src/core/api/planet-api";
import { appConfig } from "../../src/core/config";
import {
  careItemPayload,
  careItemSchema,
  medicationSchema,
  petSchema,
  sharePayload,
  shareSchema,
  taskPayload,
  taskSchema,
} from "../../src/core/forms";
import { ApiError } from "../../src/core/network/api-client";

type CareType =
  "medication" | "feeding" | "health" | "grooming" | "exercise" | "custom";
type ScheduleKind = "daily" | "weekly" | "monthly" | "interval";
type PetSection = "overview" | "care" | "share" | "manage";

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

function CareRow({ task, onActions }: { task: Task; onActions?: () => void }) {
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
      {onActions ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${task.title}`}
          onPress={onActions}
          hitSlop={8}
          style={styles.rowMenu}
        >
          <DotsThreeIcon size={22} color={theme.colors.textSubtle} weight="bold" />
        </Pressable>
      ) : null}
    </View>
  );
}

function PetGlyph({ species, color }: { species: "dog" | "cat" | "other"; color: string }) {
  if (species === "cat")
    return <CatIcon size={46} color={color} weight="duotone" />;
  return <DogIcon size={46} color={color} weight="duotone" />;
}

function shareKindLabel(kind: Share["kind"]) {
  return kind === "care_card" ? "Care card" : "Health summary";
}

function shareExpiryLabel(expiresAt: string) {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "Expiry unavailable";
  return `Expires ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function firstProfileRecord(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || !value[0] || typeof value[0] !== "object") return {};
  return value[0] as Record<string, unknown>;
}

function profileNames(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => typeof item.name === "string" ? item.name : "")
    .filter(Boolean)
    .join(", ");
}

function dateKey(value: Date | null) {
  if (!value) return "";
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseDateKey(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeKey(value: Date | null) {
  if (!value) return "";
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function parseTimeKey(value?: string | null) {
  if (!value) return null;
  const [hours = NaN, minutes = NaN] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export default function PetRoute() {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const router = useRouter();
  const params = useLocalSearchParams<{ petId?: string; intent?: string }>();
  const me = useMe();
  const circles = useCircles();
  const circleIds = circles.data?.circles.map((item) => item.id) ?? [];
  const accessiblePets = useAccessiblePets(circleIds);
  const selectedPetId =
    typeof params.petId === "string" ? params.petId : undefined;
  const listedPet =
    accessiblePets.pets.find((candidate) => candidate.id === selectedPetId) ??
    accessiblePets.pets[0];
  const detail = usePet(listedPet?.id);
  const pet = detail.data?.pet ?? listedPet;
  const accessRole = detail.data?.pet.access_role ?? listedPet?.access_role;
  const sourceFamily = circles.data?.circles.find((item) => item.id === pet?.circle_id);
  const canManagePet = Boolean(
    pet && me.data?.user.id &&
      (accessRole && accessRole !== "viewer" && accessRole !== "read_only" ||
        pet.current_owner_user_id === me.data.user.id ||
        (!pet.current_owner_user_id && sourceFamily?.role === "owner")),
  );
  const medications = useMedications(pet?.id);
  const tasks = useTasks(pet?.id, true);
  const shares = usePetShares(pet?.id, canManagePet);
  const invalidate = useInvalidateApi();

  const [form, setForm] = useState<"care" | "medication" | "profile" | null>(null);
  const [petSection, setPetSection] = useState<PetSection>("overview");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskMenuId, setTaskMenuId] = useState<string | null>(null);
  const [confirmTaskId, setConfirmTaskId] = useState<string | null>(null);
  const [restoreTaskId, setRestoreTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [careType, setCareType] = useState<CareType>("custom");
  const [careTitle, setCareTitle] = useState("");
  const [careDescription, setCareDescription] = useState("");
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("daily");
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
  const [monthlyDay, setMonthlyDay] = useState("1");
  const [everyN, setEveryN] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("");
  const [timeOfDayValue, setTimeOfDayValue] = useState<Date | null>(null);
  const [medName, setMedName] = useState("");
  const [editName, setEditName] = useState("");
  const [editSpecies, setEditSpecies] = useState<"dog" | "cat" | "other">("dog");
  const [editBreed, setEditBreed] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editBirthDateValue, setEditBirthDateValue] = useState<Date | null>(null);
  const [editSex, setEditSex] = useState<"" | "male" | "female">("");
  const [editNeutered, setEditNeutered] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editAllergies, setEditAllergies] = useState("");
  const [editConditions, setEditConditions] = useState("");
  const [editEmergencyName, setEditEmergencyName] = useState("");
  const [editEmergencyPhone, setEditEmergencyPhone] = useState("");
  const [editEmergencyRelation, setEditEmergencyRelation] = useState("");
  const [editDecisionName, setEditDecisionName] = useState("");
  const [editDecisionPhone, setEditDecisionPhone] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medSchedule, setMedSchedule] = useState("");
  const [medNote, setMedNote] = useState("");
  const [editingMedicationId, setEditingMedicationId] = useState<string | null>(null);
  const [medicationAction, setMedicationAction] = useState<{ id: string; kind: "stop" | "delete" } | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<"archive" | "restore" | "delete" | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [shareKind, setShareKind] = useState<"care_card" | "summary">("care_card");
  const [shareTtl, setShareTtl] = useState<"24" | "72" | "168">("72");
  const [shareDays, setShareDays] = useState("90");
  const [shareError, setShareError] = useState("");
  const [createdShare, setCreatedShare] = useState<{ share: Share; url: string } | null>(null);
  const [revokeShareId, setRevokeShareId] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [transferError, setTransferError] = useState("");
  const [transferNotice, setTransferNotice] = useState("");
  const [exportError, setExportError] = useState("");
  const [familyShareOpen, setFamilyShareOpen] = useState(false);
  const [familyShareTargetId, setFamilyShareTargetId] = useState<string | null>(null);
  const [familyShareError, setFamilyShareError] = useState("");
  const [unshareFamilyId, setUnshareFamilyId] = useState<string | null>(null);
  const handledIntentKey = useRef<string | null>(null);
  const careCreateIntent = useIdempotencyKey();
  const medicationCreateIntent = useIdempotencyKey();
  const shareCreateIntent = useIdempotencyKey();

  const resetCareForm = () => {
    setCareType("custom");
    setCareTitle("");
    setCareDescription("");
    setScheduleKind("daily");
    setWeeklyDays([]);
    setMonthlyDay("1");
    setEveryN("");
    setTimeOfDay("");
    setTimeOfDayValue(null);
    setError("");
    setEditingTaskId(null);
    setTaskMenuId(null);
    setConfirmTaskId(null);
    setRestoreTaskId(null);
    setForm(null);
  };
  const resetTransientState = () => {
    resetCareForm();
    setPetSection("overview");
    setError("");
    setEditingMedicationId(null);
    setMedicationAction(null);
    setLifecycleAction(null);
    setDeleteConfirmName("");
    setShareError("");
    setCreatedShare(null);
    setCopiedShare(false);
    setRevokeShareId(null);
    setTransferOpen(false);
    setTransferTargetId(null);
    setTransferError("");
    setTransferNotice("");
    setExportError("");
    setFamilyShareOpen(false);
    setFamilyShareTargetId(null);
    setFamilyShareError("");
    setUnshareFamilyId(null);
    handledIntentKey.current = null;
  };
  useEffect(() => {
    if (pet?.id) resetTransientState();
  }, [pet?.id]);
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
        careCreateIntent.current(),
      ),
    onSuccess: () => {
      resetCareForm();
      careCreateIntent.reset();
      invalidate.tasks(pet!.id);
      invalidate.todayAll();
      showToast({ message: "Care plan added to Today.", actionLabel: "Open Today", onAction: () => router.replace("/(tabs)") });
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
      showToast({ message: "Care plan updated." });
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
  const restoreTask = useMutation({
    mutationFn: (taskId: string) => planetApi.tasks.update(taskId, { archived: false }),
    onSuccess: () => {
      setRestoreTaskId(null);
      setTaskMenuId(null);
      invalidate.tasks(pet!.id);
      invalidate.todayAll();
      showToast({ message: "Care plan restored." });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Unable to restore this care plan.",
      ),
  });
  const addMedication = useMutation({
    mutationFn: () =>
      planetApi.pets.createMedication(pet!.id, {
        name: medName.trim(),
        dose: medDose.trim(),
        schedule: medSchedule.trim(),
        note: medNote.trim(),
      }, medicationCreateIntent.current()),
    onSuccess: () => {
      setMedName("");
      setMedDose("");
      setMedSchedule("");
      setMedNote("");
      setError("");
      setForm(null);
      medicationCreateIntent.reset();
      invalidate.medications(pet!.id);
      invalidate.timeline(pet!.id);
      showToast({ message: "Medication added to the record." });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to add this medication.",
      ),
  });
  const resetMedicationForm = () => {
    setMedName("");
    setMedDose("");
    setMedSchedule("");
    setMedNote("");
    setEditingMedicationId(null);
    setForm(null);
    setError("");
  };
  const updateMedication = useMutation({
    mutationFn: () =>
      planetApi.medications.update(editingMedicationId!, {
        name: medName.trim(),
        dose: medDose.trim(),
        schedule: medSchedule.trim(),
        note: medNote.trim(),
      }),
    onSuccess: () => {
      resetMedicationForm();
      invalidate.medications(pet!.id);
      invalidate.timeline(pet!.id);
      showToast({ message: "Medication updated." });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Unable to update this medication."),
  });
  const stopMedication = useMutation({
    mutationFn: () => planetApi.medications.stop(medicationAction!.id),
    onSuccess: () => {
      setMedicationAction(null);
      setError("");
      invalidate.medications(pet!.id);
      invalidate.timeline(pet!.id);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Unable to stop this medication."),
  });
  const deleteMedication = useMutation({
    mutationFn: () => planetApi.medications.delete(medicationAction!.id),
    onSuccess: () => {
      setMedicationAction(null);
      setError("");
      invalidate.medications(pet!.id);
      invalidate.timeline(pet!.id);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Unable to remove this medication."),
  });
  const editProfile = useMutation({
    mutationFn: async () => {
      await planetApi.pets.update(pet!.id, {
        version: pet!.version,
        name: editName.trim(),
        species: editSpecies,
        breed: editBreed.trim(),
        birth_date: editBirthDate,
        sex: editSex,
        neutered: editNeutered,
      });
      const names = (value: string) => value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).map((name) => ({ name }));
      await planetApi.pets.updateProfile(pet!.id, {
        notes: editNotes.trim(),
        allergies: names(editAllergies),
        conditions: names(editConditions),
        emergency_contacts: editEmergencyName.trim() || editEmergencyPhone.trim() ? [{ name: editEmergencyName.trim(), phone: editEmergencyPhone.trim(), relation: editEmergencyRelation.trim() }] : [],
        med_decision_maker: editDecisionName.trim() || editDecisionPhone.trim() ? { name: editDecisionName.trim(), phone: editDecisionPhone.trim() } : {},
      });
    },
    onSuccess: () => {
      setError("");
      setForm(null);
      invalidate.pet(pet!.id);
      invalidate.petsAll();
    },
    onError: (err) =>
      {
        // The API currently exposes the core Pet and profile as two guarded
        // writes. Refresh both projections after a partial failure so a
        // retry uses the server's new optimistic-lock version instead of
        // replaying a stale version and trapping the user in a 409 loop.
        invalidate.pet(pet!.id);
        invalidate.petsAll();
        setError(
          err instanceof ApiError ? err.message : "Unable to save the Pet details.",
        );
      },
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
      setDeleteConfirmName("");
      invalidate.petsAll();
      invalidate.circles();
      router.replace("/(tabs)/pets");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to delete this Pet."),
  });
  const transferPet = useMutation({
    mutationFn: () => planetApi.pets.transfer(pet!.id, transferTargetId!),
    onSuccess: () => {
      setTransferOpen(false);
      setTransferTargetId(null);
      setTransferError("");
      setTransferNotice("The handoff request is waiting for the other Family owner.");
      invalidate.circles();
      invalidate.petsAll();
      if (pet?.circle_id) invalidate.transfers(pet.circle_id);
    },
    onError: (err) => setTransferError(err instanceof ApiError ? err.message : "Unable to start this Pet handoff."),
  });
  const exportPet = useMutation({
    mutationFn: () => planetApi.pets.export(pet!.id),
    onSuccess: async (result) => {
      setExportError("");
      try {
        await NativeShare.share({ title: `${pet!.name} · PLANET export`, message: JSON.stringify(result, null, 2) });
      } catch {
        setExportError("The export is ready, but the share sheet could not open. Try again from this Pet's Manage section.");
      }
    },
    onError: (err) => setExportError(err instanceof ApiError ? err.message : "Unable to export this Pet record."),
  });
  const sharePetFamily = useMutation({
    mutationFn: () => planetApi.pets.shareFamily(pet!.id, familyShareTargetId!),
    onSuccess: () => {
      setFamilyShareOpen(false);
      setFamilyShareTargetId(null);
      setFamilyShareError("");
      invalidate.pet(pet!.id);
      invalidate.petsAll();
      invalidate.todayAll();
    },
    onError: (err) => setFamilyShareError(err instanceof ApiError ? err.message : "Unable to share this Pet with that Family."),
  });
  const unsharePetFamily = useMutation({
    mutationFn: () => planetApi.pets.unshareFamily(pet!.id, unshareFamilyId!),
    onSuccess: () => {
      setUnshareFamilyId(null);
      setFamilyShareError("");
      invalidate.pet(pet!.id);
      invalidate.petsAll();
      invalidate.todayAll();
    },
    onError: (err) => setFamilyShareError(err instanceof ApiError ? err.message : "Unable to remove this Family's access."),
  });
  const createShare = useMutation({
    mutationFn: () => {
      const parsed = shareSchema.safeParse({ kind: shareKind, ttl_hours: shareTtl, days: shareDays });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the sharing options.");
      return planetApi.pets.createShare(pet!.id, sharePayload(parsed.data), shareCreateIntent.current());
    },
    onSuccess: (result) => {
      setCreatedShare({ share: result.share, url: `${appConfig.publicWebBaseUrl}/s/${result.token}` });
      setCopiedShare(false);
      setShareError("");
      invalidate.shares(pet!.id);
      shareCreateIntent.reset();
    },
    onError: (err) => setShareError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to create the share link."),
  });
  const revokeShare = useMutation({
    mutationFn: () => planetApi.shares.revoke(revokeShareId!),
    onSuccess: () => {
      setRevokeShareId(null);
      setShareError("");
      invalidate.shares(pet!.id);
    },
    onError: (err) => setShareError(err instanceof ApiError ? err.message : "Unable to revoke this link."),
  });
  const taskList = useMemo(() => (tasks.data?.tasks ?? []).filter((task) => !task.archived_at), [tasks.data?.tasks]);
  const archivedTaskList = useMemo(() => (tasks.data?.tasks ?? []).filter((task) => Boolean(task.archived_at)), [tasks.data?.tasks]);
  const isArchived = Boolean(pet?.archived_at);
  const targetFamilies = circles.data?.circles.filter((item) => item.id !== pet?.circle_id) ?? [];
  const linkedFamilyIds = new Set(pet?.family_ids?.length ? pet.family_ids : pet?.circle_id ? [pet.circle_id] : []);
  const linkedFamilies = circles.data?.circles.filter((item) => linkedFamilyIds.has(item.id)) ?? [];
  const availableFamilyShares = circles.data?.circles.filter((item) => !linkedFamilyIds.has(item.id)) ?? [];
  const knownFamilyRoles = linkedFamilies.map((family) => family.role).filter(Boolean);
  const isReadOnlyMember = knownFamilyRoles.length > 0 && knownFamilyRoles.every((role) => role === "viewer" || role === "read_only");
  const canEditPet = Boolean(pet && !isArchived && !isReadOnlyMember);

  useEffect(() => {
    const intentKey = `${selectedPetId ?? pet?.id ?? ""}:${params.intent ?? ""}`;
    if (handledIntentKey.current !== intentKey && params.intent === "care" && pet && !isArchived) {
      setPetSection("care");
      setForm("care");
      setError("");
      handledIntentKey.current = intentKey;
    } else if (handledIntentKey.current !== intentKey && params.intent === "export" && pet) {
      setPetSection("manage");
      setError("");
      handledIntentKey.current = intentKey;
    }
  }, [isArchived, params.intent, pet, selectedPetId]);

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
    setTimeOfDayValue(parseTimeKey(task.time_of_day));
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
    if (editingMedicationId) {
      updateMedication.mutate();
    } else {
      addMedication.mutate();
    }
  }
  function openMedicationEditor(medication: Medication) {
    setEditingMedicationId(medication.id);
    setMedName(medication.name);
    setMedDose(medication.dose ?? "");
    setMedSchedule(medication.schedule ?? "");
    setMedNote(medication.note ?? "");
    setMedicationAction(null);
    setError("");
    setForm("medication");
  }
  function submitProfile() {
      const parsed = petSchema.safeParse({
        name: editName,
        species: editSpecies,
        breed: editBreed,
        birth_date: editBirthDate,
        sex: editSex,
        neutered: editNeutered,
        weight_g: "",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the Pet details.");
      return;
    }
    setError("");
    editProfile.mutate();
  }

  const retryPet = () => {
    void circles.refetch();
    void accessiblePets.refetch();
    void me.refetch();
    if (pet) {
      void detail.refetch();
      void medications.refetch();
      void tasks.refetch();
    }
  };
  const blockingError = (me.isError && !me.data) || (circles.isError && !circles.data) || (accessiblePets.isError && !accessiblePets.hasData) || (!pet && detail.isError);
  const hasStaleData = Boolean((me.isError && me.data) || (circles.isError && circles.data) || (accessiblePets.isError && accessiblePets.hasData) || (detail.isError && pet) || medications.isError || tasks.isError);
  if (
    circles.isLoading ||
    me.isLoading ||
    accessiblePets.isLoading ||
    (pet && detail.isLoading)
  )
    return (
      <Screen><LoadingState label="Loading this Pet’s world" /></Screen>
    );
  if (blockingError)
    return (
      <Screen contentContainerStyle={styles.center}>
        <QueryErrorState
          title="This Pet is unavailable"
          body="We could not load the care record and routines right now."
          onRetry={retryPet}
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
      {hasStaleData ? <StaleDataNotice onRetry={retryPet} retrying={detail.isFetching || medications.isFetching || tasks.isFetching} message="Some care details are from the last saved view. Reconnect to refresh them." /> : null}
      {accessiblePets.pets.length > 1 ? <View style={styles.petSwitcher}><AppText variant="caption" muted>SWITCH PET</AppText><PetFilterSelector value={{ kind: "pet", petId: pet.id }} families={[]} pets={accessiblePets.pets} onChange={(next) => { if (next.kind === "pet") router.replace({ pathname: "/(tabs)/pet", params: { petId: next.petId } }); else router.replace("/(tabs)/pets"); }} /></View> : null}
      <LinearGradient
        colors={[theme.colors.accentSurface, theme.colors.brandSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View
          style={[styles.petMark, { backgroundColor: theme.colors.surface }]}
        >
          <PetGlyph species={pet.species} color={theme.colors.accentStrong} />
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
          disabled={isArchived || !canManagePet}
          icon={
            <PlusIcon
              size={17}
              color={theme.colors.brandStrong}
              weight="bold"
            />
          }
          onPress={() => {
            setPetSection("care");
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
      <SegmentedControl
        label="Pet workspace"
        value={petSection}
        onChange={setPetSection}
        options={[
          { value: "overview", label: "Overview" },
          { value: "care", label: "Care" },
          { value: "share", label: "Share" },
          { value: "manage", label: "Manage" },
        ]}
      />
      {petSection === "overview" ? <>
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
            disabled={isArchived || !canEditPet}
            onPress={() => {
              setEditName(pet.name);
              setEditSpecies(pet.species);
              setEditBreed(pet.breed ?? "");
              setEditBirthDate(pet.birth_date ?? "");
              setEditBirthDateValue(parseDateKey(pet.birth_date));
              setEditSex(pet.sex ?? "");
              setEditNeutered(pet.neutered);
              setEditNotes(profile?.notes ?? "");
              setEditAllergies(profileNames(profile?.allergies));
              setEditConditions(profileNames(profile?.conditions));
              const emergency = firstProfileRecord(profile?.emergency_contacts);
              setEditEmergencyName(typeof emergency.name === "string" ? emergency.name : "");
              setEditEmergencyPhone(typeof emergency.phone === "string" ? emergency.phone : "");
              setEditEmergencyRelation(typeof emergency.relation === "string" ? emergency.relation : "");
              const decision = profile?.med_decision_maker && typeof profile.med_decision_maker === "object" ? profile.med_decision_maker as Record<string, unknown> : {};
              setEditDecisionName(typeof decision.name === "string" ? decision.name : "");
              setEditDecisionPhone(typeof decision.phone === "string" ? decision.phone : "");
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
        <View style={styles.safetyGrid}>
          <View style={[styles.safetyCell, { backgroundColor: theme.colors.brandSoft }]}>
            <AppText variant="caption" muted>ALLERGIES</AppText>
            <AppText variant="label" numberOfLines={2}>{profileNames(profile?.allergies) || "None recorded"}</AppText>
          </View>
          <View style={[styles.safetyCell, { backgroundColor: theme.colors.brandSoft }]}>
            <AppText variant="caption" muted>CONCERNS</AppText>
            <AppText variant="label" numberOfLines={2}>{profileNames(profile?.conditions) || "None recorded"}</AppText>
          </View>
          <View style={[styles.safetyCell, { backgroundColor: theme.colors.brandSoft }]}>
            <AppText variant="caption" muted>EMERGENCY</AppText>
            <AppText variant="label" numberOfLines={2}>{typeof firstProfileRecord(profile?.emergency_contacts).name === "string" ? String(firstProfileRecord(profile?.emergency_contacts).name) : "Not added"}</AppText>
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
            <DateTimeField label="Birthday (optional)" value={editBirthDateValue} onChange={(value) => { setEditBirthDateValue(value); setEditBirthDate(dateKey(value)); setError(""); }} onClear={() => { setEditBirthDateValue(null); setEditBirthDate(""); setError(""); }} placeholder="Choose a date" maximumDate={new Date()} />
            <SegmentedControl
              label="Sex"
              value={editSex}
              onChange={setEditSex}
              options={[{ value: "", label: "Not set" }, { value: "female", label: "Female" }, { value: "male", label: "Male" }]}
            />
            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <AppText variant="label">Spayed / neutered</AppText>
                <AppText variant="caption" muted>Keep this detail visible in their profile.</AppText>
              </View>
              <Switch accessibilityLabel="Spayed or neutered" value={editNeutered} onValueChange={setEditNeutered} trackColor={{ false: theme.colors.border, true: theme.colors.brand }} thumbColor={theme.colors.surface} />
            </View>
            <TextField
              label="Notes for a caregiver"
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Personality, needs, and the little things to know…"
              multiline
              maxLength={2000}
            />
            <TextField
              label="Allergies"
              value={editAllergies}
              onChangeText={setEditAllergies}
              placeholder="Chicken, pollen"
              hint="Separate multiple entries with commas."
            />
            <TextField
              label="Conditions or ongoing concerns"
              value={editConditions}
              onChangeText={setEditConditions}
              placeholder="Sensitive stomach"
              hint="Keep this factual and easy for a caregiver to scan."
            />
            <View style={styles.formSectionLabel}><AppText variant="label">Emergency contact</AppText><AppText variant="caption" muted>Who should be called first?</AppText></View>
            <TextField label="Name" value={editEmergencyName} onChangeText={setEditEmergencyName} placeholder="Alex" />
            <TextField label="Phone" value={editEmergencyPhone} onChangeText={setEditEmergencyPhone} keyboardType="phone-pad" placeholder="+1 555 0100" />
            <TextField label="Relationship (optional)" value={editEmergencyRelation} onChangeText={setEditEmergencyRelation} placeholder="Partner" />
            <View style={styles.formSectionLabel}><AppText variant="label">Medical decision maker</AppText><AppText variant="caption" muted>Who can make urgent care decisions?</AppText></View>
            <TextField label="Name" value={editDecisionName} onChangeText={setEditDecisionName} placeholder="Alex" />
            <TextField label="Phone" value={editDecisionPhone} onChangeText={setEditDecisionPhone} keyboardType="phone-pad" placeholder="+1 555 0100" />
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
      <Card style={styles.glanceCard}>
        <View style={styles.cardHeading}>
          <View style={styles.rowCopy}>
            <AppText variant="heading">Care at a glance</AppText>
            <AppText variant="caption" muted>Keep the everyday close without opening every record.</AppText>
          </View>
          <Button label="Open Care" variant="ghost" onPress={() => setPetSection("care")} />
        </View>
        <View style={styles.glanceStats}>
          <View style={styles.glanceStat}><AppText variant="title" style={{ color: theme.colors.brandStrong }}>{taskList.length}</AppText><AppText variant="caption" muted>ongoing plans</AppText></View>
          <View style={styles.glanceStat}><AppText variant="title" style={{ color: theme.colors.accentStrong }}>{medications.data?.medications.filter((item) => !item.ended_on).length ?? 0}</AppText><AppText variant="caption" muted>active medications</AppText></View>
        </View>
      </Card>
      </> : null}
      {petSection === "share" ? <>
      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <View style={styles.rowCopy}>
            <AppText variant="heading">Family access</AppText>
            <AppText variant="caption" muted>Choose which of your Families can see this Pet.</AppText>
          </View>
          <AppText variant="caption" style={{ color: theme.colors.brandStrong }}>{linkedFamilies.length} connected</AppText>
        </View>
        {linkedFamilies.map((family) => (
          <View key={family.id} style={[styles.accessRow, { borderColor: theme.colors.border }]}>
            <View style={styles.rowCopy}>
              <AppText variant="label">{family.name}</AppText>
              <AppText variant="caption" muted>{family.id === pet.circle_id ? "Primary Family" : "Shared Family"}</AppText>
            </View>
            {family.id !== pet.circle_id && canManagePet ? (
              unshareFamilyId === family.id ? (
                <View style={styles.actions}>
                  <Button label="Keep" variant="secondary" onPress={() => setUnshareFamilyId(null)} />
                  <Button label="Remove" variant="danger" loading={unsharePetFamily.isPending} onPress={() => unsharePetFamily.mutate()} />
                </View>
              ) : <Button label="Remove" variant="ghost" onPress={() => { setUnshareFamilyId(family.id); setFamilyShareError(""); }} />
            ) : null}
          </View>
        ))}
        {familyShareError ? <AppText variant="caption" style={{ color: theme.colors.danger }}>{familyShareError}</AppText> : null}
        {familyShareOpen ? (
          <View style={styles.transferForm}>
            <AppText variant="label">Add another Family</AppText>
            {availableFamilyShares.length ? (
              <SegmentedControl
                label="Family to share with"
                value={familyShareTargetId ?? availableFamilyShares[0]?.id ?? ""}
                onChange={(value) => { setFamilyShareTargetId(value); setFamilyShareError(""); }}
                options={availableFamilyShares.map((family) => ({ value: family.id, label: family.name }))}
              />
            ) : <AppText variant="caption" muted>Every Family you belong to already has access.</AppText>}
            <View style={styles.actions}>
              <Button label="Cancel" variant="secondary" onPress={() => { setFamilyShareOpen(false); setFamilyShareTargetId(null); setFamilyShareError(""); }} />
              <Button label="Share Pet" loading={sharePetFamily.isPending} disabled={!availableFamilyShares.length || isArchived} onPress={() => { setFamilyShareError(""); sharePetFamily.mutate(); }} />
            </View>
          </View>
        ) : canManagePet ? (
          <Button label="Share with another Family" variant="secondary" disabled={isArchived || !availableFamilyShares.length} onPress={() => { setFamilyShareOpen(true); setFamilyShareTargetId(availableFamilyShares[0]?.id ?? null); setFamilyShareError(""); }} />
        ) : null}
      </Card>
      </> : null}
      {petSection === "share" ? <>
      <Card style={styles.card}>
        <View style={styles.shareHeader}>
          <View style={[styles.shareIcon, { backgroundColor: theme.colors.brandSoft }]}>
            <ShareNetworkIcon size={21} color={theme.colors.brandStrong} weight="duotone" />
          </View>
          <View style={styles.rowCopy}>
            <AppText variant="heading">Share a care handoff</AppText>
            <AppText variant="caption" muted>
              Give a sitter or vet the right view. Every link expires and can be revoked.
            </AppText>
          </View>
        </View>
        {canManagePet ? <>
        <SegmentedControl
          label="What to share"
          value={shareKind}
          onChange={setShareKind}
          options={[{ value: "care_card", label: "Care card" }, { value: "summary", label: "Health summary" }]}
        />
        <SegmentedControl
          label="Link lifetime"
          value={shareTtl}
          onChange={setShareTtl}
          options={[{ value: "24", label: "24 hours" }, { value: "72", label: "3 days" }, { value: "168", label: "7 days" }]}
        />
        {shareKind === "summary" ? (
          <TextField
            label="Include the last (days)"
            value={shareDays}
            onChangeText={(value) => { setShareDays(value.replace(/\D/g, "").slice(0, 3)); setShareError(""); }}
            keyboardType="number-pad"
            hint="Profile, medications, and timeline events."
          />
        ) : null}
        {shareError ? <AppText style={{ color: theme.colors.danger }}>{shareError}</AppText> : null}
        {createdShare ? (
          <View style={[styles.shareResult, { backgroundColor: theme.colors.accentSurface, borderColor: theme.colors.border }]}>
            <AppText variant="label">{shareKindLabel(createdShare.share.kind)} ready</AppText>
            <AppText selectable variant="caption" muted>{createdShare.url}</AppText>
            <View style={styles.actions}>
              <Button
                label={copiedShare ? "Copied" : "Copy link"}
                variant="secondary"
                onPress={() => void Clipboard.setStringAsync(createdShare.url).then(() => setCopiedShare(true)).catch(() => setShareError("We could not copy the link. Press and hold it instead."))}
              />
              <Button label="Share" variant="primary" onPress={() => void NativeShare.share({ message: createdShare.url }).catch(() => setShareError("We could not open the share sheet. Press and hold the link to copy it instead."))} />
              <Button label="Create another" variant="ghost" onPress={() => { setCreatedShare(null); setCopiedShare(false); setShareError(""); }} />
            </View>
            <AppText variant="caption" muted>Only someone with this link can open it. Do not post it publicly.</AppText>
          </View>
        ) : (
          <Button
            label="Create secure link"
            variant="secondary"
            disabled={isArchived}
            loading={createShare.isPending}
            onPress={() => { setShareError(""); createShare.mutate(); }}
            icon={<ShareNetworkIcon size={17} color={theme.colors.brandStrong} weight="bold" />}
          />
        )}
        {shares.isError ? (
          <View style={styles.shareInlineError}>
            <AppText variant="caption" muted>Existing links could not be loaded.</AppText>
            <Button label="Retry" variant="ghost" onPress={() => void shares.refetch()} />
          </View>
        ) : shares.data?.shares.filter((item) => !item.revoked_at).length ? (
          <View style={styles.activeShares}>
            <AppText variant="caption" muted>ACTIVE LINKS</AppText>
            {shares.data.shares.filter((item) => !item.revoked_at).map((item) => (
              <View key={item.id} style={[styles.shareRow, { borderColor: theme.colors.border }]}>
                <View style={styles.rowCopy}>
                  <AppText variant="label">{shareKindLabel(item.kind)}</AppText>
                  <AppText variant="caption" muted>{shareExpiryLabel(item.expires_at)} · {item.view_count} {item.view_count === 1 ? "view" : "views"}</AppText>
                </View>
                {revokeShareId === item.id ? (
                  <View style={styles.actions}>
                    <Button label="Keep" variant="secondary" onPress={() => setRevokeShareId(null)} />
                    <Button label="Revoke" variant="danger" loading={revokeShare.isPending} onPress={() => revokeShare.mutate()} />
                  </View>
                ) : (
                  <Button label="Revoke" variant="ghost" onPress={() => { setRevokeShareId(item.id); setShareError(""); }} />
                )}
              </View>
            ))}
          </View>
        ) : null}
        </> : (
          <AppText variant="caption" muted>
            Only the current Pet owner can create or revoke external handoff links. Ask them to share a care card with you.
          </AppText>
        )}
      </Card>
      </> : null}
      {petSection === "care" ? <>
      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <View>
            <AppText variant="heading">Care plan</AppText>
            <AppText variant="caption" muted>
              {taskList.length} ongoing{" "}
              {taskList.length === 1 ? "item" : "items"}
            </AppText>
          </View>
          {canManagePet ? <Button
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
              setPetSection("care");
              setEditingTaskId(null);
              setForm("care");
              setError("");
            }}
          /> : <AppText variant="caption" muted>Owner-managed</AppText>}
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
                onActions={canManagePet ? () => {
                  setTaskMenuId((current) => (current === task.id ? null : task.id));
                  setConfirmTaskId(null);
                  setError("");
                } : undefined}
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
        {archivedTaskList.length > 0 ? (
          <View style={styles.archivedSection}>
            <View style={styles.sectionHeader}>
              <View>
                <AppText variant="label">Past care plans</AppText>
                <AppText variant="caption" muted>Archived plans stay here with their history.</AppText>
              </View>
              <AppText variant="caption" muted>{archivedTaskList.length}</AppText>
            </View>
            {archivedTaskList.map((task) => (
              <View key={task.id} style={[styles.archivedRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised }]}>
                <View style={styles.archivedCopy}>
                  <AppText variant="label" style={{ color: theme.colors.textMuted }}>{task.title}</AppText>
                  <AppText variant="caption" muted>Archived · history preserved</AppText>
                </View>
                {canManagePet ? <Button label="Restore" variant="secondary" loading={restoreTask.isPending && restoreTaskId === task.id} disabled={restoreTask.isPending} onPress={() => { setError(""); setRestoreTaskId(task.id); restoreTask.mutate(task.id); }} /> : null}
              </View>
            ))}
          </View>
        ) : null}
        {form === "care" && canManagePet ? (
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
            <DateTimeField label="Time (optional)" value={timeOfDayValue} mode="time" onChange={(value) => { setTimeOfDayValue(value); setTimeOfDay(timeKey(value)); setError(""); }} onClear={() => { setTimeOfDayValue(null); setTimeOfDay(""); setError(""); }} placeholder="Choose a time" />
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
            disabled={isArchived || !canEditPet}
            onPress={() => {
              setPetSection("care");
              setEditingMedicationId(null);
              setMedName("");
              setMedDose("");
              setMedSchedule("");
              setMedNote("");
              setForm("medication");
              setError("");
            }}
          />
        </View>
        {medications.data?.medications.map((med) => (
          <View key={med.id} style={styles.medicationRow}>
            <View style={styles.medicationCopy}>
              <AppText variant="label">
                {med.name}
                {med.ended_on ? " · stopped" : ""}
              </AppText>
              {med.dose || med.schedule ? (
                <AppText variant="caption" muted>
                  {[med.dose, med.schedule].filter(Boolean).join(" · ")}
                </AppText>
              ) : null}
              {med.note ? <AppText variant="caption" muted>{med.note}</AppText> : null}
            </View>
            {!isArchived && canEditPet ? (
              <View style={styles.medicationActions}>
                {canManagePet ? <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${med.name}`}
                  onPress={() => openMedicationEditor(med)}
                  hitSlop={6}
                >
                  <AppText variant="caption" style={{ color: theme.colors.brandStrong }}>Edit</AppText>
                </Pressable> : null}
                {!med.ended_on ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Stop ${med.name}`}
                    onPress={() => { setMedicationAction({ id: med.id, kind: "stop" }); setError(""); }}
                    hitSlop={6}
                  >
                    <AppText variant="caption" style={{ color: theme.colors.textMuted }}>Stop</AppText>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${med.name}`}
                  onPress={() => { setMedicationAction({ id: med.id, kind: "delete" }); setError(""); }}
                  hitSlop={6}
                >
                  <AppText variant="caption" style={{ color: theme.colors.danger }}>Delete</AppText>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
        {medicationAction ? (() => {
          const selectedMedication = medications.data?.medications.find((item) => item.id === medicationAction.id);
          if (!selectedMedication) return null;
          const deleting = medicationAction.kind === "delete";
          return (
            <View style={[styles.confirmBox, { backgroundColor: deleting ? theme.colors.surfaceRaised : theme.colors.accentSurface }]}>
              <AppText variant="label">{deleting ? `Delete ${selectedMedication.name}?` : `Stop ${selectedMedication.name}?`}</AppText>
              <AppText variant="caption" muted>
                {deleting ? "This removes the medication entry from the Pet record." : "Stopping keeps the medication and its history, but records that it is no longer active."}
              </AppText>
              {error ? <AppText variant="caption" style={{ color: theme.colors.danger }}>{error}</AppText> : null}
              <View style={styles.actions}>
                <Button label="Cancel" variant="secondary" onPress={() => { setMedicationAction(null); setError(""); }} />
                <Button
                  label={deleting ? "Delete medication" : "Stop medication"}
                  variant={deleting ? "danger" : "primary"}
                  loading={stopMedication.isPending || deleteMedication.isPending}
                  onPress={() => deleting ? deleteMedication.mutate() : stopMedication.mutate()}
                />
              </View>
            </View>
          );
        })() : null}
        {form === "medication" && canEditPet ? (
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
                onPress={resetMedicationForm}
              />
              <Button
                label={editingMedicationId ? "Save changes" : "Save medication"}
                loading={addMedication.isPending || updateMedication.isPending}
                disabled={!medName.trim()}
                onPress={submitMedication}
              />
            </View>
          </View>
        ) : null}
      </Card>
      </> : null}
      {petSection === "manage" ? <Card style={styles.lifecycleCard}>
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
        {exportError ? <AppText variant="caption" style={{ color: theme.colors.danger }}>{exportError}</AppText> : null}
        {transferNotice ? <AppText variant="caption" style={{ color: theme.colors.brandStrong }}>{transferNotice}</AppText> : null}
        {canManagePet && !isArchived ? (
          transferOpen ? (
            <View style={styles.transferForm}>
              <AppText variant="label">Move {pet.name} to another Family</AppText>
              <AppText variant="caption" muted>The other Family owner must accept. Until then, this Pet and all access remain unchanged.</AppText>
              <AppText variant="caption" muted>When accepted, existing external share links are revoked. Create a new link from the destination Family if needed.</AppText>
              {targetFamilies.length ? (
                <SegmentedControl
                  label="Destination Family"
                  value={transferTargetId ?? targetFamilies[0]?.id ?? ""}
                  onChange={(value) => { setTransferTargetId(value); setTransferError(""); }}
                  options={targetFamilies.map((item) => ({ value: item.id, label: item.name }))}
                />
              ) : <AppText variant="caption" muted>Create or join another Family first.</AppText>}
              {transferError ? <AppText variant="caption" style={{ color: theme.colors.danger }}>{transferError}</AppText> : null}
              <View style={styles.actions}>
                <Button label="Keep here" variant="secondary" onPress={() => { setTransferOpen(false); setTransferTargetId(null); setTransferError(""); }} />
                <Button label="Send handoff request" loading={transferPet.isPending} disabled={!targetFamilies.length} onPress={() => { setTransferError(""); transferPet.mutate(); }} />
              </View>
            </View>
          ) : (
            <Button label="Move to another Family" variant="secondary" onPress={() => { setTransferOpen(true); setTransferTargetId(targetFamilies[0]?.id ?? null); setTransferNotice(""); setTransferError(""); }} />
          )
        ) : null}
        {canManagePet && lifecycleAction ? (
          <View style={[styles.confirmBox, { backgroundColor: lifecycleAction === "delete" ? theme.colors.surfaceRaised : theme.colors.accentSurface }]}>
            <AppText variant="label">{lifecycleAction === "archive" ? `Archive ${pet.name}?` : lifecycleAction === "restore" ? `Restore ${pet.name}?` : `Delete ${pet.name} permanently?`}</AppText>
            <AppText variant="caption" muted>
              {lifecycleAction === "archive" ? "Future care moments and reminders stop. The profile and history remain available." : lifecycleAction === "restore" ? "Active care can be scheduled again after restoring this Pet." : "This removes the Pet and its care history. Export anything you need first."}
            </AppText>
            {lifecycleAction === "delete" ? <TextField label={`Type ${pet.name} to confirm`} value={deleteConfirmName} onChangeText={(value) => { setDeleteConfirmName(value); setError(""); }} placeholder={pet.name} autoCapitalize="none" autoCorrect={false} /> : null}
            <View style={styles.actions}>
              <Button label="Cancel" variant="secondary" onPress={() => { setLifecycleAction(null); setDeleteConfirmName(""); }} />
              <Button
                label={lifecycleAction === "archive" ? "Archive Pet" : lifecycleAction === "restore" ? "Restore Pet" : "Delete permanently"}
                variant={lifecycleAction === "delete" ? "danger" : "primary"}
                loading={archivePet.isPending || restorePet.isPending || deletePet.isPending}
                disabled={lifecycleAction === "delete" && deleteConfirmName.trim() !== pet.name}
                onPress={() => lifecycleAction === "archive" ? archivePet.mutate() : lifecycleAction === "restore" ? restorePet.mutate() : deletePet.mutate()}
              />
            </View>
          </View>
          ) : canManagePet ? (
            <View style={styles.actions}>
              <Button label="Export record" variant="secondary" loading={exportPet.isPending} onPress={() => { setExportError(""); exportPet.mutate(); }} />
              {isArchived ? <Button label="Restore Pet" variant="secondary" onPress={() => setLifecycleAction("restore")} /> : <Button label="Archive Pet" variant="secondary" onPress={() => setLifecycleAction("archive")} />}
            <Button label="Delete Pet" variant="danger" onPress={() => { setDeleteConfirmName(""); setLifecycleAction("delete"); }} />
          </View>
        ) : (
          <AppText variant="caption" muted>
            Pet lifecycle controls are limited to the current Pet owner. You can still care for this record within your access level.
          </AppText>
        )}
      </Card> : null}
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
  petSwitcher: { gap: 7 },
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
  glanceCard: { gap: 12 },
  glanceStats: { flexDirection: "row", gap: 28, paddingTop: 2 },
  glanceStat: { gap: 1 },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  profileStats: { flexDirection: "row", gap: 30, paddingTop: 4 },
  safetyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 2 },
  safetyCell: { flex: 1, minWidth: 120, gap: 3, padding: 10, borderRadius: 14 },
  shareHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  shareIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  shareResult: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 8 },
  shareInlineError: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  activeShares: { gap: 8, paddingTop: 4 },
  shareRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  accessRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  form: { gap: 12 },
  formSectionLabel: { gap: 2, paddingTop: 4 },
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
  archivedSection: { gap: 9, marginTop: 8 },
  archivedRow: { minHeight: 66, borderWidth: 1, borderRadius: 16, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  archivedCopy: { flex: 1, gap: 3 },
  medicationRow: { gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center" },
  medicationCopy: { flex: 1, gap: 2 },
  medicationActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  lifecycleCard: { gap: 12 },
  transferForm: { gap: 9, paddingTop: 2 },
  toggleRow: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  toggleCopy: { flex: 1, gap: 2 },
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
