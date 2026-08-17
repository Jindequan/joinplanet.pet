/**
 * Health Profile (spec §44) — Basic (species/breed/birthday) + Health
 * (allergies/conditions + derived current weight). Each section edits inline
 * and PATCHes /pets/{petID} (contract F3, any subset).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { Card, Field, IconButton, PrimaryButton, SecondaryButton, SectionHeader } from '../../src/components/ui';
import { useToast } from '../../src/components/toast';
import {
  DisplayRow,
  GroupLabel,
  PageShell,
  formatLongDate,
  formatShortDate,
  formatWeight,
  isValidBirthday,
  latestWeight,
} from '../../src/components/pet/parts';
import { patch } from '../../src/lib/api';
import { qk, useActivePet, usePet, type TimelinePage } from '../../src/lib/queries';
import { colors, radius, spacing, typography } from '../../src/theme';

/** List editor used for allergies/conditions: chips with remove + add field. */
function ListEditor({
  label,
  placeholder,
  items,
  onAdd,
  onRemove,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    const value = draft.trim();
    if (!value) return;
    onAdd(value);
    setDraft('');
  };
  return (
    <View style={styles.listEditor}>
      <GroupLabel>{label}</GroupLabel>
      {items.length === 0 ? (
        <Text style={styles.noneRecorded}>None recorded</Text>
      ) : (
        <View style={styles.chipList}>
          {items.map((item, index) => (
            <View key={`${item}-${index}`} style={styles.chipItem}>
              <Text style={styles.chipItemLabel}>{item}</Text>
              <IconButton
                icon={X}
                label={`Remove ${item}`}
                size={16}
                color={colors.textSecondary}
                onPress={() => onRemove(index)}
                style={styles.chipRemove}
              />
            </View>
          ))}
        </View>
      )}
      <Field
        label={`Add ${label.toLowerCase()}`}
        placeholder={placeholder}
        value={draft}
        onChangeText={setDraft}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
    </View>
  );
}

