import { useState, useEffect, useMemo, useRef } from "react";
import { Share as NativeShare } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import {
  useAccessiblePets,
  useCareAssignments,
  useFamily,
  useFamilies,
  useInvalidateApi,
  useMedications,
  useMe,
  usePet,
  usePetShares,
  useCarePlans,
  useTodayForPet,
} from "../../core/query/hooks";
import { planetApi, type Medication, type Share, type Task } from "../../core/api/planet-api";
import { appConfig } from "../../core/config";
import {
  carePlanPayload,
  carePlanSchema,
  medicationSchema,
  petSchema,
  sharePayload,
  shareSchema,
  taskPayload,
  taskSchema,
} from "../../core/forms";
import { ApiError } from "../../core/network/api-client";
import { useToast } from "../../core/providers/toast-provider";
import { useIdempotencyKey } from "../../core/hooks/use-idempotency-key";
import { careTypeOptions, type CareType, type PetSection, type ScheduleKind } from "./types";
import { parseTimeKey } from "./helpers";

export function usePetFeature(params: { petId?: string; intent?: string }) {
  const { showToast } = useToast();
  const navigation = useNavigation();
  const router = useRouter();
  const me = useMe();
  const families = useFamilies();
  const familyIds = families.data?.families.map((item) => item.id) ?? [];
  const accessiblePets = useAccessiblePets(familyIds);
  const selectedPetId = typeof params.petId === "string" ? params.petId : undefined;
  // An explicit deep link is authoritative. Never silently replace an
  // unavailable Pet with the first accessible Pet; that can turn an invalid
  // link into an edit/archive action against the wrong record.
  const listedPet = selectedPetId
    ? accessiblePets.pets.find((candidate) => candidate.id === selectedPetId)
    : accessiblePets.pets[0];
  const detail = usePet(listedPet?.id);
  const pet = detail.data?.pet ?? listedPet;
  const visibleFamily = pet
    ? families.data?.families.find((family) => family.id === pet.family_ids?.[0])
    : undefined;
  const sourceFamily = visibleFamily;
  const sourceFamilyDetail = useFamily(sourceFamily?.id);
  const canManagePet = Boolean(
    pet && me.data?.user.id &&
      (pet.current_owner_user_id === me.data.user.id ||
        (!pet.current_owner_user_id && sourceFamily?.role === "owner")),
  );
  const medications = useMedications(pet?.id);
  const carePlans = useCarePlans(pet?.id, true);
  const today = useTodayForPet(pet?.id);
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
  const [careStep, setCareStep] = useState<1 | 2 | 3>(1);
  const [careTitle, setCareTitle] = useState("");
  const [careDescription, setCareDescription] = useState("");
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("daily");
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
  const [monthlyDay, setMonthlyDay] = useState("1");
  const [everyN, setEveryN] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("");
  const [timeOfDayValue, setTimeOfDayValue] = useState<Date | null>(null);
  const [careStartDate, setCareStartDate] = useState("");
  const [careStartDateValue, setCareStartDateValue] = useState<Date | null>(null);
  const [careEndDate, setCareEndDate] = useState("");
  const [careEndDateValue, setCareEndDateValue] = useState<Date | null>(null);
  const [careHelperSelection, setCareHelperSelection] = useState<string | null>("");
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
  const recordUpdateIntent = useIdempotencyKey();

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: form ? { display: "none" } : undefined });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [form, navigation]);

  const resetCareForm = () => {
    setCareType("custom");
    setCareStep(1);
    setCareTitle("");
    setCareDescription("");
    setScheduleKind("daily");
    setWeeklyDays([]);
    setMonthlyDay("1");
    setEveryN("");
    setTimeOfDay("");
    setTimeOfDayValue(null);
    setCareStartDate("");
    setCareStartDateValue(null);
    setCareEndDate("");
    setCareEndDateValue(null);
    setCareHelperSelection("");
    setError("");
    setEditingTaskId(null);
    setTaskMenuId(null);
    setConfirmTaskId(null);
    setRestoreTaskId(null);
    setForm(null);
  };
  const resetMedicationForm = () => {
    setMedName("");
    setMedDose("");
    setMedSchedule("");
    setMedNote("");
    setEditingMedicationId(null);
    setForm(null);
    setError("");
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
  const taskForEditor = editingTaskId
    ? carePlans.data?.care_plans.find((task) => task.id === editingTaskId)
    : undefined;
  const careAssignments = useCareAssignments(taskForEditor?.care_plan_id);
  const addCare = useMutation({
    mutationFn: async () => {
      const result = await planetApi.pets.createCarePlan(
        pet!.id,
        carePlanPayload({
          type: careType,
          title: careTitle,
          description: careDescription,
          schedule_kind: scheduleKind,
          weekly_days: weeklyDays,
          monthly_day: monthlyDay,
          every_n: everyN,
          time_of_day: timeOfDay,
          start_date: careStartDate,
          end_date: careEndDate,
        }),
        careCreateIntent.current(),
      );
      let helperAssigned = true;
      if (careHelperSelection) {
        try {
          await planetApi.carePlans.setAssignment(result.care_plan.id, careHelperSelection);
        } catch {
          helperAssigned = false;
        }
      }
      return { result, helperAssigned };
    },
    onSuccess: ({ result, helperAssigned }) => {
      resetCareForm();
      careCreateIntent.reset();
      setError(helperAssigned ? "" : "Care plan created, but the helper assignment did not save. You can retry it from Care.");
      invalidate.carePlans(pet!.id);
      invalidate.assignments(result.care_plan.id);
      invalidate.todayAll();
      router.replace({ pathname: "/(tabs)/pet", params: { petId: pet!.id } });
      showToast({ message: helperAssigned ? "Care plan added to Today." : "Care plan added; helper assignment needs attention.", actionLabel: "Open Today", onAction: () => router.replace({ pathname: "/(tabs)", params: { petId: pet!.id } }) });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : "Unable to add this care plan.",
      ),
  });
  const updateTask = useMutation({
    mutationFn: async () => {
      const result = await planetApi.carePlans.update(
        editingTaskId!,
        taskPayload({
          title: careTitle,
          description: careDescription,
          schedule_kind: scheduleKind,
          weekly_days: weeklyDays,
          monthly_day: monthlyDay,
          every_n: everyN,
          time_of_day: timeOfDay,
        }),
      );
      if (taskForEditor?.care_plan_id && careHelperSelection !== null) {
        try {
          const existingHelpers = careAssignments.data?.assignments.filter((assignment) => assignment.role === "helper") ?? [];
          if (careHelperSelection) {
            for (const helper of existingHelpers) {
              if (helper.user_id !== careHelperSelection) await planetApi.carePlans.removeAssignment(taskForEditor.care_plan_id, helper.user_id);
            }
            await planetApi.carePlans.setAssignment(taskForEditor.care_plan_id, careHelperSelection);
          } else {
            for (const helper of existingHelpers) await planetApi.carePlans.removeAssignment(taskForEditor.care_plan_id, helper.user_id);
          }
        } catch {
          throw new Error("Care plan updated, but the helper change could not be saved. Open it again to retry.");
        }
      }
      return result;
    },
    onSuccess: () => {
      resetCareForm();
      invalidate.carePlans(pet!.id);
      if (taskForEditor?.care_plan_id) invalidate.assignments(taskForEditor.care_plan_id);
      invalidate.todayAll();
      showToast({ message: "Care plan updated." });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : "Unable to update this care plan.",
      ),
  });
  const archiveTask = useMutation({
    mutationFn: () => planetApi.carePlans.update(confirmTaskId!, { archived: true }),
    onSuccess: () => {
      setConfirmTaskId(null);
      setTaskMenuId(null);
      invalidate.carePlans(pet!.id);
      invalidate.todayAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to archive this care plan."),
  });
  const restoreTask = useMutation({
    mutationFn: (taskId: string) => planetApi.carePlans.update(taskId, { archived: false }),
    onSuccess: () => {
      setRestoreTaskId(null);
      setTaskMenuId(null);
      invalidate.carePlans(pet!.id);
      invalidate.todayAll();
      showToast({ message: "Care plan restored." });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to restore this care plan."),
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
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to add this medication."),
  });
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
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to update this medication."),
  });
  const stopMedication = useMutation({
    mutationFn: () => planetApi.medications.stop(medicationAction!.id),
    onSuccess: () => {
      setMedicationAction(null);
      setError("");
      invalidate.medications(pet!.id);
      invalidate.timeline(pet!.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to stop this medication."),
  });
  const deleteMedication = useMutation({
    mutationFn: () => planetApi.medications.delete(medicationAction!.id),
    onSuccess: () => {
      setMedicationAction(null);
      setError("");
      invalidate.medications(pet!.id);
      invalidate.timeline(pet!.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to remove this medication."),
  });
  const editProfile = useMutation({
    mutationFn: async () => {
      const names = (value: string) => value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).map((name) => ({ name }));
      return planetApi.pets.updateRecord(pet!.id, {
        version: pet!.version,
        name: editName.trim(),
        species: editSpecies,
        breed: editBreed.trim(),
        birth_date: editBirthDate,
        sex: editSex,
        neutered: editNeutered,
        notes: editNotes.trim(),
        allergies: names(editAllergies),
        conditions: names(editConditions),
        emergency_contacts: editEmergencyName.trim() || editEmergencyPhone.trim() ? [{ name: editEmergencyName.trim(), phone: editEmergencyPhone.trim(), relation: editEmergencyRelation.trim() }] : [],
        med_decision_maker: editDecisionName.trim() || editDecisionPhone.trim() ? { name: editDecisionName.trim(), phone: editDecisionPhone.trim() } : {},
      }, recordUpdateIntent.current());
    },
    onSuccess: () => {
      setError("");
      setForm(null);
      recordUpdateIntent.reset();
      invalidate.pet(pet!.id);
      invalidate.petsAll();
    },
    onError: (err) => {
      invalidate.pet(pet!.id);
      invalidate.petsAll();
      setError(err instanceof ApiError ? err.message : "Unable to save the Pet details.");
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
      invalidate.families();
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
      invalidate.families();
      invalidate.petsAll();
      if (pet?.family_ids?.[0]) invalidate.transfers(pet.family_ids[0]);
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
      setCreatedShare({ share: result.share, url: `${appConfig.publicWebBaseUrl}/share/${result.token}` });
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
  const taskList = useMemo(() => (carePlans.data?.care_plans ?? []).filter((task) => !task.archived_at), [carePlans.data?.care_plans]);
  const medicationCount = medications.data?.medications.length ?? 0;
  const archivedTaskList = useMemo(() => (carePlans.data?.care_plans ?? []).filter((task) => Boolean(task.archived_at)), [carePlans.data?.care_plans]);
  const careHelperOptions = useMemo(
    () => [
      { value: "", label: "Only me" },
      ...(sourceFamilyDetail.data?.members ?? [])
        .filter((member) => member.user_id !== me.data?.user.id)
        .map((member) => ({ value: member.user_id, label: member.display_name || member.email || "Family member" })),
    ],
    [me.data?.user.id, sourceFamilyDetail.data?.members],
  );
  const existingCareHelper = careAssignments.data?.assignments.find((assignment) => assignment.role === "helper");
  const selectedCareHelper = careHelperSelection ?? existingCareHelper?.user_id ?? "";
  const isArchived = Boolean(pet?.archived_at);
  const linkedFamilyIds = new Set(pet?.family_ids ?? []);
  const targetFamilies = families.data?.families.filter((item) => !linkedFamilyIds.has(item.id)) ?? [];
  const linkedFamilies = families.data?.families.filter((item) => linkedFamilyIds.has(item.id)) ?? [];
  const availableFamilyShares = families.data?.families.filter((item) => !linkedFamilyIds.has(item.id)) ?? [];
  const knownFamilyRoles = linkedFamilies.map((family) => family.role).filter(Boolean);
  const isReadOnlyMember = knownFamilyRoles.length > 0 && knownFamilyRoles.every((role) => role === "viewer" || role === "read_only");
  const directReadOnly = pet?.access_role === "viewer" || pet?.access_role === "read_only";
  const canEditPet = Boolean(pet && !isArchived && !isReadOnlyMember && !directReadOnly);

  useEffect(() => {
    const intentKey = `${selectedPetId ?? pet?.id ?? ""}:${params.intent ?? ""}`;
    if (handledIntentKey.current !== intentKey && params.intent === "care" && pet && !isArchived) {
      setPetSection("care");
      setCareStep(1);
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
    setCareType(careTypeOptions.some((option) => option.value === task.type) ? task.type as CareType : "custom");
    setCareDescription(task.description ?? "");
    setScheduleKind(kind);
    setWeeklyDays(Array.isArray(raw.days) ? (raw.days as number[]) : []);
    setMonthlyDay(typeof raw.day === "number" ? String(raw.day) : "1");
    setEveryN(typeof raw.every_n === "number" ? String(raw.every_n) : "");
    setTimeOfDay(task.time_of_day ?? "");
    setTimeOfDayValue(parseTimeKey(task.time_of_day));
    setCareHelperSelection(null);
    setCareStep(1);
    setError("");
    setForm("care");
  }

  function submitCare() {
    if (editingTaskId) {
      const parsed = taskSchema.safeParse({
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
      updateTask.mutate();
      return;
    }
    const parsed = carePlanSchema.safeParse({
      type: careType,
      title: careTitle,
      description: careDescription,
      schedule_kind: scheduleKind,
      weekly_days: weeklyDays,
      monthly_day: monthlyDay,
      every_n: everyN,
      time_of_day: timeOfDay,
      start_date: careStartDate,
      end_date: careEndDate,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the care plan.");
      return;
    }
    setError("");
    addCare.mutate();
  }

  function continueCareSetup() {
    if (careStep === 1) {
      if (!careTitle.trim()) {
        setError("Name the care moment so everyone knows what to do.");
        return;
      }
      setError("");
      setCareStep(2);
      return;
    }
    if (careStep === 2) {
      const parsed = taskSchema.safeParse({
        title: careTitle,
        description: careDescription,
        schedule_kind: scheduleKind,
        weekly_days: weeklyDays,
        monthly_day: monthlyDay,
        every_n: everyN,
        time_of_day: timeOfDay,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Choose when this care repeats.");
        return;
      }
      setError("");
      setCareStep(3);
      return;
    }
    submitCare();
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
    void families.refetch();
    void accessiblePets.refetch();
    void me.refetch();
    if (pet) {
      void detail.refetch();
      void medications.refetch();
      void carePlans.refetch();
      void today.refetch();
    }
  };
  const loading = families.isLoading || me.isLoading || accessiblePets.isLoading || (pet && (detail.isLoading || medications.isLoading || carePlans.isLoading || today.isLoading));
  const blockingError = (me.isError && !me.data) || (families.isError && !families.data) || (accessiblePets.isError && !accessiblePets.hasData) || (!pet && detail.isError);
  const hasStaleData = Boolean((me.isError && me.data) || (families.isError && families.data) || (accessiblePets.isError && accessiblePets.hasData) || (detail.isError && pet) || medications.isError || carePlans.isError || (today.isError && today.data));

  const profile = detail.data?.profile;
  const todayItems = today.data?.pets.find((item) => item.pet_id === pet?.id)?.items ?? [];
  const todayCompleted = todayItems.filter((item) => item.log?.status === "done" || item.log?.status === "completed").length;
  const todaySkipped = todayItems.filter((item) => item.log?.status === "skipped").length;
  const todayOpen = todayItems.length - todayCompleted - todaySkipped;
  const todaySummaryTitle = today.isError ? "Today's care is unavailable" : today.isLoading ? "Checking today's care…" : todayItems.length === 0 ? "A clear day" : todayOpen === 0 ? "Everything is cared for" : `${todayOpen} moment${todayOpen === 1 ? "" : "s"} still open`;
  const todaySummaryCaption = today.isError ? "Reconnect to refresh today's actions." : today.isLoading ? "Loading the latest care moments." : todayItems.length === 0 ? "No routine is due today." : `${todayCompleted} done${todaySkipped ? ` · ${todaySkipped} skipped` : ""} · ${todayItems.length} total`;

  return {
    router,
    me,
    families,
    accessiblePets,
    detail,
    pet,
    visibleFamily,
    sourceFamilyDetail,
    canManagePet,
    medications,
    carePlans,
    today,
    shares,
    invalidate,
    petSection,
    setPetSection,
    profile,
    todaySummaryTitle,
    todaySummaryCaption,
    loading,
    blockingError,
    hasStaleData,
    retryPet,
    form,
    setForm,
    error,
    setError,
    editingTaskId,
    setEditingTaskId,
    taskMenuId,
    setTaskMenuId,
    confirmTaskId,
    setConfirmTaskId,
    restoreTaskId,
    setRestoreTaskId,
    careType,
    setCareType,
    careStep,
    setCareStep,
    careTitle,
    setCareTitle,
    careDescription,
    setCareDescription,
    scheduleKind,
    setScheduleKind,
    weeklyDays,
    setWeeklyDays,
    monthlyDay,
    setMonthlyDay,
    everyN,
    setEveryN,
    timeOfDay,
    setTimeOfDay,
    timeOfDayValue,
    setTimeOfDayValue,
    careStartDate,
    setCareStartDate,
    careStartDateValue,
    setCareStartDateValue,
    careEndDate,
    setCareEndDate,
    careEndDateValue,
    setCareEndDateValue,
    careHelperSelection,
    setCareHelperSelection,
    medName,
    setMedName,
    editName,
    setEditName,
    editSpecies,
    setEditSpecies,
    editBreed,
    setEditBreed,
    editBirthDate,
    setEditBirthDate,
    editBirthDateValue,
    setEditBirthDateValue,
    editSex,
    setEditSex,
    editNeutered,
    setEditNeutered,
    editNotes,
    setEditNotes,
    editAllergies,
    setEditAllergies,
    editConditions,
    setEditConditions,
    editEmergencyName,
    setEditEmergencyName,
    editEmergencyPhone,
    setEditEmergencyPhone,
    editEmergencyRelation,
    setEditEmergencyRelation,
    editDecisionName,
    setEditDecisionName,
    editDecisionPhone,
    setEditDecisionPhone,
    medDose,
    setMedDose,
    medSchedule,
    setMedSchedule,
    medNote,
    setMedNote,
    editingMedicationId,
    setEditingMedicationId,
    medicationAction,
    setMedicationAction,
    lifecycleAction,
    setLifecycleAction,
    deleteConfirmName,
    setDeleteConfirmName,
    shareKind,
    setShareKind,
    shareTtl,
    setShareTtl,
    shareDays,
    setShareDays,
    shareError,
    setShareError,
    createdShare,
    setCreatedShare,
    revokeShareId,
    setRevokeShareId,
    copiedShare,
    setCopiedShare,
    transferOpen,
    setTransferOpen,
    transferTargetId,
    setTransferTargetId,
    transferError,
    setTransferError,
    transferNotice,
    setTransferNotice,
    exportError,
    setExportError,
    familyShareOpen,
    setFamilyShareOpen,
    familyShareTargetId,
    setFamilyShareTargetId,
    familyShareError,
    setFamilyShareError,
    unshareFamilyId,
    setUnshareFamilyId,
    taskList,
    archivedTaskList,
    medicationCount,
    careHelperOptions,
    selectedCareHelper,
    isArchived,
    canEditPet,
    linkedFamilies,
    targetFamilies,
    availableFamilyShares,
    resetCareForm,
    resetMedicationForm,
    openTaskEditor,
    continueCareSetup,
    submitCare,
    submitMedication,
    openMedicationEditor,
    submitProfile,
    addCare,
    updateTask,
    archiveTask,
    restoreTask,
    addMedication,
    updateMedication,
    stopMedication,
    deleteMedication,
    editProfile,
    archivePet,
    restorePet,
    deletePet,
    transferPet,
    exportPet,
    sharePetFamily,
    unsharePetFamily,
    createShare,
    revokeShare,
  };
}

export type PetFeature = ReturnType<typeof usePetFeature>;
