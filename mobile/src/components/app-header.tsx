/**
 * AppHeader — the persistent shell header (spec §11): "[PetPhoto] Milo" on
 * the left (display-only in Phase 1; the switcher arrives with multi-pet) and
 * a ••• overflow on the right opening the shell menu (Tell Devin / Privacy /
 * Terms / Sign out). No notification bell — nothing to notify yet (§11).
 * Rendered above the tabs navigator, so it applies the top safe-area inset
 * itself; the shell below must not pad it again.
 */
import React, { useRef } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FileText,
  LogOut,
  Mail,
  MoreHorizontal,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { clearToken } from '../lib/api';
import { haptics } from '../lib/haptics';
import { useActivePet } from '../lib/queries';
import { colors, radius, spacing, touchTarget, typography } from '../theme';
import { PetPhoto } from './pet-photo';
import { useToast } from './toast';
import { IconButton, Skeleton } from './ui';

const SUPPORT_EMAIL = 'support@joinplanet.pet';
const PRIVACY_URL = 'https://www.joinplanet.pet/privacy';
const TERMS_URL = 'https://www.joinplanet.pet/terms';

interface MenuRowProps {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  /** Destructive action — symptom red label (spec §51: red is reserved). */
  destructive?: boolean;
}

function MenuRow({ icon: Icon, label, onPress, destructive }: MenuRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.surfaceSoft }]}
    >
      <Icon size={20} color={destructive ? colors.symptom : colors.brand700} />
      <Text style={[styles.menuRowLabel, destructive && styles.menuRowLabelDestructive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AppHeader() {
  const { pet, isLoading } = useActivePet();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const { toast } = useToast();
  const menuRef = useRef<BottomSheetModal>(null);

  const openMenu = () => {
    haptics.light();
    menuRef.current?.present();
  };

  /** mailto/https entries open in the system handler (spec §11 menu). */
  const openExternal = (url: string) => {
    menuRef.current?.close();
    Linking.openURL(url).catch(() => toast({ message: "Couldn't open the link" }));
  };

  /** Sign out: drop the token, wipe every cached query, return to /welcome. */
  const signOut = async () => {
    menuRef.current?.close();
    await clearToken();
    client.clear();
    router.replace('/welcome');
  };

  const petName = pet?.name;

  return (
    <>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.row}>
          <View style={styles.identity}>
            {isLoading || !petName ? (
              <>
                <Skeleton width={28} height={28} round />
                <Skeleton width={72} height={13} />
              </>
            ) : (
              <>
                <PetPhoto avatarKey={pet?.avatar_key} name={petName} size={28} />
                <Text style={styles.petName} numberOfLines={1}>
                  {petName}
                </Text>
              </>
            )}
          </View>
          <IconButton icon={MoreHorizontal} label="More options" onPress={openMenu} />
        </View>
      </View>

      <BottomSheetModal
        ref={menuRef}
        enableDynamicSizing
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <View style={styles.menu}>
          <MenuRow
            icon={Mail}
            label="Tell Devin"
            onPress={() => openExternal(`mailto:${SUPPORT_EMAIL}`)}
          />
          <MenuRow icon={ShieldCheck} label="Privacy" onPress={() => openExternal(PRIVACY_URL)} />
          <MenuRow icon={FileText} label="Terms" onPress={() => openExternal(TERMS_URL)} />
          <View style={styles.menuDivider} />
          <MenuRow icon={LogOut} label="Sign out" destructive onPress={() => void signOut()} />
        </View>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget,
    paddingLeft: spacing.s16,
    paddingRight: spacing.s8,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
    marginRight: spacing.s8,
  },
  petName: { ...typography.caption, color: colors.text, fontWeight: '600' },
  menu: { paddingHorizontal: spacing.s8, paddingBottom: spacing.s24 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    minHeight: touchTarget + 4,
    paddingHorizontal: spacing.s12,
    borderRadius: radius.card,
  },
  menuRowLabel: { ...typography.bodySm, color: colors.text },
  menuRowLabelDestructive: { color: colors.symptom, fontWeight: '600' },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.s12,
    marginVertical: spacing.s8,
  },
  sheetBackground: { backgroundColor: colors.surface, borderRadius: radius.cardLg },
  sheetHandle: { backgroundColor: colors.border },
});
