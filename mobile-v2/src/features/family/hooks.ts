import React, { useState } from "react";
import { useNavigation } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import {
  useFamily,
  useFamilyPets,
  useFamilies,
  useDeletedFamilies,
  useInvalidateApi,
  useMe,
  useTransfers,
} from "../../core/query/hooks";
import { planetApi, type Transfer } from "../../core/api/planet-api";
import { ApiError } from "../../core/network/api-client";
import { familySchema, joinFamilySchema } from "../../core/forms";
import { useToast } from "../../core/providers/toast-provider";
import { useIdempotencyKey } from "../../core/hooks/use-idempotency-key";
import { readViewPreference } from "../../core/storage/view-preference";

export type FamilySection = "overview" | "people" | "manage";

export function memberRoleLabel(role: string) {
  if (role === "owner") return "Family owner";
  if (role === "editor") return "Editor";
  if (role === "viewer" || role === "read_only") return role === "viewer" ? "Viewer" : "Read-only viewer";
  return "Caregiver";
}

export function deviceTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function useFamilyFeature(params: { mode?: string; familyId?: string; code?: string }) {
  const { showToast } = useToast();
  const navigation = useNavigation();
  const me = useMe();
  const families = useFamilies();
  const deletedFamilies = useDeletedFamilies();

  const [activeFamilyId, setActiveFamilyId] = useState<string>();
  const [preferredFamilyId, setPreferredFamilyId] = useState<string>();
  const [familySection, setFamilySection] = useState<FamilySection>("overview");
  const createIntent = useIdempotencyKey();

  const family =
    families.data?.families.find((item) => item.id === activeFamilyId) ??
    families.data?.families[0];

  const detail = useFamily(family?.id);
  const pets = useFamilyPets(family?.id);
  const incomingTransfers = useTransfers(family?.role === "owner" ? family.id : undefined, "incoming");
  const outgoingTransfers = useTransfers(family?.role === "owner" ? family.id : undefined, "outgoing");
  const invalidate = useInvalidateApi();

  const [mode, setMode] = useState<"none" | "create" | "join">(params.mode === "join" ? "join" : params.mode === "create" ? "create" : "none");
  const [name, setName] = useState("");
  const [code, setCode] = useState(params.code ?? "");
  const [invite, setInvite] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [editingFamily, setEditingFamily] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [familyTimezone, setFamilyTimezone] = useState("");
  const [familyAction, setFamilyAction] = useState<"leave" | "delete" | null>(null);
  const [deleteFamilyConfirm, setDeleteFamilyConfirm] = useState("");
  const [memberAction, setMemberAction] = useState<string | null>(null);
  const [ownershipTarget, setOwnershipTarget] = useState<string | null>(null);

  const editing = mode !== "none" || editingFamily || Boolean(familyAction) || Boolean(memberAction) || Boolean(ownershipTarget);

  React.useEffect(() => {
    navigation.setOptions({ tabBarStyle: editing ? { display: "none" } : undefined });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [editing, navigation]);

  React.useEffect(() => {
    if (params.mode === "join" || params.mode === "create") setMode(params.mode);
  }, [params.mode]);

  React.useEffect(() => {
    if (params.code) {
      setCode(params.code.toUpperCase());
      setMode("join");
      setError("");
    }
  }, [params.code]);

  React.useEffect(() => {
    const userId = me.data?.user.id;
    if (!userId) return;
    void readViewPreference(userId).then((preference) => {
      if (preference?.kind === "family") setPreferredFamilyId(preference.familyId);
    });
  }, [me.data?.user.id]);

  React.useEffect(() => {
    const requestedId = params.familyId ?? preferredFamilyId;
    if (requestedId && families.data?.families.some((item) => item.id === requestedId)) setActiveFamilyId(requestedId);
  }, [families.data?.families, params.familyId, preferredFamilyId]);

  const create = useMutation({
    mutationFn: () => planetApi.families.create(name.trim(), deviceTimezone(), createIntent.current()),
    onSuccess: (result) => {
      createIntent.reset();
      setName("");
      setMode("none");
      setInvite(result.invite_code);
      setActiveFamilyId(result.family.id);
      invalidate.families();
      showToast({ message: "Family created. Now add a Pet to begin care." });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Unable to create your Family.",
      ),
  });
  const join = useMutation({
    mutationFn: () => planetApi.families.join(code.trim()),
    onSuccess: (result) => {
      setCode("");
      setMode("none");
      setActiveFamilyId(result.family.id);
      invalidate.families();
      showToast({ message: "You joined the Family." });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError
          ? err.message
          : "That invite could not be accepted.",
      ),
  });
  const refresh = useMutation({
    mutationFn: () => planetApi.families.refreshInvite(family!.id),
    onSuccess: (result) => {
      setInvite(result.invite_code);
      setCopied(false);
      showToast({ message: "Invite code refreshed." });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to refresh the invite code."),
  });
  const updateFamily = useMutation({
    mutationFn: () => planetApi.families.update(family!.id, { name: familyName.trim(), timezone: familyTimezone.trim() }),
    onSuccess: () => {
      setEditingFamily(false);
      setError("");
      invalidate.families();
      invalidate.family(family!.id);
      invalidate.todayAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to update this Family."),
  });
  const removeMember = useMutation({
    mutationFn: () => planetApi.families.removeMember(family!.id, memberAction!),
    onSuccess: () => {
      setMemberAction(null);
      invalidate.family(family!.id);
      invalidate.todayAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to remove this member."),
  });
  const transferOwnership = useMutation({
    mutationFn: (userId: string) => planetApi.families.transfer(family!.id, userId),
    onSuccess: () => {
      setError("");
      setOwnershipTarget(null);
      invalidate.families();
      invalidate.family(family!.id);
      invalidate.todayAll();
      showToast({ message: "Family ownership transferred." });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to transfer ownership."),
  });
  const decidePetTransfer = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "decline" }) => action === "accept" ? planetApi.transfers.accept(id) : planetApi.transfers.decline(id),
    onSuccess: () => {
      setError("");
      if (family) {
        invalidate.transfers(family.id);
        invalidate.families();
        invalidate.petsAll();
        invalidate.todayAll();
      }
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to update this Pet handoff."),
  });
  const cancelPetTransfer = useMutation({
    mutationFn: (id: string) => planetApi.transfers.cancel(id),
    onSuccess: () => family && invalidate.transfers(family.id),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to cancel this Pet handoff."),
  });
  const leaveFamily = useMutation({
    mutationFn: () => planetApi.families.leave(family!.id),
    onSuccess: () => {
      setFamilyAction(null);
      setActiveFamilyId(undefined);
      invalidate.families();
      invalidate.todayAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to leave this Family."),
  });
  const deleteFamily = useMutation({
    mutationFn: () => planetApi.families.delete(family!.id, deleteFamilyConfirm.trim()),
    onSuccess: () => {
      setDeleteFamilyConfirm("");
      setFamilyAction(null);
      setActiveFamilyId(undefined);
      invalidate.families();
      invalidate.deletedFamilies();
      invalidate.todayAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to delete this Family."),
  });
  const restoreFamily = useMutation({
    mutationFn: (familyId: string) => planetApi.families.restore(familyId),
    onSuccess: (result) => {
      setActiveFamilyId(result.family.id);
      invalidate.families();
      invalidate.deletedFamilies();
      showToast({ message: "Family restored." });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to restore this Family."),
  });
  async function copyInvite() {
    if (!invite) return;
    try {
      await Clipboard.setStringAsync(invite);
      setCopied(true);
      showToast({ message: "Invite code copied." });
    } catch {
      setError("We could not copy the invite code. Press and hold it instead.");
    }
  }
  function submitForm() {
    const parsed =
      mode === "create"
        ? familySchema.safeParse({ name, timezone: "" })
        : joinFamilySchema.safeParse({ code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    setError("");
    if (mode === "create") create.mutate();
    else join.mutate();
  }
  const retryFamily = () => {
    void families.refetch();
    if (family) {
      void detail.refetch();
      void pets.refetch();
      void incomingTransfers.refetch();
      void outgoingTransfers.refetch();
    }
  };
  const blockingError = (families.isError && !families.data) || (!family && detail.isError);
  const hasStaleData = Boolean((families.isError && families.data) || (detail.isError && family) || pets.isError);

  const members = detail.data?.members ?? [];
  const petCount = pets.data?.pets.length ?? 0;
  const pendingIncoming: Transfer[] = incomingTransfers.data?.transfers.filter((item) => item.status === "pending") ?? [];
  const pendingOutgoing: Transfer[] = outgoingTransfers.data?.transfers.filter((item) => item.status === "pending") ?? [];

  const loading = families.isLoading || (family && (detail.isLoading || pets.isLoading || (family.role === "owner" && (incomingTransfers.isLoading || outgoingTransfers.isLoading))));

  return {
    me,
    families,
    deletedFamilies,
    detail,
    pets,
    incomingTransfers,
    outgoingTransfers,
    family,
    familySection,
    setFamilySection,
    setActiveFamilyId,
    members,
    petCount,
    pendingIncoming,
    pendingOutgoing,
    mode,
    setMode,
    name,
    setName,
    code,
    setCode,
    invite,
    setInvite,
    copied,
    setCopied,
    error,
    setError,
    editingFamily,
    setEditingFamily,
    familyName,
    setFamilyName,
    familyTimezone,
    setFamilyTimezone,
    familyAction,
    setFamilyAction,
    deleteFamilyConfirm,
    setDeleteFamilyConfirm,
    memberAction,
    setMemberAction,
    ownershipTarget,
    setOwnershipTarget,
    editing,
    loading,
    blockingError,
    hasStaleData,
    retryFamily,
    copyInvite,
    submitForm,
    create,
    join,
    refresh,
    updateFamily,
    removeMember,
    transferOwnership,
    decidePetTransfer,
    cancelPetTransfer,
    leaveFamily,
    deleteFamily,
    restoreFamily,
  };
}
