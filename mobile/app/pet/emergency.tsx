/**
 * Emergency & Vet (spec §50) — three calm display groups (Primary / Vet /
 * Medical decision contact; phone rows open tel:) with an inline editor that
 * PATCHes emergency_contacts ({primary:{name,phone,note}|null, ...} per
 * contract F3). No red alarm visuals — ordinary, stable language.
 */
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone } from 'lucide-react-native';
import {
  Card,
  Field,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
} from '../../src/components/ui';
import { useToast } from '../../src/components/toast';
import {
  GroupLabel,
  PageShell,
  readEmergencyContacts,
  useCircleMembers,
  type EmergencyContact,
} from '../../src/components/pet/parts';
import { patch } from '../../src/lib/api';
import { qk, useActivePet, useMe, usePet } from '../../src/lib/queries';
import { colors, spacing, typography } from '../../src/theme';

type Slot = 'primary' | 'vet' | 'adm';

interface Draft {
  name: string;
  phone: string;
  note: string;
}

const SLOTS: { key: Slot; label: string }[] = [
  { key: 'primary', label: 'Primary contact' },
  { key: 'vet', label: 'Vet' },
  { key: 'adm', label: 'Medical decision contact' },
];

const emptyDraft: Draft = { name: '', phone: '', note: '' };

