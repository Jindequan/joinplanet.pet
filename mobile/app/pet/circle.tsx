/**
 * Care Circle (spec §48–§49) — Owner/Caregiver groups with role badges.
 * Member rows use the AvatarBubble letter fallback (brand100/brand700 — the
 * same rhythm as PetPhoto). Owner can invite (POST /circles/{id}/invite →
 * rotating code, shared via Share sheet or copied to the clipboard) and
 * remove caregivers (DELETE member, confirmed).
 */
import React, { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Share2, X } from 'lucide-react-native';
import {
  Card,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  Skeleton,
  StatusBadge,
} from '../../src/components/ui';
import { useToast } from '../../src/components/toast';
import { AvatarBubble, GroupLabel, PageShell, useCircleMembers } from '../../src/components/pet/parts';
import { del, post } from '../../src/lib/api';
import { qk, useMe, type CircleMember } from '../../src/lib/queries';
import { colors, spacing, typography } from '../../src/theme';

export default function CareCircleScreen() {
  const { data: me } = useMe();
  const circleWithPet = me?.circles.find((c) => c.pet);
  const petName = circleWithPet?.pet?.name ?? 'your pet';
  const circleId = circleWithPet?.id;
  const isOwner = circleWithPet?.role === 'owner';

  const { data, isLoading } = useCircleMembers(circleId);
  const client = useQueryClient();
  const { toast } = useToast();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const members = data?.members ?? [];
  const owners = members.filter((m) => m.role === 'owner');
  const caregivers = members.filter((m) => m.role !== 'owner');

  const openInvite = async () => {
    if (inviteOpen) {
      setInviteOpen(false);
      return;
    }
    setInviteOpen(true);
    setInviteCode(null);
    setInviteBusy(true);
    try {
      const res = await post<{ invite_code: string }>(`/circles/${circleId}/invite`);
      setInviteCode(res.invite_code);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not create invite' });
      setInviteOpen(false);
    } finally {
      setInviteBusy(false);
    }
  };

  const shareInvite = async () => {
    if (!inviteCode) return;
    try {
      await Share.share({
        message: `Join me in caring for ${petName} on PLANET: https://joinplanet.pet/invite/${inviteCode}`,
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const copyInviteCode = async () => {
    if (!inviteCode) return;
    try {
      await Clipboard.setStringAsync(inviteCode);
      toast({ message: 'Invite code copied' });
    } catch {
      toast({ message: 'Could not copy code' });
    }
  };

  const confirmRemove = (member: CircleMember) => {
    Alert.alert(
      'Remove caregiver',
      `Remove ${member.display_name} from ${petName}'s care circle?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void removeMember(member) },
      ],
    );
  };

  const removeMember = async (member: CircleMember) => {
    if (!circleId || removingId) return;
    setRemovingId(member.user_id);
    try {
      await del(`/circles/${circleId}/members/${member.user_id}`);
      void client.invalidateQueries({ queryKey: qk.circle(circleId) });
      toast({ message: `Removed ${member.display_name}` });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not remove' });
    } finally {
      setRemovingId(null);
    }
  };

  const memberRow = (member: CircleMember) => {
    const removable = isOwner && member.role !== 'owner';
    return (
      <Pressable
        key={member.user_id}
        onLongPress={removable ? () => confirmRemove(member) : undefined}
        delayLongPress={400}
        disabled={removingId !== null}
        style={({ pressed }) => [styles.memberRow, pressed && { opacity: 0.7 }]}
      >
        <AvatarBubble label={member.display_name} size={44} />
        <View style={styles.memberText}>
          <Text style={styles.memberName} numberOfLines={1}>
            {member.display_name}
          </Text>
          <Text style={styles.memberEmail} numberOfLines={1}>
            {member.email}
          </Text>
        </View>
        <StatusBadge
          label={member.role === 'owner' ? 'Owner' : 'Caregiver'}
          variant={member.role === 'owner' ? 'brand' : 'neutral'}
        />
        {removable ? (
          <IconButton
            icon={X}
            label={`Remove ${member.display_name}`}
            size={18}
            color={colors.textSecondary}
            disabled={removingId !== null}
            onPress={() => confirmRemove(member)}
          />
        ) : null}
      </Pressable>
    );
  };

  return (
    <PageShell title="Care circle">
      {/* Owner */}
      <View>
        <GroupLabel>Owner</GroupLabel>
        <Card padding={0} style={styles.groupCard}>
          {isLoading ? (
            <View style={styles.memberRow}>
              <Skeleton width={44} height={44} round />
              <View style={[styles.memberText, styles.memberTextSkeleton]}>
                <Skeleton width={110} height={14} />
                <Skeleton width={150} height={10} />
              </View>
            </View>
          ) : owners.length === 0 ? (
            <Text style={styles.emptyText}>No owner found</Text>
          ) : (
            owners.map(memberRow)
          )}
        </Card>
      </View>

      {/* Caregivers */}
      <View>
        <GroupLabel>Caregivers</GroupLabel>
        <Card padding={0} style={styles.groupCard}>
          {!isLoading && caregivers.length === 0 ? (
            <Text style={styles.emptyText}>
              No caregivers yet — invite someone to share {petName}&rsquo;s care.
            </Text>
          ) : (
            caregivers.map(memberRow)
          )}
        </Card>
      </View>

      {/* Invite (spec §49) — owner only */}
      {isOwner ? (
        <>
          <PrimaryButton label="Invite a caregiver" onPress={() => void openInvite()} />
          {inviteOpen ? (
            <Card style={styles.inviteCard}>
              <Text style={styles.inviteTitle}>Invite someone to care for {petName}</Text>
              {inviteBusy || !inviteCode ? (
                <Skeleton height={32} />
              ) : (
                <Text style={styles.inviteCode} selectable>
                  {inviteCode}
                </Text>
              )}
              <Text style={styles.inviteHint}>
                Anyone with this invite can join {petName}&rsquo;s care circle.
              </Text>
              <View style={styles.inviteActions}>
                <PrimaryButton
                  label="Share invite"
                  icon={Share2}
                  disabled={!inviteCode}
                  onPress={() => void shareInvite()}
                  style={styles.inviteAction}
                />
                <SecondaryButton
                  label="Copy code"
                  icon={Copy}
                  disabled={!inviteCode}
                  onPress={() => void copyInviteCode()}
                  style={styles.inviteAction}
                />
              </View>
            </Card>
          ) : null}
        </>
      ) : null}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  groupCard: { overflow: 'hidden', marginTop: spacing.s8 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
    minHeight: 68,
  },
  memberText: { flex: 1, gap: 2 },
  memberTextSkeleton: { gap: spacing.s4 },
  memberName: { ...typography.card, color: colors.text },
  memberEmail: { ...typography.caption, color: colors.textSecondary },
  emptyText: {
    ...typography.bodySm,
    color: colors.textTertiary,
    padding: spacing.s16,
  },
  inviteCard: { gap: spacing.s12 },
  inviteTitle: { ...typography.section, color: colors.text },
  inviteCode: {
    ...typography.page,
    color: colors.brand700,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    paddingVertical: spacing.s8,
  },
  inviteHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  inviteActions: { flexDirection: 'row', gap: spacing.s8 },
  inviteAction: { flex: 1 },
});
