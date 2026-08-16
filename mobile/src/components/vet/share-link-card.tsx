/**
 * Success state for a created private link (spec §53–§60): the URL in large
 * selectable text, expiry, and Share / Copy actions. Shown after creating a
 * vet summary link (/prepare-vet) or a Care Card link (/share-care).
 */
import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Copy, Share2 } from 'lucide-react-native';
import { colors, spacing, typography } from '../../theme';
import { Card, SecondaryButton } from '../ui';
import { useToast } from '../toast';
import { copyLink, formatExpiry } from './share-api';

export function ShareLinkCard({ url, expiresAt }: { url: string; expiresAt: string }) {
  const { toast } = useToast();

  const share = () => {
    // Dismissal is not an error worth surfacing.
    Share.share({ url }).catch(() => undefined);
  };

  const copy = async () => {
    // Native has no clipboard module in Phase 1 deps — the share sheet
    // offers Copy on both platforms, and the URL above is selectable.
    if (await copyLink(url)) {
      toast({ message: 'Link copied' });
      return;
    }
    share();
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>Private link</Text>
      <Text style={styles.url} selectable>
        {url}
      </Text>
      <Text style={styles.expires}>Expires {formatExpiry(expiresAt)}</Text>
      <View style={styles.actions}>
        <SecondaryButton label="Share" icon={Share2} onPress={share} style={styles.action} />
        <SecondaryButton label="Copy" icon={Copy} onPress={() => void copy()} style={styles.action} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.s8 },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  url: { ...typography.section, color: colors.brand700, fontWeight: '600' },
  expires: { ...typography.caption, color: colors.textTertiary },
  actions: { flexDirection: 'row', gap: spacing.s12, alignSelf: 'stretch', marginTop: spacing.s4 },
  action: { flex: 1 },
});