export default function EmergencyScreen() {
  const { pet: petSummary, circle } = useActivePet();
  const petId = petSummary?.id;
  const { data: pet } = usePet(petId);
  // Archived pets are read-only (V1.5) — emergency contacts are view-only.
  const isArchived = !!(petSummary?.archived ?? pet?.archived);
  const { data: me } = useMe();
  const { data: circleData } = useCircleMembers(circle?.id);
  const client = useQueryClient();
  const { toast } = useToast();

  const contacts = readEmergencyContacts(pet?.emergency_contacts);
  const contactFor = (slot: Slot): EmergencyContact | null | undefined =>
    slot === 'primary'
      ? contacts.primary
      : slot === 'vet'
        ? contacts.vet
        : contacts.authorized_decision_maker;

  // Owner display name for the explainer (spec §50); falls back to "you".
  const ownerName =
    circleData?.members.find((m) => m.role === 'owner')?.display_name ??
    (circle?.role === 'owner' ? me?.user.display_name : undefined) ??
    'the owner';

  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<Slot, Draft>>({
    primary: emptyDraft,
    vet: emptyDraft,
    adm: emptyDraft,
  });

  const save = useMutation({
    // 契约 v2：联系人走 /pets/{id}/profile，数组 + med_decision_maker
    mutationFn: (body: Record<string, unknown>) => patch(`/pets/${petId}/profile`, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.pet(petId ?? '') });
      toast({ message: 'Saved' });
      setEditing(false);
    },
    onError: (err) => toast({ message: err.message }),
  });

  const startEdit = () => {
    if (isArchived) {
      toast({ message: `${petSummary?.name ?? 'This pet'} is archived and read-only` });
      return;
    }
    const toDraft = (c: EmergencyContact | null | undefined): Draft => ({
      name: c?.name ?? '',
      phone: c?.phone ?? '',
      note: c?.note ?? '',
    });
    setDrafts({
      primary: toDraft(contacts.primary),
      vet: toDraft(contacts.vet),
      adm: toDraft(contacts.authorized_decision_maker),
    });
    setEditing(true);
  };

  const setDraft = (slot: Slot, patchDraft: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [slot]: { ...prev[slot], ...patchDraft } }));
  };

  /** Empty name ⇒ removed.契约 v2：emergency_contacts 是数组，医疗决定人单独。 */
  const buildBody = () => {
    const build = (d: Draft, relation: string) =>
      d.name.trim()
        ? {
            name: d.name.trim(),
            phone: d.phone.trim() || undefined,
            relation,
          }
        : null;
    const contacts = [build(drafts.primary, 'primary'), build(drafts.vet, 'vet')].filter(
      (c) => c !== null,
    ) as { name: string; phone?: string; relation: string }[];
    return {
      emergency_contacts: contacts,
      med_decision_maker: build(drafts.adm, 'medical_decision_maker'),
    };
  };

  const callPhone = async (phone: string) => {
    try {
      await Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
    } catch {
      toast({ message: 'Cannot place calls on this device' });
    }
  };

  const displayCard = (slot: Slot, label: string, divider = true) => {
    const contact = contactFor(slot);
    return (
      <View key={slot} style={styles.displayGroup}>
        <GroupLabel>{label}</GroupLabel>
        {contact?.name ? (
          <View style={styles.contactBlock}>
            <Text style={styles.contactName}>{contact.name}</Text>
            {contact.phone ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void callPhone(contact.phone!)}
                style={({ pressed }) => [styles.phoneRow, pressed && { opacity: 0.6 }]}
              >
                <Phone size={15} color={colors.brand700} />
                <Text style={styles.phoneText}>{contact.phone}</Text>
              </Pressable>
            ) : null}
            {contact.note ? (
              <Text style={styles.contactNote}>{contact.note}</Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.notSet}>Not set</Text>
        )}
        {divider ? <View style={styles.groupGap} /> : null}
      </View>
    );
  };

  return (
    <PageShell title="Emergency & Vet">
      {/* Calm explainer (spec §50) */}
      <Text style={styles.explainer}>
        If {ownerName} cannot be reached, the medical decision contact can authorize
        care.
      </Text>

      <SectionHeader
        title="Contacts"
        action={editing || isArchived ? undefined : { label: 'Edit', onPress: startEdit }}
      />

      {editing ? (
        <Card style={styles.editCard}>
          {SLOTS.map((slot, index) => (
            <View key={slot.key} style={styles.editGroup}>
              <GroupLabel>{slot.label}</GroupLabel>
              <Field
                label="Name"
                placeholder="e.g. Greenwoods Veterinary"
                value={drafts[slot.key].name}
                onChangeText={(v) => setDraft(slot.key, { name: v })}
              />
              <Field
                label="Phone"
                placeholder="+86 138…"
                value={drafts[slot.key].phone}
                onChangeText={(v) => setDraft(slot.key, { phone: v })}
                keyboardType="phone-pad"
              />

              {index < SLOTS.length - 1 ? <View style={styles.groupGapBig} /> : null}
            </View>
          ))}
          <View style={styles.buttonRow}>
            <SecondaryButton label="Cancel" onPress={() => setEditing(false)} style={styles.flex} />
            <PrimaryButton
              label="Save"
              loading={save.isPending}
              onPress={() => save.mutate(buildBody())}
              style={styles.flex}
            />
          </View>
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {displayCard('primary', SLOTS[0].label)}
          {displayCard('vet', SLOTS[1].label)}
          {displayCard('adm', SLOTS[2].label, false)}
        </Card>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  explainer: {
    ...typography.bodySm,
    color: colors.textSecondary,
    paddingBottom: spacing.s4,
  },
  listCard: { padding: spacing.s16 },
  displayGroup: {},
  groupGap: { height: spacing.s16 },
  groupGapBig: { height: spacing.s24 },
  contactBlock: { gap: spacing.s4, marginTop: spacing.s4 },
  contactName: { ...typography.body, color: colors.text, fontWeight: '600' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s8 },
  phoneText: { ...typography.bodySm, color: colors.brand700, fontWeight: '600' },
  contactNote: { ...typography.caption, color: colors.textSecondary },
  notSet: { ...typography.bodySm, color: colors.textTertiary, marginTop: spacing.s4 },
  editCard: { gap: spacing.s8 },
  editGroup: { gap: spacing.s8 },
  buttonRow: { flexDirection: 'row', gap: spacing.s12, marginTop: spacing.s8 },
  flex: { flex: 1 },
});
