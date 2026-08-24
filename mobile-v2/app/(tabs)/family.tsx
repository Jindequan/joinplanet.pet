import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AppText, Button, Card, LoadingState, QueryErrorState, Screen, SectionRow, StaleDataNotice, TextField } from "../../src/ui/components";
import { useTheme } from "../../src/core/providers/theme-provider";
import { WorkspaceBar } from "../../src/ui/navigation/workspace-bar";
import { humanDisplayName, pluralLabel } from "../../src/core/presentation/labels";
import { useFamilyFeature, memberRoleLabel } from "../../src/features/family/hooks";
import {
  CheckIcon,
  CaretRightIcon,
  GearSixIcon,
  PawPrintIcon,
  PlusIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from "../../src/ui/icons";

export default function FamilyRoute() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ mode?: string; familyId?: string; code?: string }>();
  const {
    me,
    families,
    deletedFamilies,
    detail,
    pets,
    incomingTransfers,
    outgoingTransfers,
    family,
    familySection,
    setActiveFamilyId,
    setFamilySection,
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
  } = useFamilyFeature(params);

  const focusedSection = familySection === "people"
    ? { eyebrow: `${family?.name.toUpperCase() ?? "FAMILY"} / PEOPLE`, title: "People who help" }
    : familySection === "manage"
      ? { eyebrow: `${family?.name.toUpperCase() ?? "FAMILY"} / SETTINGS`, title: "Family settings" }
      : { eyebrow: "FAMILY CARE", title: "Family" };

  const petList = pets.data?.pets;

  if (loading) return <Screen><LoadingState label="Loading your Family" /></Screen>;
  if (blockingError) return (
    <Screen contentContainerStyle={styles.center}>
      <QueryErrorState title="Your Family is unavailable" body="We could not load the people and Pets in this care family." onRetry={retryFamily} />
    </Screen>
  );

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      {hasStaleData ? <StaleDataNotice onRetry={retryFamily} retrying={detail.isFetching || pets.isFetching} message="Some Family details are from the last saved view. Reconnect to refresh them." /> : null}
      <WorkspaceBar familyName={family?.name ?? "No Family selected"} />
      {familySection !== "overview" ? <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText variant="caption" muted>{focusedSection.eyebrow}</AppText>
          <AppText variant="display">{focusedSection.title}</AppText>
          <AppText muted>Manage the people, Pets and permissions in this shared care space.</AppText>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: theme.colors.accentSurface }]}>
          <UsersThreeIcon size={23} color={theme.colors.accentStrong} weight="duotone" />
        </View>
      </View> : null}
      {families.data?.families.length ? families.data.families.length > 1 ? (
        <View style={styles.familyPicker}>
          <AppText variant="caption" muted>YOUR FAMILIES</AppText>
          <View style={styles.familyOptions}>
            {families.data.families.map((item) => {
              const selected = item.id === family?.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => { setActiveFamilyId(item.id); setInvite(""); }}
                  style={[styles.familyOption, { borderColor: selected ? theme.colors.brandStrong : theme.colors.border, backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface }]}
                >
                  <AppText variant="label" style={{ color: selected ? theme.colors.brandStrong : theme.colors.textMuted }}>{item.name}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null : null}
      {family ? (
        <>
          {familySection === "overview" ? <View style={styles.identity}>
            <View style={[styles.identityMark, { backgroundColor: theme.colors.accentSurface }]}><UsersThreeIcon size={25} color={theme.colors.accentStrong} weight="duotone" /></View>
            <View style={styles.identityCopy}>
              <AppText variant="caption" muted>SHARED CARE SPACE</AppText>
              <AppText variant="display">{family.name}</AppText>
              <AppText muted>{members.length} {members.length === 1 ? "person" : "people"} · {petCount} {petCount === 1 ? "Pet" : "Pets"}</AppText>
            </View>
          </View> : null}
          {familySection !== "overview" ? <Button label={`Back to ${family.name}`} variant="ghost" onPress={() => setFamilySection("overview")} /> : null}
          {familySection === "overview" ? <Card style={styles.petCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.rowCopy}>
                <AppText variant="heading">Pets in this Family</AppText>
                <AppText variant="caption" muted>Every Pet this group can care for.</AppText>
              </View>
              <Button label="View all" accessibilityLabel="View all Pets in this Family" variant="ghost" onPress={() => router.push({ pathname: "/(tabs)/pets", params: { familyId: family.id } })} />
            </View>
            {petList?.length ? petList.slice(0, 4).map((familyPet) => (
              <Pressable key={familyPet.id} accessibilityRole="button" accessibilityLabel={`Open ${familyPet.name}`} onPress={() => router.push({ pathname: "/(tabs)/pet", params: { petId: familyPet.id } })} style={({ pressed }) => [styles.petRow, { borderColor: theme.colors.border }, pressed && { opacity: theme.motion.pressOpacity }]}>
                <View style={[styles.petMarkSmall, { backgroundColor: theme.colors.accentSurface }]}><PawPrintIcon size={18} color={theme.colors.accentStrong} weight="duotone" /></View>
                <View style={styles.rowCopy}><AppText variant="label">{familyPet.name}</AppText><AppText variant="caption" muted>{familyPet.breed || familyPet.species} · {familyPet.archived_at ? "Memory mode" : "Active care"}</AppText></View>
                <CaretRightIcon size={18} color={theme.colors.textSubtle} weight="bold" />
              </Pressable>
            )) : <View style={styles.petEmpty}><PawPrintIcon size={19} color={theme.colors.brandStrong} weight="duotone" /><AppText variant="caption" muted>No Pets in this Family yet.</AppText><Button label="Add a Pet" variant="secondary" onPress={() => router.push({ pathname: "/(tabs)/pets", params: { familyId: family.id, add: "1" } })} /></View>}
            {petList?.length && petList.length > 4 ? <AppText variant="caption" muted style={styles.morePets}>Showing 4 of {petList.length} Pets in this Family.</AppText> : null}
          </Card> : null}
          {familySection === "overview" ? <View style={[styles.inviteCard, styles.flatSection, { borderTopColor: theme.colors.border }]}>
            <View style={styles.inviteHeader}>
              <View>
                <AppText variant="heading">Bring someone in</AppText>
                <AppText variant="caption" muted>Invite a trusted person to help care.</AppText>
              </View>
              <View style={[styles.inviteIcon, { backgroundColor: theme.colors.accentSurface }]}>
                <PlusIcon size={18} color={theme.colors.accentStrong} weight="bold" />
              </View>
            </View>
            {family.role === "owner" ? invite ? (
              <View style={[styles.codeBox, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
                <View style={styles.codeCopy}>
                  <AppText selectable variant="title" style={{ letterSpacing: 2 }}>{invite}</AppText>
                  <AppText variant="caption" muted>Share this code with someone you trust.</AppText>
                </View>
                <Button label={copied ? "Copied" : "Copy code"} variant="secondary" onPress={() => void copyInvite()} />
              </View>
            ) : (
              <Button label="Create an invite code" variant="secondary" loading={refresh.isPending} onPress={() => refresh.mutate()} />
            ) : <AppText variant="caption" muted>Only the Family owner can create or refresh the invite code.</AppText>}
          </View> : null}
          {family.role === "owner" && familySection === "overview" ? (
            <View style={[styles.transferCard, styles.flatSection, { borderTopColor: theme.colors.border }]}>
              <View style={styles.sectionHeader}>
                <View style={styles.rowCopy}>
                  <AppText variant="heading">Pet handoffs</AppText>
                  <AppText variant="caption" muted>Moving a Pet needs both Family owners to agree. Nothing changes while it is pending.</AppText>
                </View>
                {pendingIncoming.length + pendingOutgoing.length ? <AppText variant="caption" style={{ color: theme.colors.brandStrong }}>{pendingIncoming.length + pendingOutgoing.length} pending</AppText> : null}
              </View>
              {incomingTransfers.isError || outgoingTransfers.isError ? (
                <View style={styles.actions}>
                  <AppText variant="caption" muted>Handoffs could not be loaded.</AppText>
                  <Button label="Retry" variant="ghost" onPress={() => { void incomingTransfers.refetch(); void outgoingTransfers.refetch(); }} />
                </View>
              ) : pendingIncoming.length === 0 && pendingOutgoing.length === 0 ? (
                <AppText variant="caption" muted>No Pet handoffs need your attention.</AppText>
              ) : (
                <View style={styles.transferList}>
                  {pendingIncoming.map((item) => (
                    <View key={item.id} style={[styles.transferRow, { borderColor: theme.colors.border }]}>
                      <View style={styles.rowCopy}>
                        <AppText variant="label">{item.pet_name}</AppText>
                        <AppText variant="caption" muted>Incoming from {item.from_family_id}</AppText>
                      </View>
                      <View style={styles.actions}>
                        <Button label="Decline" variant="ghost" disabled={decidePetTransfer.isPending} onPress={() => decidePetTransfer.mutate({ id: item.id, action: "decline" })} />
                        <Button label="Accept" variant="secondary" loading={decidePetTransfer.isPending} onPress={() => decidePetTransfer.mutate({ id: item.id, action: "accept" })} />
                      </View>
                    </View>
                  ))}
                  {pendingOutgoing.map((item) => (
                    <View key={item.id} style={[styles.transferRow, { borderColor: theme.colors.border }]}>
                      <View style={styles.rowCopy}>
                        <AppText variant="label">{item.pet_name}</AppText>
                        <AppText variant="caption" muted>Waiting for {item.to_family_id}</AppText>
                      </View>
                      <Button label="Cancel" variant="ghost" loading={cancelPetTransfer.isPending} onPress={() => cancelPetTransfer.mutate(item.id)} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}
          {familySection === "overview" ? <View style={[styles.toolsCard, styles.flatSection, { borderTopColor: theme.colors.border }]}>
            <AppText variant="caption" muted>MORE FOR {family.name.toUpperCase()}</AppText>
            <SectionRow icon={UsersThreeIcon} title="People who help" description="Members, roles, invites, and ownership" onPress={() => setFamilySection("people")} />
            <SectionRow icon={GearSixIcon} title="Family settings" description="Name, timezone, leave, or delete" onPress={() => setFamilySection("manage")} accent="neutral" last />
          </View> : null}
          {familySection === "people" ? <>
            <View style={styles.sectionHeader}>
              <View>
                <AppText variant="title">The people</AppText>
                <AppText variant="caption" muted>Everyone with a place in their care.</AppText>
              </View>
              <AppText variant="caption" muted>{pluralLabel(members.length, "active member", "active members")}</AppText>
            </View>
            <Card style={styles.inviteCard}>
              <View style={styles.inviteHeader}>
                <View style={styles.rowCopy}>
                  <AppText variant="heading">Invite someone to help</AppText>
                  <AppText variant="caption" muted>Give a trusted person a clear way into this care space.</AppText>
                </View>
                <View style={[styles.inviteIcon, { backgroundColor: theme.colors.accentSurface }]}>
                  <PlusIcon size={18} color={theme.colors.accentStrong} weight="bold" />
                </View>
              </View>
              {family.role === "owner" ? invite ? (
                <View style={[styles.codeBox, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
                  <View style={styles.codeCopy}>
                    <AppText selectable variant="title" style={{ letterSpacing: 2 }}>{invite}</AppText>
                    <AppText variant="caption" muted>Share this code with someone you trust.</AppText>
                  </View>
                  <Button label={copied ? "Copied" : "Copy code"} variant="secondary" onPress={() => void copyInvite()} />
                </View>
              ) : <Button label="Create an invite code" variant="secondary" loading={refresh.isPending} onPress={() => refresh.mutate()} />
                : <AppText variant="caption" muted>Only the Family owner can create or refresh the invite code.</AppText>}
            </Card>
            <Card style={styles.members}>
              {members.map((member, index) => {
                const memberName = member.user_id === me.data?.user.id ? "You" : humanDisplayName(member) ?? "Planet member";
                return (
                  <View
                    key={member.user_id}
                    style={[styles.member, index < members.length - 1 && { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                  >
                    <View style={[styles.memberAvatar, { backgroundColor: member.role === "owner" ? theme.colors.brandSoft : theme.colors.accentSurface }]}>
                      <UserCircleIcon size={23} color={member.role === "owner" ? theme.colors.brandStrong : theme.colors.accentStrong} weight="duotone" />
                    </View>
                    <View style={styles.memberCopy}>
                      <AppText variant="label">{memberName}</AppText>
                      <AppText variant="caption" muted>{memberRoleLabel(member.role)} · active</AppText>
                    </View>
                    {member.role === "owner" ? (
                      <View style={[styles.ownerPill, { backgroundColor: theme.colors.brandSoft }]}>
                        <CheckIcon size={13} color={theme.colors.brandStrong} weight="bold" />
                        <AppText variant="caption" style={{ color: theme.colors.brandStrong }}>Owner</AppText>
                      </View>
                    ) : family.role === "owner" ? (
                      <View style={styles.memberActions}>
                        <Button label="Make owner" variant="ghost" onPress={() => { setOwnershipTarget(member.user_id); setMemberAction(null); setError(""); }} disabled={transferOwnership.isPending} />
                        <Button label="Remove" variant="danger" onPress={() => setMemberAction(member.user_id)} disabled={removeMember.isPending} />
                      </View>
                    ) : null}
                    {memberAction === member.user_id ? (
                      <View style={[styles.confirmBox, styles.memberConfirmBox, { backgroundColor: theme.colors.accentSurface }]}>
                        <AppText variant="caption">Remove {memberName} from the Family?</AppText>
                        <View style={styles.actions}>
                          <Button label="Keep" variant="secondary" onPress={() => setMemberAction(null)} />
                          <Button label="Remove member" variant="danger" loading={removeMember.isPending} onPress={() => removeMember.mutate()} />
                        </View>
                      </View>
                    ) : null}
                    {ownershipTarget === member.user_id ? (
                      <View style={[styles.confirmBox, styles.memberConfirmBox, { backgroundColor: theme.colors.brandSoft }]}>
                        <AppText variant="label">Transfer Family ownership?</AppText>
                        <AppText variant="caption" muted>{memberName} will become the owner. You will remain in the Family as a caregiver and lose owner-only controls.</AppText>
                        <View style={styles.actions}>
                          <Button label="Keep ownership" variant="secondary" onPress={() => setOwnershipTarget(null)} />
                          <Button label="Transfer ownership" loading={transferOwnership.isPending} onPress={() => transferOwnership.mutate(member.user_id)} />
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </> : null}
          {familySection === "manage" ? <View style={styles.actions}>
            {family.role === "owner" ? <Button label="Refresh invite" variant="secondary" loading={refresh.isPending} onPress={() => refresh.mutate()} /> : null}
            <Button label="Join another Family" variant="ghost" onPress={() => { setMode("join"); setError(""); }} />
          </View> : null}
          {familySection === "manage" ? <Card style={styles.managementCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.rowCopy}>
                <AppText variant="heading">Family settings</AppText>
                <AppText variant="caption" muted>Keep the shared space accurate and governed.</AppText>
              </View>
              {family.role === "owner" ? <View style={[styles.ownerPill, { backgroundColor: theme.colors.brandSoft }]}><CheckIcon size={13} color={theme.colors.brandStrong} weight="bold" /><AppText variant="caption" style={{ color: theme.colors.brandStrong }}>Owner</AppText></View> : null}
            </View>
            {family.role === "owner" ? (
              editingFamily ? (
                <View style={styles.form}>
                  <TextField label="Family name" value={familyName} onChangeText={setFamilyName} placeholder="The Milo household" error={error} />
                  <TextField label="Family timezone" value={familyTimezone} onChangeText={setFamilyTimezone} placeholder="Asia/Shanghai" hint="Use an IANA timezone, for example America/Los_Angeles." />
                  <View style={styles.actions}>
                    <Button label="Cancel" variant="secondary" onPress={() => { setEditingFamily(false); setError(""); }} />
                    <Button label="Save name" loading={updateFamily.isPending} disabled={!familyName.trim()} onPress={() => updateFamily.mutate()} />
                  </View>
                </View>
              ) : (
                <View style={styles.actions}>
                  <Button label="Edit Family" variant="secondary" onPress={() => { setFamilyName(family.name); setFamilyTimezone(family.timezone); setEditingFamily(true); setError(""); }} />
                  <Button label="Delete Family" variant="danger" onPress={() => { setDeleteFamilyConfirm(""); setFamilyAction("delete"); }} />
                </View>
              )
            ) : (
              <Button label="Leave Family" variant="danger" onPress={() => setFamilyAction("leave")} />
            )}
            {familyAction ? (
              <View style={[styles.confirmBox, { backgroundColor: theme.colors.surfaceRaised }]}>
                <AppText variant="label">{familyAction === "delete" ? "Delete this Family?" : "Leave this Family?"}</AppText>
                <AppText variant="caption" muted>{familyAction === "delete" ? "Pets must be transferred or deleted first. Shared history is not silently removed." : "You will lose access to the Pets shared in this Family."}</AppText>
                {familyAction === "delete" ? <TextField label={`Type ${family.name} to confirm`} value={deleteFamilyConfirm} onChangeText={(value) => { setDeleteFamilyConfirm(value); setError(""); }} placeholder={family.name} autoCapitalize="none" autoCorrect={false} /> : null}
                {error ? <AppText variant="caption" style={{ color: theme.colors.danger }}>{error}</AppText> : null}
                <View style={styles.actions}>
                  <Button label="Cancel" variant="secondary" onPress={() => { setFamilyAction(null); setDeleteFamilyConfirm(""); }} />
                  <Button label={familyAction === "delete" ? "Delete Family" : "Leave Family"} variant="danger" loading={leaveFamily.isPending || deleteFamily.isPending} disabled={familyAction === "delete" && deleteFamilyConfirm.trim() !== family.name} onPress={() => familyAction === "delete" ? deleteFamily.mutate() : leaveFamily.mutate()} />
                </View>
              </View>
            ) : null}
          </Card> : null}
        </>
      ) : (
        <Card style={styles.emptyCard}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.colors.brandSoft }]}>
            <UsersThreeIcon size={28} color={theme.colors.brandStrong} weight="duotone" />
          </View>
          <AppText variant="title">Start your care family.</AppText>
          <AppText muted>Keep the people, Pets and shared care in one calm place.</AppText>
          <View style={styles.actions}>
            <Button label="Create Family" onPress={() => { setMode("create"); setError(""); }} />
            <Button label="Join with invite" variant="secondary" onPress={() => { setMode("join"); setError(""); }} />
          </View>
        </Card>
      )}
      {mode !== "none" ? (
        <Card style={styles.form}>
          <View style={styles.formHeader}>
            <View>
              <AppText variant="title">{mode === "create" ? "Create a Family" : "Join a Family"}</AppText>
              <AppText variant="caption" muted>{mode === "create" ? "Give your shared care space a name." : "Use the code someone shared with you."}</AppText>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setMode("none")}>
              <AppText variant="label" style={{ color: theme.colors.brandStrong }}>Close</AppText>
            </Pressable>
          </View>
          {mode === "create" ? (
            <TextField label="Family name" value={name} onChangeText={setName} placeholder="The Milo household" />
          ) : (
            <TextField label="Invite code" value={code} onChangeText={(value) => setCode(value.toUpperCase())} autoCapitalize="characters" placeholder="ABCDEFGH12" />
          )}
          {error ? <AppText variant="caption" style={{ color: theme.colors.danger }}>{error}</AppText> : null}
          <Button label={mode === "create" ? "Create Family" : "Join Family"} loading={create.isPending || join.isPending} disabled={mode === "create" ? !name.trim() : !code.trim()} onPress={submitForm} />
        </Card>
      ) : null}
      {deletedFamilies.data?.families.length ? <Card style={styles.deletedCard}><View style={styles.sectionHeader}><View style={styles.rowCopy}><AppText variant="heading">Recently deleted</AppText><AppText variant="caption" muted>Restore within 30 days. Deleted Families still reserve your Family quota.</AppText></View></View>{deletedFamilies.data.families.map((deleted) => <View key={deleted.id} style={[styles.deletedRow, { borderColor: theme.colors.border }]}><View style={styles.rowCopy}><AppText variant="label">{deleted.name}</AppText><AppText variant="caption" muted>Deleted {new Date(deleted.deleted_at).toLocaleDateString()}</AppText></View><Button label="Restore" variant="secondary" loading={restoreFamily.isPending && restoreFamily.variables === deleted.id} disabled={restoreFamily.isPending} onPress={() => restoreFamily.mutate(deleted.id)} /></View>)}</Card> : null}
      <AppText variant="caption" muted style={styles.footnote}>Access is always granted through the Pet and Family relationship you choose.</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "stretch" },
  content: { maxWidth: 680, alignSelf: "center", width: "100%", paddingBottom: 136, gap: 20 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  headerCopy: { flex: 1, gap: 5 },
  headerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  identity: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 },
  identityMark: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  identityCopy: { flex: 1, gap: 3 },
  familyPicker: { gap: 8 },
  familyOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  familyOption: { minHeight: 42, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  hero: { minHeight: 170, borderRadius: 14, padding: 20, overflow: "hidden", flexDirection: "row", alignItems: "center" },
  heroCopy: { flex: 1, gap: 7, zIndex: 1 },
  orbit: { width: 142, height: 142, borderWidth: 1, borderRadius: 71, alignItems: "center", justifyContent: "center" },
  orbitMark: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center" },
  inviteCard: { gap: 14 },
  flatSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 18 },
  toolsCard: { gap: 2 },
  petCard: { gap: 8 },
  petRow: { minHeight: 60, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  petMarkSmall: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  petEmpty: { alignItems: "flex-start", gap: 9, paddingTop: 8 },
  morePets: { paddingTop: 4 },
  transferCard: { gap: 12 },
  transferList: { gap: 8 },
  transferRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  rowCopy: { flex: 1, gap: 2 },
  inviteHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  inviteIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  codeBox: { minHeight: 58, paddingHorizontal: 14, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  codeCopy: { gap: 3 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 2 },
  members: { paddingHorizontal: 16, paddingVertical: 2 },
  member: { minHeight: 72, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 11 },
  memberAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  memberCopy: { flex: 1, minWidth: 120, gap: 2 },
  memberConfirmBox: { width: "100%" },
  ownerPill: { minHeight: 27, paddingHorizontal: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 4 },
  memberActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: 4 },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 9 },
  emptyCard: { gap: 11, alignItems: "flex-start" },
  emptyIcon: { width: 55, height: 55, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  form: { gap: 14 },
  managementCard: { gap: 13 },
  deletedCard: { gap: 12 },
  deletedRow: { minHeight: 60, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  confirmBox: { borderRadius: 16, padding: 14, gap: 8 },
  formHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  footnote: { textAlign: "center", paddingVertical: 8 },
});
