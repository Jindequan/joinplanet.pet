import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { useMutation } from "@tanstack/react-query";
import { AppText, Button, Card, QueryErrorState, Screen, TextField } from "../src/ui/components";
import { useTheme } from "../src/core/providers/theme-provider";
import {
  useCircle,
  useCirclePets,
  useCircles,
  useInvalidateApi,
} from "../src/core/query/hooks";
import { planetApi } from "../src/core/api/planet-api";
import { ApiError } from "../src/core/network/api-client";
import { familySchema, joinFamilySchema } from "../src/core/forms";
import {
  CheckIcon,
  PawPrintIcon,
  PlusIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from "../src/ui/icons";

export default function FamilyRoute() {
  const { theme } = useTheme();
  const circles = useCircles();
  const [activeCircleId, setActiveCircleId] = useState<string>();
  const circle =
    circles.data?.circles.find((item) => item.id === activeCircleId) ??
    circles.data?.circles[0];
  const detail = useCircle(circle?.id);
  const pets = useCirclePets(circle?.id);
  const invalidate = useInvalidateApi();
  const [mode, setMode] = useState<"none" | "create" | "join">("none");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [editingFamily, setEditingFamily] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [familyAction, setFamilyAction] = useState<"leave" | "delete" | null>(null);
  const [memberAction, setMemberAction] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => planetApi.circles.create(name.trim()),
    onSuccess: (result) => {
      setName("");
      setMode("none");
      setInvite(result.invite_code);
      setActiveCircleId(result.circle.id);
      invalidate.circles();
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Unable to create your Family.",
      ),
  });
  const join = useMutation({
    mutationFn: () => planetApi.circles.join(code.trim()),
    onSuccess: (result) => {
      setCode("");
      setMode("none");
      setActiveCircleId(result.circle.id);
      invalidate.circles();
    },
    onError: (err) =>
      setError(
        err instanceof ApiError
          ? err.message
          : "That invite could not be accepted.",
      ),
  });
  const refresh = useMutation({
    mutationFn: () => planetApi.circles.refreshInvite(circle!.id),
    onSuccess: (result) => {
      setInvite(result.invite_code);
      setCopied(false);
    },
  });
  const updateFamily = useMutation({
    mutationFn: () => planetApi.circles.update(circle!.id, { name: familyName.trim() }),
    onSuccess: () => {
      setEditingFamily(false);
      setError("");
      invalidate.circles();
      invalidate.circle(circle!.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to update this Family."),
  });
  const removeMember = useMutation({
    mutationFn: () => planetApi.circles.removeMember(circle!.id, memberAction!),
    onSuccess: () => {
      setMemberAction(null);
      invalidate.circle(circle!.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to remove this member."),
  });
  const transferOwnership = useMutation({
    mutationFn: (userId: string) => planetApi.circles.transfer(circle!.id, userId),
    onSuccess: () => {
      setError("");
      invalidate.circles();
      invalidate.circle(circle!.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to transfer ownership."),
  });
  const leaveFamily = useMutation({
    mutationFn: () => planetApi.circles.leave(circle!.id),
    onSuccess: () => {
      setFamilyAction(null);
      setActiveCircleId(undefined);
      invalidate.circles();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to leave this Family."),
  });
  const deleteFamily = useMutation({
    mutationFn: () => planetApi.circles.delete(circle!.id),
    onSuccess: () => {
      setFamilyAction(null);
      setActiveCircleId(undefined);
      invalidate.circles();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to delete this Family."),
  });
  async function copyInvite() {
    if (!invite) return;
    try {
      await Clipboard.setStringAsync(invite);
      setCopied(true);
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
  if (circles.isLoading || (circle && detail.isLoading))
    return (
      <Screen>
        <ActivityIndicator color={theme.colors.brand} />
      </Screen>
    );
  if (circles.isError || detail.isError || pets.isError)
    return (
      <Screen contentContainerStyle={styles.center}>
        <QueryErrorState
          title="Your Family is unavailable"
          body="We could not load the people and Pets in this care circle."
          onRetry={() => {
            void circles.refetch();
            if (circle) {
              void detail.refetch();
              void pets.refetch();
            }
          }}
        />
      </Screen>
    );
  const members = detail.data?.members ?? [];
  const petCount = pets.data?.pets.length ?? 0;
  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText variant="caption" muted>
            YOUR ORBIT / FAMILY
          </AppText>
          <AppText variant="display">Care together.</AppText>
          <AppText muted>
            One shared view for the people who show up for them.
          </AppText>
        </View>
        <View
          style={[
            styles.headerIcon,
            { backgroundColor: theme.colors.accentSurface },
          ]}
        >
          <UsersThreeIcon
            size={23}
            color={theme.colors.accentStrong}
            weight="duotone"
          />
        </View>
      </View>
      {circles.data?.circles.length && circles.data.circles.length > 1 ? (
        <View style={styles.familyPicker}>
          <AppText variant="caption" muted>
            YOUR FAMILIES
          </AppText>
          <View style={styles.familyOptions}>
            {circles.data.circles.map((item) => {
              const selected = item.id === circle?.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setActiveCircleId(item.id);
                    setInvite("");
                  }}
                  style={[
                    styles.familyOption,
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
                    {item.name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {circle ? (
        <>
          <LinearGradient
            colors={[theme.colors.brandStrong, theme.colors.brand]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroCopy}>
              <AppText
                variant="caption"
                style={{ color: "rgba(255,255,255,0.72)" }}
              >
                CARE CIRCLE
              </AppText>
              <AppText variant="title" style={{ color: theme.colors.onBrand }}>
                {circle.name}
              </AppText>
              <AppText style={{ color: "rgba(255,255,255,0.82)" }}>
                {members.length} {members.length === 1 ? "person" : "people"} ·{" "}
                {petCount} {petCount === 1 ? "Pet" : "Pets"}
              </AppText>
            </View>
            <View
              style={[styles.orbit, { borderColor: "rgba(255,255,255,0.32)" }]}
            >
              <View
                style={[
                  styles.orbitMark,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <PawPrintIcon
                  size={24}
                  color={theme.colors.accentStrong}
                  weight="duotone"
                />
              </View>
            </View>
          </LinearGradient>
          <Card style={styles.inviteCard}>
            <View style={styles.inviteHeader}>
              <View>
                <AppText variant="heading">Bring someone in</AppText>
                <AppText variant="caption" muted>
                  Invite a trusted person to help care.
                </AppText>
              </View>
              <View
                style={[
                  styles.inviteIcon,
                  { backgroundColor: theme.colors.accentSurface },
                ]}
              >
                <PlusIcon
                  size={18}
                  color={theme.colors.accentStrong}
                  weight="bold"
                />
              </View>
            </View>
            {invite ? (
              <View
                style={[
                  styles.codeBox,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View style={styles.codeCopy}>
                  <AppText
                    selectable
                    variant="title"
                    style={{ letterSpacing: 2 }}
                  >
                    {invite}
                  </AppText>
                  <AppText variant="caption" muted>
                    Share this code with someone you trust.
                  </AppText>
                </View>
                <Button
                  label={copied ? "Copied" : "Copy code"}
                  variant="secondary"
                  onPress={() => void copyInvite()}
                />
              </View>
            ) : (
              <Button
                label="Create an invite code"
                variant="secondary"
                loading={refresh.isPending}
                onPress={() => refresh.mutate()}
              />
            )}
          </Card>
          <View style={styles.sectionHeader}>
            <View>
              <AppText variant="title">The people</AppText>
              <AppText variant="caption" muted>
                Everyone with a place in their care.
              </AppText>
            </View>
            <AppText variant="caption" muted>
              {members.length} active
            </AppText>
          </View>
          <Card style={styles.members}>
            {members.map((member, index) => (
              <View
                key={member.user_id}
                style={[
                  styles.member,
                  index < members.length - 1 && {
                    borderBottomColor: theme.colors.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <View
                  style={[
                    styles.memberAvatar,
                    {
                      backgroundColor:
                        index === 0
                          ? theme.colors.brandSoft
                          : theme.colors.accentSurface,
                    },
                  ]}
                >
                  <UserCircleIcon
                    size={23}
                    color={
                      index === 0
                        ? theme.colors.brandStrong
                        : theme.colors.accentStrong
                    }
                    weight="duotone"
                  />
                </View>
                <View style={styles.memberCopy}>
                  <AppText variant="label">
                    {member.display_name || member.email || "Planet member"}
                  </AppText>
                  <AppText variant="caption" muted>
                    {member.role === "owner" ? "Family owner" : "Caregiver"} ·
                    active
                  </AppText>
                </View>
                {member.role === "owner" ? (
                  <View
                    style={[
                      styles.ownerPill,
                      { backgroundColor: theme.colors.brandSoft },
                    ]}
                  >
                    <CheckIcon
                      size={13}
                      color={theme.colors.brandStrong}
                      weight="bold"
                    />
                    <AppText
                      variant="caption"
                      style={{ color: theme.colors.brandStrong }}
                    >
                      Owner
                    </AppText>
                  </View>
                ) : circle.role === "owner" ? (
                  <View style={styles.memberActions}>
                    <Button label="Make owner" variant="ghost" onPress={() => transferOwnership.mutate(member.user_id)} disabled={transferOwnership.isPending} />
                    <Button label="Remove" variant="danger" onPress={() => setMemberAction(member.user_id)} disabled={removeMember.isPending} />
                  </View>
                ) : null}
                {memberAction === member.user_id ? (
                  <View style={[styles.confirmBox, { backgroundColor: theme.colors.accentSurface }]}>
                    <AppText variant="caption">Remove {member.display_name || "this member"} from the Family?</AppText>
                    <View style={styles.actions}>
                      <Button label="Keep" variant="secondary" onPress={() => setMemberAction(null)} />
                      <Button label="Remove member" variant="danger" loading={removeMember.isPending} onPress={() => removeMember.mutate()} />
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
          <View style={styles.actions}>
            <Button
              label="Refresh invite"
              variant="secondary"
              loading={refresh.isPending}
              onPress={() => refresh.mutate()}
            />
            <Button
              label="Join another Family"
              variant="ghost"
              onPress={() => {
                setMode("join");
                setError("");
              }}
            />
          </View>
          <Card style={styles.managementCard}>
            <View style={styles.sectionHeader}>
              <View>
                <AppText variant="heading">Family settings</AppText>
                <AppText variant="caption" muted>Keep the shared space accurate and governed.</AppText>
              </View>
              {circle.role === "owner" ? <AppText variant="caption" style={{ color: theme.colors.brandStrong }}>OWNER</AppText> : null}
            </View>
            {circle.role === "owner" ? (
              editingFamily ? (
                <View style={styles.form}>
                  <TextField label="Family name" value={familyName} onChangeText={setFamilyName} placeholder="The Milo household" error={error} />
                  <View style={styles.actions}>
                    <Button label="Cancel" variant="secondary" onPress={() => { setEditingFamily(false); setError(""); }} />
                    <Button label="Save name" loading={updateFamily.isPending} disabled={!familyName.trim()} onPress={() => updateFamily.mutate()} />
                  </View>
                </View>
              ) : (
                <View style={styles.actions}>
                  <Button label="Rename Family" variant="secondary" onPress={() => { setFamilyName(circle.name); setEditingFamily(true); setError(""); }} />
                  <Button label="Delete Family" variant="danger" onPress={() => setFamilyAction("delete")} />
                </View>
              )
            ) : (
              <Button label="Leave Family" variant="danger" onPress={() => setFamilyAction("leave")} />
            )}
            {familyAction ? (
              <View style={[styles.confirmBox, { backgroundColor: theme.colors.surfaceRaised }]}>
                <AppText variant="label">{familyAction === "delete" ? "Delete this Family?" : "Leave this Family?"}</AppText>
                <AppText variant="caption" muted>{familyAction === "delete" ? "Pets must be transferred or deleted first. Shared history is not silently removed." : "You will lose access to the Pets shared in this Family."}</AppText>
                <View style={styles.actions}>
                  <Button label="Cancel" variant="secondary" onPress={() => setFamilyAction(null)} />
                  <Button label={familyAction === "delete" ? "Delete Family" : "Leave Family"} variant="danger" loading={leaveFamily.isPending || deleteFamily.isPending} onPress={() => familyAction === "delete" ? deleteFamily.mutate() : leaveFamily.mutate()} />
                </View>
              </View>
            ) : null}
          </Card>
        </>
      ) : (
        <Card style={styles.emptyCard}>
          <View
            style={[
              styles.emptyIcon,
              { backgroundColor: theme.colors.brandSoft },
            ]}
          >
            <UsersThreeIcon
              size={28}
              color={theme.colors.brandStrong}
              weight="duotone"
            />
          </View>
          <AppText variant="title">Start your care circle.</AppText>
          <AppText muted>
            Family is the shared relationship around Pets—not another layer you
            have to manage.
          </AppText>
          <View style={styles.actions}>
            <Button
              label="Create Family"
              onPress={() => {
                setMode("create");
                setError("");
              }}
            />
            <Button
              label="Join with invite"
              variant="secondary"
              onPress={() => {
                setMode("join");
                setError("");
              }}
            />
          </View>
        </Card>
      )}
      {mode !== "none" ? (
        <Card style={styles.form}>
          <View style={styles.formHeader}>
            <View>
              <AppText variant="title">
                {mode === "create" ? "Create a Family" : "Join a Family"}
              </AppText>
              <AppText variant="caption" muted>
                {mode === "create"
                  ? "Give your shared care space a name."
                  : "Use the code someone shared with you."}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMode("none")}
            >
              <AppText
                variant="label"
                style={{ color: theme.colors.brandStrong }}
              >
                Close
              </AppText>
            </Pressable>
          </View>
          {mode === "create" ? (
            <TextField
              label="Family name"
              value={name}
              onChangeText={setName}
              placeholder="The Milo household"
            />
          ) : (
            <TextField
              label="Invite code"
              value={code}
              onChangeText={(value) => setCode(value.toUpperCase())}
              autoCapitalize="characters"
              placeholder="ABCDEFGH12"
            />
          )}
          {error ? (
            <AppText variant="caption" style={{ color: theme.colors.danger }}>
              {error}
            </AppText>
          ) : null}
          <Button
            label={mode === "create" ? "Create Family" : "Join Family"}
            loading={create.isPending || join.isPending}
            disabled={mode === "create" ? !name.trim() : !code.trim()}
            onPress={submitForm}
          />
        </Card>
      ) : null}
      <AppText variant="caption" muted style={styles.footnote}>
        Access is always granted through the Pet and Family relationship you
        choose.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "stretch" },
  content: {
    maxWidth: 680,
    alignSelf: "center",
    width: "100%",
    paddingBottom: 140,
    gap: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  headerCopy: { flex: 1, gap: 5 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  familyPicker: { gap: 8 },
  familyOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  familyOption: {
    minHeight: 38,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    minHeight: 190,
    borderRadius: 25,
    padding: 22,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
  },
  heroCopy: { flex: 1, gap: 7, zIndex: 1 },
  orbit: {
    width: 142,
    height: 142,
    borderWidth: 1,
    borderRadius: 71,
    alignItems: "center",
    justifyContent: "center",
  },
  orbitMark: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteCard: { gap: 14 },
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  inviteIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  codeBox: {
    minHeight: 58,
    paddingHorizontal: 16,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  codeCopy: { gap: 3 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 2,
  },
  members: { paddingHorizontal: 16, paddingVertical: 2 },
  member: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  memberAvatar: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  memberCopy: { flex: 1, gap: 2 },
  ownerPill: {
    minHeight: 27,
    paddingHorizontal: 8,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  memberActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: 4 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 9,
  },
  emptyCard: { gap: 11, alignItems: "flex-start" },
  emptyIcon: {
    width: 55,
    height: 55,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  form: { gap: 14 },
  managementCard: { gap: 13 },
  confirmBox: { borderRadius: 16, padding: 14, gap: 8 },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  footnote: { textAlign: "center", paddingVertical: 8 },
});