export default function HealthProfileScreen() {
  const { pet: petSummary } = useActivePet();
  const petId = petSummary?.id;
  const { data: pet } = usePet(petId);
  const client = useQueryClient();
  const { toast } = useToast();

  // Current weight is derived from the latest timeline weight event (§44).
  const weight = latestWeight(
    client.getQueryData<{ pages: TimelinePage[] }>(qk.timeline(petId ?? '')),
  );

  const [editingBasic, setEditingBasic] = useState(false);
  const [species, setSpecies] = useState('');
  const [breed, setBreed] = useState('');
  const [birthday, setBirthday] = useState('');
  const [birthdayError, setBirthdayError] = useState<string | null>(null);

  const [editingHealth, setEditingHealth] = useState(false);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);

  const savePet = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch(`/pets/${petId}`, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.pet(petId ?? '') });
      toast({ message: 'Saved' });
      setEditingBasic(false);
      setEditingHealth(false);
    },
    onError: (err) => toast({ message: err.message }),
  });

  const startBasicEdit = () => {
    setSpecies(pet?.species ?? '');
    setBreed(pet?.breed ?? '');
    setBirthday(pet?.birthday ?? '');
    setBirthdayError(null);
    setEditingBasic(true);
  };

  const saveBasic = () => {
    const trimmed = birthday.trim();
    if (trimmed && !isValidBirthday(trimmed)) {
      setBirthdayError('Use YYYY-MM-DD');
      return;
    }
    setBirthdayError(null);
    savePet.mutate({ species: species.trim(), breed: breed.trim(), birthday: trimmed || null });
  };

  const startHealthEdit = () => {
    setAllergies(pet?.allergies ?? []);
    setConditions(pet?.conditions ?? []);
    setEditingHealth(true);
  };

  const addToList = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
  ) => {
    setter((prev) => (prev.includes(value) ? prev : [...prev, value]));
  };

  const updatedLabel = weight ? formatShortDate(weight.at) : null;

  return (
    <PageShell title="Health profile">
      {/* Basic */}
      <View>
        <SectionHeader
          title="Basic"
          action={editingBasic ? undefined : { label: 'Edit', onPress: startBasicEdit }}
        />
        {editingBasic ? (
          <Card style={styles.editCard}>
            <Field label="Species" placeholder="e.g. Dog" value={species} onChangeText={setSpecies} />
            <Field label="Breed" placeholder="e.g. Golden Retriever" value={breed} onChangeText={setBreed} />
            <Field
              label="Birthday"
              placeholder="YYYY-MM-DD"
              value={birthday}
              onChangeText={setBirthday}
              error={birthdayError}
              hint="YYYY-MM-DD"
            />
            <View style={styles.buttonRow}>
              <SecondaryButton label="Cancel" onPress={() => setEditingBasic(false)} style={styles.flex} />
              <PrimaryButton
                label="Save"
                loading={savePet.isPending}
                onPress={saveBasic}
                style={styles.flex}
              />
            </View>
          </Card>
        ) : (
          <Card padding={0} style={styles.listCard}>
            <View style={styles.cardPadding}>
              <DisplayRow label="Species" value={pet?.species} divider />
              <DisplayRow label="Breed" value={pet?.breed} divider />
              <DisplayRow label="Birthday" value={formatLongDate(pet?.birthday)} />
            </View>
          </Card>
        )}
      </View>

      {/* Health */}
      <View>
        <SectionHeader
          title="Health"
          action={editingHealth ? undefined : { label: 'Edit', onPress: startHealthEdit }}
        />
        {editingHealth ? (
          <Card style={styles.editCard}>
            <ListEditor
              label="Allergies"
              placeholder="e.g. Chicken"
              items={allergies}
              onAdd={(v) => addToList(setAllergies, v)}
              onRemove={(i) => setAllergies((prev) => prev.filter((_, idx) => idx !== i))}
            />
            <ListEditor
              label="Conditions"
              placeholder="e.g. Atopic dermatitis"
              items={conditions}
              onAdd={(v) => addToList(setConditions, v)}
              onRemove={(i) => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
            />
            <View style={styles.buttonRow}>
              <SecondaryButton label="Cancel" onPress={() => setEditingHealth(false)} style={styles.flex} />
              <PrimaryButton
                label="Save"
                loading={savePet.isPending}
                onPress={() => savePet.mutate({ allergies, conditions })}
                style={styles.flex}
              />
            </View>
          </Card>
        ) : (
          <Card padding={0} style={styles.listCard}>
            <View style={styles.cardPadding}>
              <GroupLabel>Allergies</GroupLabel>
              {(pet?.allergies ?? []).length === 0 ? (
                <Text style={styles.noneRecorded}>None recorded</Text>
              ) : (
                <View style={styles.itemList}>
                  {(pet?.allergies ?? []).map((item) => (
                    <Text key={item} style={styles.itemText}>
                      {item}
                    </Text>
                  ))}
                </View>
              )}
              <View style={styles.groupGap} />
              <GroupLabel>Conditions</GroupLabel>
              {(pet?.conditions ?? []).length === 0 ? (
                <Text style={styles.noneRecorded}>None recorded</Text>
              ) : (
                <View style={styles.itemList}>
                  {(pet?.conditions ?? []).map((item) => (
                    <Text key={item} style={styles.itemText}>
                      {item}
                    </Text>
                  ))}
                </View>
              )}
              {weight ? (
                <>
                  <View style={styles.groupGap} />
                  <GroupLabel>Current weight</GroupLabel>
                  <Text style={styles.itemText}>
                    {formatWeight(weight.kg)}
                    {updatedLabel ? ` · Updated ${updatedLabel}` : ''}
                  </Text>
                </>
              ) : null}
            </View>
          </Card>
        )}
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  listCard: { overflow: 'hidden' },
  cardPadding: { padding: spacing.s16 },
  editCard: { gap: spacing.s12 },
  buttonRow: { flexDirection: 'row', gap: spacing.s12, marginTop: spacing.s4 },
  flex: { flex: 1 },
  listEditor: { gap: spacing.s8 },
  chipList: { gap: spacing.s4 },
  chipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
    paddingHorizontal: spacing.s12,
    paddingRight: spacing.s4,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceSoft,
  },
  chipItemLabel: { ...typography.bodySm, color: colors.text, flex: 1 },
  chipRemove: { width: 36, height: 36 },
  itemList: { gap: spacing.s4 },
  itemText: { ...typography.body, color: colors.text },
  noneRecorded: { ...typography.bodySm, color: colors.textTertiary },
  groupGap: { height: spacing.s16 },
});
