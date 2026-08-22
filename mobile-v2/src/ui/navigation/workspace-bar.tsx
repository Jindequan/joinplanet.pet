import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from '../components/app-text';
import { CaretRightIcon, PlanetIcon, UserCircleIcon } from '../icons';

type WorkspaceBarProps = {
  familyName?: string;
  petName?: string;
  onPressWorkspace?: () => void;
};

/**
 * The persistent app-level orientation cue.
 *
 * A Family/Pet selection is a presentation filter, but the user still needs
 * to know which shared care space the current screen belongs to. Keeping that
 * cue in one small native component prevents every page from inventing its
 * own header language.
 */
export function WorkspaceBar({ familyName, petName, onPressWorkspace }: WorkspaceBarProps) {
  const { theme } = useTheme();
  const workspaceLabel = familyName || 'All Families';
  const detailLabel = petName || 'All Pets';
  const content = (
    <>
      <View style={[styles.mark, { backgroundColor: theme.colors.brandSoft }]}>
        <PlanetIcon size={19} color={theme.colors.brandStrong} weight="duotone" />
      </View>
      <View style={styles.copy}>
        <AppText variant="caption" muted>PLANET · FAMILY CARE</AppText>
        <AppText variant="label" numberOfLines={1}>{workspaceLabel}</AppText>
        <AppText variant="caption" muted numberOfLines={1}>{detailLabel}</AppText>
      </View>
      {onPressWorkspace ? <CaretRightIcon size={18} color={theme.colors.textSubtle} weight="bold" /> : null}
    </>
  );
  return (
    <View style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {onPressWorkspace ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${workspaceLabel}`}
          onPress={onPressWorkspace}
          style={({ pressed }) => [styles.workspace, pressed && { opacity: theme.motion.pressOpacity }]}
        >
          {content}
        </Pressable>
      ) : <View style={styles.workspace}>{content}</View>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open your account"
        onPress={() => router.push('/more')}
        style={({ pressed }) => [styles.account, { backgroundColor: theme.colors.surfaceRaised }, pressed && { opacity: theme.motion.pressOpacity }]}
      >
        <UserCircleIcon size={20} color={theme.colors.brandStrong} weight="duotone" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 68, borderWidth: 1, borderRadius: 21, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  workspace: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 1 },
  account: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
