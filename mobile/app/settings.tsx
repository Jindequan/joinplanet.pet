/**
 * Account settings — read-only email, display name edit (PATCH /me), sign
 * out, and the account-level Danger Zone: DELETE /me (contract F8). A 409
 * from DELETE /me ("transfer ownership or delete the pet first") surfaces
 * the backend's own message via toast (spec §64: short and specific).
 */
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LogOut, Trash2 } from 'lucide-react-native';
import { Card, Field, ListRow, PrimaryButton, SectionHeader } from '../src/components/ui';
import { useToast } from '../src/components/toast';
import { Chevron, DisplayRow, PageShell } from '../src/components/pet/parts';
import { clearToken, del, patch } from '../src/lib/api';
import { qk, useMe } from '../src/lib/queries';
import { colors, radius, spacing, typography, withAlpha } from '../src/theme';

export default function AccountSettingsScreen() {
  const { data, isLoading } = useMe();
  const client = useQueryClient();
  const { toast } = useToast();

  const email = data?.user.email;
  const serverName = data?.user.display_name ?? '';
  /** null = following the server value; typing switches to a local draft. */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const displayName = nameDraft ?? serverName;
  const trimmed = displayName.trim();
  const canSave = !isLoading && !saving && trimmed.length > 0 && trimmed !== serverName;

  /** PATCH /me {display_name} → toast + invalidate the /me cache. */
  const saveName = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await patch('/me', { display_name: trimmed });
      setNameDraft(null);
      void client.invalidateQueries({ queryKey: qk.me });
      toast({ message: 'Display name updated' });
    } catch (err) {
      toast({
        message: err instanceof Error && err.name === 'ApiError' ? err.message : 'Could not save',
      });
    } finally {
      setSaving(false);
    }
  };

  /** Same flow as the header menu: drop token, wipe every cache, /welcome. */
  const signOut = async () => {
    await clearToken();
    client.clear();
    router.replace('/welcome');
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and everything you recorded. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => void deleteAccount() },
      ],
    );
  };

  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await del('/me'); // server also invalidates the session
      await clearToken();
      client.clear();
      router.replace('/welcome');
    } catch (err) {
      // 409 — e.g. "transfer ownership or delete the pet first": show it as-is.
      toast({ message: err instanceof Error ? err.message : 'Could not delete account' });
      setDeleting(false);
    }
  };

  return (
    <PageShell title="Account">
      <View>
        <SectionHeader title="Your account" />
        <Card style={styles.accountCard}>
          <DisplayRow label="Email" value={email} divider />
          <Field
            label="Display name"
            placeholder="Your name"
            value={displayName}
            onChangeText={setNameDraft}
            returnKeyType="done"
            onSubmitEditing={() => void saveName()}
            editable={!saving && !isLoading}
          />
          <PrimaryButton
            label="Save"
            loading={saving}
            disabled={!canSave}
            onPress={() => void saveName()}
          />
        </Card>
      </View>

      <View>
        <SectionHeader title="Session" />
        <Card padding={0} style={styles.rowsCard}>
          <ListRow
            title="Sign out"
            subtitle="End your session on this device"
            icon={LogOut}
            trailing={<Chevron />}
            onPress={() => void signOut()}
          />
        </Card>
      </View>

      {/* Danger Zone — red only appears here (spec §51) */}
      <View>
        <SectionHeader title="Danger zone" />
        <Card style={styles.dangerCard}>
          <Text style={styles.dangerText}>
            Deleting your account is permanent. If you are the only owner of a pet, transfer
            ownership or delete the pet first.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            accessibilityState={{ disabled: deleting, busy: deleting }}
            disabled={deleting}
            onPress={confirmDeleteAccount}
            style={({ pressed }) => [
              styles.dangerButton,
              pressed && { opacity: 0.7 },
              deleting && { opacity: 0.4 },
            ]}
          >
            <Trash2 size={typography.body.fontSize} color={colors.symptom} />
            <Text style={styles.dangerButtonLabel}>
              {deleting ? 'Deleting…' : 'Delete account'}
            </Text>
          </Pressable>
        </Card>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  accountCard: { gap: spacing.s12 },
  rowsCard: { overflow: 'hidden' },
  dangerCard: { gap: spacing.s12, borderColor: withAlpha(colors.symptom, 0.5) },
  dangerText: { ...typography.bodySm, color: colors.textSecondary },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s8,
    minHeight: 48,
    paddingHorizontal: spacing.s20,
    paddingVertical: spacing.s12,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.symptom,
    backgroundColor: withAlpha(colors.symptom, 0.06),
  },
  dangerButtonLabel: { ...typography.card, color: colors.symptom, fontWeight: '600' },
});
