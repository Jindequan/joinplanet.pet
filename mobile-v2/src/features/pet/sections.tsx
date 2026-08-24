import React from "react";
import { Pressable, Share as NativeShare, Switch, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import {
  AppText, Button, Card, DateTimeField, Screen, SegmentedControl, SectionRow, TextField,
} from "../../ui/components";
import { useTheme } from "../../core/providers/theme-provider";
import { WorkspaceBar } from "../../ui/navigation/workspace-bar";
import { CareRow } from "./components";
import { careTypeOptions, dayOptions, scheduleOptions } from "./types";
import { dateKey, firstProfileRecord, parseDateKey, profileNames, timeKey, timeLabel } from "./helpers";
import { petStyles as styles } from "./styles";
import type { PetFeature } from "./hooks";
import {
  BookOpenIcon, CheckCircleIcon, DotsThreeIcon, PlusIcon, ShareNetworkIcon,
} from "../../ui/icons";

export function OverviewSection({ store }: { store: PetFeature }) {
  const { theme } = useTheme();
  const router = useRouter();
  const {
    pet, taskList, medications, profile, isArchived, canEditPet, setPetSection,
    form, setForm, error, setError,
    editName, setEditName, editSpecies, setEditSpecies, editBreed, setEditBreed,
    editBirthDateValue, setEditBirthDateValue, setEditBirthDate, editSex, setEditSex,
    editNeutered, setEditNeutered, editNotes, setEditNotes, editAllergies, setEditAllergies,
    editConditions, setEditConditions, editEmergencyName, setEditEmergencyName,
    editEmergencyPhone, setEditEmergencyPhone, editEmergencyRelation, setEditEmergencyRelation,
    editDecisionName, setEditDecisionName, editDecisionPhone, setEditDecisionPhone,
    editProfile, submitProfile,
  } = store;
  if (!pet) return null;

  const openEditor = () => {
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
  };

  return (
    <>
      <Card style={[styles.priorityCard, { backgroundColor: theme.colors.inverseSurface, borderColor: theme.colors.inverseSurface }]}>
        <View style={styles.cardHeading}>
          <View style={styles.rowCopy}>
            <AppText variant="heading" style={{ color: theme.colors.onBrand }}>Care routines</AppText>
            <AppText variant="caption" style={{ color: theme.colors.onBrandSoft }}>The shared plan that keeps {pet.name} cared for.</AppText>
          </View>
          <CheckCircleIcon size={24} color={theme.colors.onBrand} weight="duotone" />
        </View>
        <View style={styles.glanceStats}>
          <View style={styles.glanceStat}><AppText variant="title" style={{ color: theme.colors.onBrand }}>{taskList.length}</AppText><AppText variant="caption" style={{ color: theme.colors.onBrandMuted }}>ongoing plans</AppText></View>
          <View style={styles.glanceStat}><AppText variant="title" style={{ color: theme.colors.onBrand }}>{medications.data?.medications.filter((item) => !item.ended_on).length ?? 0}</AppText><AppText variant="caption" style={{ color: theme.colors.onBrandMuted }}>active medications</AppText></View>
        </View>
        <Button label="Open care routines" variant="secondary" onPress={() => setPetSection("care")} />
      </Card>
      <View style={[styles.card, styles.flatSection, { borderTopColor: theme.colors.border }]}>
        <View style={styles.cardHeading}>
          <View style={styles.rowCopy}>
            <AppText variant="heading">About {pet.name}</AppText>
            <AppText variant="caption" muted>Details that help someone care well.</AppText>
          </View>
          <Button label="Edit details" variant="ghost" disabled={isArchived || !canEditPet} onPress={openEditor} />
        </View>
        <AppText muted>{profile?.notes || "Add notes about personality, needs and the things a new caregiver should know."}</AppText>
        <View style={styles.profileStats}>
          <View><AppText variant="caption" muted>HEALTH NOTES</AppText><AppText variant="label">{(profile?.allergies?.length ?? 0) + (profile?.conditions?.length ?? 0)} recorded</AppText></View>
          <View><AppText variant="caption" muted>WEIGHT</AppText><AppText variant="label">{pet.weight_g ? `${(pet.weight_g / 1000).toFixed(1)} kg` : "Not added"}</AppText></View>
        </View>
        <View style={styles.detailList}>
          <View style={[styles.detailRow, { borderTopColor: theme.colors.border }]}><AppText variant="caption" muted>ALLERGIES</AppText><AppText variant="label" numberOfLines={2}>{profileNames(profile?.allergies) || "None recorded"}</AppText></View>
          <View style={[styles.detailRow, { borderTopColor: theme.colors.border }]}><AppText variant="caption" muted>CONCERNS</AppText><AppText variant="label" numberOfLines={2}>{profileNames(profile?.conditions) || "None recorded"}</AppText></View>
          <View style={[styles.detailRow, { borderTopColor: theme.colors.border }]}><AppText variant="caption" muted>EMERGENCY</AppText><AppText variant="label" numberOfLines={2}>{typeof firstProfileRecord(profile?.emergency_contacts).name === "string" ? String(firstProfileRecord(profile?.emergency_contacts).name) : "Not added"}</AppText></View>
        </View>
        {form === "profile" ? (
          <View style={styles.form}>
            <View style={styles.formHeader}><AppText variant="title">Edit Pet details</AppText></View>
            <TextField label="Name" value={editName} onChangeText={(value) => { setEditName(value); setError(""); }} placeholder="Milo" />
            <SegmentedControl label="What kind of Pet?" value={editSpecies} onChange={setEditSpecies} options={[{ value: "dog", label: "Dog" }, { value: "cat", label: "Cat" }, { value: "other", label: "Other" }]} />
            <TextField label="Breed (optional)" value={editBreed} onChangeText={setEditBreed} placeholder="Golden retriever" />
            <DateTimeField label="Birthday (optional)" value={editBirthDateValue} onChange={(value) => { setEditBirthDateValue(value); setEditBirthDate(dateKey(value)); setError(""); }} onClear={() => { setEditBirthDateValue(null); setEditBirthDate(""); setError(""); }} placeholder="Choose a date" maximumDate={new Date()} />
            <SegmentedControl label="Sex" value={editSex} onChange={setEditSex} options={[{ value: "", label: "Not set" }, { value: "female", label: "Female" }, { value: "male", label: "Male" }]} />
            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}><AppText variant="label">Spayed / neutered</AppText></View>
              <Switch accessibilityLabel="Spayed or neutered" value={editNeutered} onValueChange={setEditNeutered} trackColor={{ false: theme.colors.border, true: theme.colors.brand }} thumbColor={theme.colors.surface} />
            </View>
            <TextField label="Notes for a caregiver" value={editNotes} onChangeText={setEditNotes} placeholder="Personality, needs, and the little things to know…" multiline maxLength={2000} />
            <TextField label="Allergies" value={editAllergies} onChangeText={setEditAllergies} placeholder="Chicken, pollen" hint="Separate multiple entries with commas." />
            <TextField label="Conditions or ongoing concerns" value={editConditions} onChangeText={setEditConditions} placeholder="Sensitive stomach" />
            <View style={styles.formSectionLabel}><AppText variant="label">Emergency contact</AppText></View>
            <TextField label="Name" value={editEmergencyName} onChangeText={setEditEmergencyName} placeholder="Alex" />
            <TextField label="Phone" value={editEmergencyPhone} onChangeText={setEditEmergencyPhone} keyboardType="phone-pad" placeholder="+1 555 0100" />
            <TextField label="Relationship (optional)" value={editEmergencyRelation} onChangeText={setEditEmergencyRelation} placeholder="Partner" />
            <View style={styles.formSectionLabel}><AppText variant="label">Medical decision maker</AppText></View>
            <TextField label="Name" value={editDecisionName} onChangeText={setEditDecisionName} placeholder="Alex" />
            <TextField label="Phone" value={editDecisionPhone} onChangeText={setEditDecisionPhone} keyboardType="phone-pad" placeholder="+1 555 0100" />
            {error ? <AppText style={{ color: theme.colors.danger }}>{error}</AppText> : null}
            <View style={styles.actions}>
              <Button label="Cancel" variant="secondary" onPress={() => { setForm(null); setError(""); }} />
              <Button label="Save details" loading={editProfile.isPending} disabled={!editName.trim()} onPress={submitProfile} />
            </View>
          </View>
        ) : null}
      </View>
      <View style={[styles.toolsCard, styles.flatSection, { borderTopColor: theme.colors.border }]}>
        <AppText variant="caption" muted>MORE FOR {pet.name.toUpperCase()}</AppText>
        <SectionRow icon={BookOpenIcon} title="Timeline" description="Browse this Pet's care history" onPress={() => router.push({ pathname: "/(tabs)/timeline", params: { petId: pet.id } })} />
        <SectionRow icon={ShareNetworkIcon} title="Share care info" description="Family access and handoffs" onPress={() => setPetSection("share")} accent="accent" />
        <SectionRow icon={DotsThreeIcon} title="Manage Pet" description="Edit, export, archive, or transfer" onPress={() => setPetSection("manage")} accent="neutral" last />
      </View>
    </>
  );
}

export function ShareSection({ store }: { store: PetFeature }) {
  const { theme } = useTheme();
  const {
    linkedFamilies, canManagePet, isArchived,
    unshareFamilyId, setUnshareFamilyId, unsharePetFamily,
    familyShareError, setFamilyShareError, familyShareOpen, setFamilyShareOpen,
    familyShareTargetId, setFamilyShareTargetId, availableFamilyShares, sharePetFamily,
    shareKind, setShareKind, shareTtl, setShareTtl, shareDays, setShareDays,
    shareError, setShareError, createdShare, setCreatedShare, copiedShare, setCopiedShare,
    shares, revokeShareId, setRevokeShareId, revokeShare, createShare,
  } = store;
  const activeShares = shares.data?.shares.filter((item) => !item.revoked_at && new Date(item.expires_at).getTime() > Date.now()) ?? [];
  const inactiveShares = shares.data?.shares.filter((item) => !activeShares.some((active) => active.id === item.id)) ?? [];

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <View style={styles.rowCopy}>
            <AppText variant="heading">Family access</AppText>
            <AppText variant="caption" muted>Which of your Families can see this Pet.</AppText>
          </View>
          <AppText variant="caption" style={{ color: theme.colors.brandStrong }}>{linkedFamilies.length} connected</AppText>
        </View>
        {linkedFamilies.map((family) => (
          <View key={family.id} style={[styles.accessRow, { borderColor: theme.colors.border }]}>
            <View style={styles.rowCopy}>
              <AppText variant="label">{family.name}</AppText>
              <AppText variant="caption" muted>Connected Family</AppText>
            </View>
            {canManagePet ? (
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
              <SegmentedControl label="Family to share with" value={familyShareTargetId ?? availableFamilyShares[0]?.id ?? ""} onChange={(value) => { setFamilyShareTargetId(value); setFamilyShareError(""); }} options={availableFamilyShares.map((family) => ({ value: family.id, label: family.name }))} />
            ) : <AppText variant="caption" muted>Every Family you belong to already has access.</AppText>}
            <View style={styles.actions}>
              <Button label="Cancel" variant="secondary" onPress={() => { setFamilyShareOpen(false); setFamilyShareTargetId(null); setFamilyShareError(""); }} />
              <Button label="Share Pet" loading={sharePetFamily.isPending} disabled={!availableFamilyShares.length || isArchived} onPress={() => { setFamilyShareError(""); sharePetFamily.mutate(); }} />
            </View>
          </View>
        ) : canManagePet && availableFamilyShares.length ? (
          <Button label="Share with another Family" variant="secondary" disabled={isArchived} onPress={() => { setFamilyShareOpen(true); setFamilyShareTargetId(availableFamilyShares[0]?.id ?? null); setFamilyShareError(""); }} />
        ) : canManagePet ? (
          <AppText variant="caption" muted>Create or join another Family to share this Pet with a second care space.</AppText>
        ) : null}
      </Card>
      <Card style={styles.card}>
        <View style={styles.shareHeader}>
          <View style={[styles.shareIcon, { backgroundColor: theme.colors.brandSoft }]}>
            <ShareNetworkIcon size={21} color={theme.colors.brandStrong} weight="duotone" />
          </View>
          <View style={styles.rowCopy}>
            <AppText variant="heading">Share a care handoff</AppText>
            <AppText variant="caption" muted>Give a sitter or vet the right view. Every link expires and can be revoked.</AppText>
          </View>
        </View>
        {canManagePet ? <>
          <SegmentedControl label="What to share" value={shareKind} onChange={setShareKind} options={[{ value: "care_card", label: "Care card" }, { value: "summary", label: "Health summary" }]} />
          <View style={[styles.shareInfo, { borderColor: theme.colors.border }]}>
            <AppText variant="label">{shareKind === "care_card" ? "A quick care card" : "A time-limited health summary"}</AppText>
			<AppText variant="caption" muted>{shareKind === "care_card" ? "Profile, routines and emergency info for a sitter." : "Profile, medications and recent timeline records for the days you choose."}</AppText>
          </View>
          <SegmentedControl label="Link lifetime" value={shareTtl} onChange={setShareTtl} options={[{ value: "24", label: "24 hours" }, { value: "72", label: "3 days" }, { value: "168", label: "7 days" }]} />
          {shareKind === "summary" ? (
            <TextField label="Include the last (days)" value={shareDays} onChangeText={(value) => { setShareDays(value.replace(/\D/g, "").slice(0, 3)); setShareError(""); }} keyboardType="number-pad" hint="Profile, medications, and timeline events." />
          ) : null}
          {shareError ? <AppText style={{ color: theme.colors.danger }}>{shareError}</AppText> : null}
          {createdShare ? (
            <View style={[styles.shareResult, { backgroundColor: theme.colors.accentSurface, borderColor: theme.colors.border }]}>
              <AppText variant="label">Share ready</AppText>
              <AppText selectable variant="caption" muted>{createdShare.url}</AppText>
              <View style={styles.actions}>
                <Button label={copiedShare ? "Copied" : "Copy link"} variant="secondary" onPress={() => void Clipboard.setStringAsync(createdShare.url).then(() => setCopiedShare(true)).catch(() => setShareError("We could not copy the link. Press and hold it instead."))} />
                <Button label="Share" variant="primary" onPress={() => void NativeShare.share({ message: createdShare.url }).catch(() => setShareError("We could not open the share sheet. Press and hold the link to copy it instead."))} />
                <Button label="Create another" variant="ghost" onPress={() => { setCreatedShare(null); setCopiedShare(false); setShareError(""); }} />
              </View>
              <AppText variant="caption" muted>Only someone with this link can open it.</AppText>
            </View>
          ) : (
            <Button label="Create secure link" variant="secondary" disabled={isArchived} loading={createShare.isPending} onPress={() => { setShareError(""); createShare.mutate(); }} icon={<ShareNetworkIcon size={17} color={theme.colors.brandStrong} weight="bold" />} />
          )}
          {shares.isError ? (
            <View style={styles.shareInlineError}>
              <AppText variant="caption" muted>Existing links could not be loaded.</AppText>
              <Button label="Retry" variant="ghost" onPress={() => void shares.refetch()} />
            </View>
          ) : shares.data?.shares.length ? (
            <View style={styles.activeShares}>
              {activeShares.length ? <AppText variant="caption" muted>ACTIVE LINKS</AppText> : null}
              {activeShares.map((item) => (
                <View key={item.id} style={[styles.shareRow, { borderColor: theme.colors.border }]}>
                  <View style={styles.rowCopy}>
                    <AppText variant="label">{item.kind === "care_card" ? "Care card" : "Health summary"}</AppText>
                    <AppText variant="caption" muted>{new Date(item.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {item.view_count} {item.view_count === 1 ? "view" : "views"}</AppText>
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
              {inactiveShares.length ? <View style={styles.archivedSection}><AppText variant="caption" muted>LINK HISTORY</AppText>{inactiveShares.map((item) => {
                const status = item.revoked_at ? "Revoked" : "Expired";
                return <View key={item.id} style={[styles.shareRow, { borderColor: theme.colors.border }]}><View style={styles.rowCopy}><AppText variant="label" style={{ color: theme.colors.textMuted }}>{item.kind === "care_card" ? "Care card" : "Health summary"} · {status}</AppText><AppText variant="caption" muted>{new Date(item.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {item.view_count} {item.view_count === 1 ? "view" : "views"}</AppText></View></View>;
              })}</View> : null}
            </View>
          ) : null}
        </> : (
          <AppText variant="caption" muted>Only the current Pet owner can create or revoke external handoff links.</AppText>
        )}
      </Card>
    </>
  );
}

export function CareSection({ store }: { store: PetFeature }) {
  const { theme } = useTheme();
  const {
    pet, taskList, archivedTaskList, canManagePet, isArchived, canEditPet,
    setPetSection, setEditingTaskId, setCareStep, setForm, setError,
    taskMenuId, setTaskMenuId, confirmTaskId, setConfirmTaskId,
    restoreTaskId, setRestoreTaskId, openTaskEditor, archiveTask, restoreTask,
    medications, medicationCount, medicationAction, setMedicationAction,
    error, form, editingMedicationId, setEditingMedicationId, medName, setMedName, medDose, setMedDose,
    medSchedule, setMedSchedule, medNote, setMedNote,
    resetMedicationForm, submitMedication, openMedicationEditor,
    addMedication, updateMedication, stopMedication, deleteMedication,
  } = store;
  if (!pet) return null;

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <View style={styles.rowCopy}>
            <AppText variant="heading">Care plan</AppText>
            <AppText variant="caption" muted>{taskList.length} ongoing {taskList.length === 1 ? "item" : "items"}</AppText>
          </View>
          {canManagePet ? <Button label="Add care" variant="secondary" disabled={isArchived} icon={<PlusIcon size={17} color={theme.colors.brandStrong} weight="regular" />} onPress={() => { setPetSection("care"); setEditingTaskId(null); setCareStep(1); setForm("care"); setError(""); }} /> : <AppText variant="caption" muted>Owner-managed</AppText>}
        </View>
        {taskList.length === 0 ? (
          <AppText muted>No ongoing care yet. Add the first routine for {pet.name}.</AppText>
        ) : (
          taskList.map((task) => (
            <View key={task.id}>
              <CareRow task={task} onActions={canManagePet ? () => { setTaskMenuId((current) => (current === task.id ? null : task.id)); setConfirmTaskId(null); setError(""); } : undefined} />
              {taskMenuId === task.id ? (
                <View style={styles.taskActions}>
                  <Button label="Edit" variant="secondary" onPress={() => openTaskEditor(task)} />
                  <Button label="Archive" variant="danger" onPress={() => { setConfirmTaskId(task.id); setTaskMenuId(null); }} />
                </View>
              ) : null}
              {confirmTaskId === task.id ? (
                <View style={[styles.confirmBox, { backgroundColor: theme.colors.accentSurface }]}>
                  <AppText variant="label">Archive this care plan?</AppText>
                  <AppText variant="caption" muted>Future moments will stop appearing. Past care records stay safe.</AppText>
                  <View style={styles.actions}>
                    <Button label="Keep it" variant="secondary" onPress={() => setConfirmTaskId(null)} />
                    <Button label="Archive plan" variant="danger" loading={archiveTask.isPending} onPress={() => archiveTask.mutate()} />
                  </View>
                </View>
              ) : null}
            </View>
          ))
        )}
        {archivedTaskList.length > 0 ? (
          <View style={styles.archivedSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.rowCopy}>
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
      </Card>
      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <View style={styles.rowCopy}>
            <AppText variant="heading">{medicationCount > 0 ? "Medication history" : "Medications"}</AppText>
            <AppText variant="caption" muted>{medicationCount > 0 ? `${medicationCount} ${medicationCount === 1 ? "record" : "records"}` : "Track prescriptions separately from recurring care."}</AppText>
          </View>
          <Button label="Add" variant="secondary" disabled={isArchived || !canEditPet} onPress={() => { setPetSection("care"); setEditingMedicationId(null); setMedName(""); setMedDose(""); setMedSchedule(""); setMedNote(""); setForm("medication"); setError(""); }} />
        </View>
        {medications.data?.medications.map((med) => (
          <View key={med.id} style={styles.medicationRow}>
            <View style={styles.medicationCopy}>
              <AppText variant="label">{med.name}{med.ended_on ? " · stopped" : ""}</AppText>
              {med.dose || med.schedule ? <AppText variant="caption" muted>{[med.dose, med.schedule].filter(Boolean).join(" · ")}</AppText> : null}
              {med.note ? <AppText variant="caption" muted>{med.note}</AppText> : null}
            </View>
            {!isArchived && canEditPet ? (
              <View style={styles.medicationActions}>
                {canManagePet ? <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${med.name}`} onPress={() => openMedicationEditor(med)} hitSlop={6} style={({ pressed }) => [styles.medicationActionButton, pressed && { opacity: theme.motion.pressOpacity }]}><AppText variant="caption" style={{ color: theme.colors.brandStrong }}>Edit</AppText></Pressable> : null}
                {!med.ended_on ? <Pressable accessibilityRole="button" accessibilityLabel={`Stop ${med.name}`} onPress={() => { setMedicationAction({ id: med.id, kind: "stop" }); setError(""); }} hitSlop={6} style={({ pressed }) => [styles.medicationActionButton, pressed && { opacity: theme.motion.pressOpacity }]}><AppText variant="caption" style={{ color: theme.colors.textMuted }}>Stop</AppText></Pressable> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${med.name}`} onPress={() => { setMedicationAction({ id: med.id, kind: "delete" }); setError(""); }} hitSlop={6} style={({ pressed }) => [styles.medicationActionButton, pressed && { opacity: theme.motion.pressOpacity }]}><AppText variant="caption" style={{ color: theme.colors.danger }}>Delete</AppText></Pressable>
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
              {error ? <AppText variant="caption" style={{ color: theme.colors.danger }}>{error}</AppText> : null}
              <View style={styles.actions}>
                <Button label="Cancel" variant="secondary" onPress={() => { setMedicationAction(null); setError(""); }} />
                <Button label={deleting ? "Delete medication" : "Stop medication"} variant={deleting ? "danger" : "primary"} loading={stopMedication.isPending || deleteMedication.isPending} onPress={() => deleting ? deleteMedication.mutate() : stopMedication.mutate()} />
              </View>
            </View>
          );
        })() : null}
        {form === "medication" && canEditPet ? (
          <View style={styles.form}>
            <TextField label="Medication name" value={medName} onChangeText={(value) => { setMedName(value); setError(""); }} placeholder="Heartworm prevention" error={error} />
            <TextField label="Dose (optional)" value={medDose} onChangeText={(value) => { setMedDose(value); setError(""); }} placeholder="1 tablet" />
            <TextField label="Schedule (optional)" value={medSchedule} onChangeText={(value) => { setMedSchedule(value); setError(""); }} placeholder="Every morning with food" />
            <TextField label="Note (optional)" value={medNote} onChangeText={setMedNote} placeholder="Started after the vet visit" multiline />
            <View style={styles.actions}>
              <Button label="Cancel" variant="secondary" onPress={resetMedicationForm} />
              <Button label={editingMedicationId ? "Save changes" : "Save medication"} loading={addMedication.isPending || updateMedication.isPending} disabled={!medName.trim()} onPress={submitMedication} />
            </View>
          </View>
        ) : null}
      </Card>
    </>
  );
}

export function ManageSection({ store }: { store: PetFeature }) {
  const { theme } = useTheme();
  const router = useRouter();
  const {
    pet, isArchived, canManagePet, error, setError, exportError, setExportError, transferNotice, setTransferNotice,
    transferOpen, setTransferOpen, transferTargetId, setTransferTargetId,
    transferError, setTransferError, targetFamilies, transferPet,
    lifecycleAction, setLifecycleAction, deleteConfirmName, setDeleteConfirmName,
    archivePet, restorePet, deletePet, exportPet,
  } = store;
  if (!pet) return null;

  return (
    <Card style={styles.lifecycleCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.rowCopy}>
          <AppText variant="heading">Pet lifecycle</AppText>
          <AppText variant="caption" muted>{isArchived ? "This Pet is read-only. History is preserved." : "Archive when care ends; delete only when the record should disappear."}</AppText>
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
            {targetFamilies.length ? (
              <SegmentedControl label="Destination Family" value={transferTargetId ?? targetFamilies[0]?.id ?? ""} onChange={(value) => { setTransferTargetId(value); setTransferError(""); }} options={targetFamilies.map((item) => ({ value: item.id, label: item.name }))} />
            ) : <AppText variant="caption" muted>Create or join another Family first.</AppText>}
            {transferError ? <AppText variant="caption" style={{ color: theme.colors.danger }}>{transferError}</AppText> : null}
            <View style={styles.actions}>
              <Button label="Keep here" variant="secondary" onPress={() => { setTransferOpen(false); setTransferTargetId(null); setTransferError(""); }} />
              <Button label="Send handoff request" loading={transferPet.isPending} disabled={!targetFamilies.length} onPress={() => { setTransferError(""); transferPet.mutate(); }} />
            </View>
          </View>
        ) : targetFamilies.length ? (
          <Button label="Move to another Family" variant="secondary" onPress={() => { setTransferOpen(true); setTransferTargetId(targetFamilies[0]?.id ?? null); setTransferNotice(""); setTransferError(""); }} />
        ) : (
          <View style={styles.transferForm}>
            <AppText variant="caption" muted>To move {pet.name}, first create or join the destination Family.</AppText>
            <Button label="Open Family" variant="secondary" onPress={() => router.push("/(tabs)/family")} />
          </View>
        )
      ) : null}
      {canManagePet && lifecycleAction ? (
        <View style={[styles.confirmBox, { backgroundColor: lifecycleAction === "delete" ? theme.colors.surfaceRaised : theme.colors.accentSurface }]}>
          <AppText variant="label">{lifecycleAction === "archive" ? `Archive ${pet.name}?` : lifecycleAction === "restore" ? `Restore ${pet.name}?` : `Delete ${pet.name} permanently?`}</AppText>
          <AppText variant="caption" muted>{lifecycleAction === "archive" ? "Future care moments and reminders stop. Profile and history remain." : lifecycleAction === "restore" ? "Active care can be scheduled again after restoring this Pet." : "This removes the Pet and its care history. Export anything you need first."}</AppText>
          {lifecycleAction === "delete" ? <TextField label={`Type ${pet.name} to confirm`} value={deleteConfirmName} onChangeText={(value) => { setDeleteConfirmName(value); setError(""); }} placeholder={pet.name} autoCapitalize="none" autoCorrect={false} /> : null}
          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={() => { setLifecycleAction(null); setDeleteConfirmName(""); }} />
            <Button label={lifecycleAction === "archive" ? "Archive Pet" : lifecycleAction === "restore" ? "Restore Pet" : "Delete permanently"} variant={lifecycleAction === "delete" ? "danger" : "primary"} loading={archivePet.isPending || restorePet.isPending || deletePet.isPending} disabled={lifecycleAction === "delete" && deleteConfirmName.trim() !== pet.name} onPress={() => lifecycleAction === "archive" ? archivePet.mutate() : lifecycleAction === "restore" ? restorePet.mutate() : deletePet.mutate()} />
          </View>
        </View>
      ) : canManagePet ? (
        <View style={styles.actions}>
          <Button label="Export record" variant="secondary" loading={exportPet.isPending} onPress={() => { setExportError(""); exportPet.mutate(); }} />
          {isArchived ? <Button label="Restore Pet" variant="secondary" onPress={() => setLifecycleAction("restore")} /> : <Button label="Archive Pet" variant="secondary" onPress={() => setLifecycleAction("archive")} />}
          <Button label="Delete Pet" variant="danger" onPress={() => { setDeleteConfirmName(""); setLifecycleAction("delete"); }} />
        </View>
      ) : (
        <AppText variant="caption" muted>Pet lifecycle controls are limited to the current Pet owner.</AppText>
      )}
    </Card>
  );
}

export function CareEditorScreen({ store }: { store: PetFeature }) {
  const { theme } = useTheme();
  const {
    visibleFamily, pet, editingTaskId, resetCareForm, careStep, setCareStep,
    careType, setCareType, careTitle, setCareTitle, careDescription, setCareDescription,
    scheduleKind, setScheduleKind, weeklyDays, setWeeklyDays, monthlyDay, setMonthlyDay,
    everyN, setEveryN, timeOfDayValue, setTimeOfDayValue, setTimeOfDay, timeOfDay,
    careStartDateValue, setCareStartDateValue, setCareStartDate, careStartDate,
    careEndDateValue, setCareEndDateValue, setCareEndDate, careEndDate,
    selectedCareHelper, setCareHelperSelection, careHelperOptions, error, setError,
    continueCareSetup, addCare, updateTask,
  } = store;
  if (!pet) return null;

  return (
    <Screen scroll contentContainerStyle={styles.editorScreen}>
      <WorkspaceBar familyName={visibleFamily?.name} petName={pet.name} onPressWorkspace={() => resetCareForm()} />
      <View style={styles.editorHeading}>
        <View style={styles.rowCopy}>
          <AppText variant="caption" muted>{editingTaskId ? "EDIT CARE PLAN" : "NEW CARE PLAN"}</AppText>
          <AppText variant="display">Make care easy to do.</AppText>
          <AppText muted>This becomes a shared instruction for {pet.name}, not just a reminder.</AppText>
        </View>
        <Button label="Close" variant="ghost" onPress={resetCareForm} />
      </View>
      <View style={styles.editorRail} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 3, now: careStep }}>
        {[1, 2, 3].map((step) => <View key={step} style={[styles.editorRailItem, { backgroundColor: step <= careStep ? theme.colors.brandStrong : theme.colors.border }]} />)}
      </View>
      <Card style={styles.editorCard}>
        {careStep === 1 ? <>
          <View style={styles.editorSectionIntro}>
            <AppText variant="heading">What needs to happen?</AppText>
            <AppText variant="caption" muted>Choose a category, then describe the action clearly enough for another person to follow.</AppText>
          </View>
          <SegmentedControl label="Category" value={careType} onChange={setCareType} options={careTypeOptions} wrap />
          <TextField label="Action name" value={careTitle} onChangeText={(value) => { setCareTitle(value); setError(""); }} placeholder="Name this care moment" autoFocus />
          <TextField label="Instructions" value={careDescription} onChangeText={(value) => { setCareDescription(value); setError(""); }} placeholder="Add the detail someone should know" hint="Include dosage, quantity, location, or any handoff detail." multiline />
        </> : null}
        {careStep === 2 ? <>
          <View style={styles.editorSectionIntro}>
            <AppText variant="heading">When should it happen?</AppText>
            <AppText variant="caption" muted>PLANET creates one actionable care moment for each scheduled day.</AppText>
          </View>
          <View style={[styles.shareInfo, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
            <AppText variant="label">Family time zone</AppText>
            <AppText variant="caption" muted>{visibleFamily?.timezone ?? "This Family's configured time zone"}. Dates and preferred times are shared as Family-local care instructions.</AppText>
          </View>
          <SegmentedControl label="Cadence" value={scheduleKind} onChange={setScheduleKind} options={scheduleOptions} />
          {scheduleKind === "weekly" ? <View style={styles.dayPicker}>
            <AppText variant="label">Days of the week</AppText>
            <View style={styles.dayRow}>{dayOptions.map((day) => {
              const selected = weeklyDays.includes(day.value);
              return <Pressable key={day.value} accessibilityRole="button" accessibilityLabel={`Weekday ${day.value}`} accessibilityState={{ selected }} onPress={() => setWeeklyDays((current) => selected ? current.filter((value) => value !== day.value) : [...current, day.value].sort())} style={[styles.dayButton, { borderColor: selected ? theme.colors.brandStrong : theme.colors.border, backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface }]}><AppText variant="label" style={{ color: selected ? theme.colors.brandStrong : theme.colors.textMuted }}>{day.label}</AppText></Pressable>;
            })}</View>
          </View> : null}
          {scheduleKind === "monthly" ? <TextField label="Day of month" value={monthlyDay} onChangeText={(value) => { setMonthlyDay(value); setError(""); }} keyboardType="number-pad" placeholder="1" hint="For months without this day, the moment will not be created." /> : null}
          {scheduleKind === "interval" ? <TextField label="Repeat every" value={everyN} onChangeText={(value) => { setEveryN(value); setError(""); }} keyboardType="number-pad" placeholder="2" hint="Number of days between care moments." /> : null}
          {editingTaskId ? <AppText variant="caption" muted>Start and end dates stay unchanged when you edit an existing plan.</AppText> : <View style={styles.dateRange}>
            <View style={styles.dateField}><DateTimeField label="Starts" value={careStartDateValue} onChange={(value) => { setCareStartDateValue(value); setCareStartDate(dateKey(value)); setError(""); }} onClear={() => { setCareStartDateValue(null); setCareStartDate(""); setError(""); }} placeholder="Today" minimumDate={editingTaskId ? undefined : new Date()} /></View>
            <View style={styles.dateField}><DateTimeField label="Ends (optional)" value={careEndDateValue} onChange={(value) => { setCareEndDateValue(value); setCareEndDate(dateKey(value)); setError(""); }} onClear={() => { setCareEndDateValue(null); setCareEndDate(""); setError(""); }} placeholder="No end date" minimumDate={careStartDateValue ?? new Date()} /></View>
          </View>}
          <DateTimeField label="Preferred time" value={timeOfDayValue} mode="time" onChange={(value) => { setTimeOfDayValue(value); setTimeOfDay(timeKey(value)); setError(""); }} onClear={() => { setTimeOfDayValue(null); setTimeOfDay(""); setError(""); }} placeholder="Any time" />
        </> : null}
        {careStep === 3 ? <>
          <View style={styles.editorSectionIntro}>
            <AppText variant="heading">Who carries it?</AppText>
            <AppText variant="caption" muted>The plan stays controlled by the Pet owner. Helpers can complete the moment and leave the history intact.</AppText>
          </View>
          <SegmentedControl label="Responsible person" value={selectedCareHelper} onChange={setCareHelperSelection} options={careHelperOptions} />
          {careHelperOptions.length === 1 ? <AppText variant="caption" muted>No other Family member is available yet. You can add one later.</AppText> : null}
          <View style={[styles.editorReview, { backgroundColor: theme.colors.surfaceRaised }]}>
            <AppText variant="caption" style={{ color: theme.colors.accentStrong }}>CARE PLAN PREVIEW</AppText>
            <AppText variant="title">{careTitle.trim() || "Untitled care moment"}</AppText>
            {careDescription.trim() ? <AppText variant="caption" muted>{careDescription.trim()}</AppText> : null}
            <AppText variant="caption" muted>{scheduleKind === "daily" ? "Every day" : scheduleKind === "weekly" ? `Weekly · ${weeklyDays.length ? weeklyDays.map((day) => dayOptions[day - 1]?.label).join(" ") : "choose days"}` : scheduleKind === "monthly" ? `Monthly · day ${monthlyDay || "—"}` : `Every ${everyN || "—"} days`}{timeOfDay ? ` · ${timeLabel(timeOfDay)}` : " · Any time"}</AppText>
            <AppText variant="caption" muted>{careStartDate ? `Starts ${careStartDate}` : "Starts today"}{careEndDate ? ` · Ends ${careEndDate}` : " · No end date"}</AppText>
            <AppText variant="caption" muted>{selectedCareHelper ? `Helped by ${careHelperOptions.find((option) => option.value === selectedCareHelper)?.label ?? "a Family member"}` : "Owned by you"}</AppText>
          </View>
        </> : null}
        {error ? <AppText accessibilityLiveRegion="polite" style={{ color: theme.colors.danger }}>{error}</AppText> : null}
        <View style={styles.editorActions}>
          <Button label={careStep === 1 ? "Cancel" : "Back"} variant="secondary" onPress={() => careStep === 1 ? resetCareForm() : setCareStep((careStep - 1) as 1 | 2 | 3)} />
          <Button label={careStep === 3 ? (editingTaskId ? "Save care plan" : "Create care plan") : "Continue"} loading={addCare.isPending || updateTask.isPending} onPress={continueCareSetup} />
        </View>
      </Card>
    </Screen>
  );
}
