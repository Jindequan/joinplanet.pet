import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretDownIcon, CheckCircleIcon, DogIcon, PawPrintIcon, UsersThreeIcon } from '../icons';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from './app-text';

export type ViewFilter =
  | { kind: 'all' }
  | { kind: 'family'; familyId: string }
  | { kind: 'pet'; petId: string };

export type ViewFilterFamily = { id: string; name: string };
export type ViewFilterPet = { id: string; name: string; species?: string };

type PetFilterSelectorProps = {
  value: ViewFilter;
  families: ViewFilterFamily[];
  pets: ViewFilterPet[];
  onChange: (value: ViewFilter) => void;
  disabled?: boolean;
};

function sameFilter(left: ViewFilter, right: ViewFilter) {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'all' && right.kind === 'all') return true;
  if (left.kind === 'family' && right.kind === 'family') return left.familyId === right.familyId;
  if (left.kind === 'pet' && right.kind === 'pet') return left.petId === right.petId;
  return false;
}

export function PetFilterSelector({ value, families, pets, onChange, disabled = false }: PetFilterSelectorProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const currentLabel = useMemo(() => {
    if (value.kind === 'all') return 'All Pets';
    if (value.kind === 'family') return families.find((family) => family.id === value.familyId)?.name ?? 'Family';
    return pets.find((pet) => pet.id === value.petId)?.name ?? 'Pet';
  }, [families, pets, value]);

  function select(next: ViewFilter) {
    onChange(next);
    setOpen(false);
  }

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Filter view: ${currentLabel}`}
      accessibilityState={{ disabled, expanded: open }}
      disabled={disabled}
      onPress={() => setOpen(true)}
      style={({ pressed }) => [styles.trigger, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, pressed && { opacity: theme.motion.pressOpacity }, disabled && { opacity: theme.motion.disabledOpacity }]}
    >
      <PawPrintIcon size={17} color={theme.colors.brandStrong} weight="duotone" />
      <AppText variant="label" numberOfLines={1} style={styles.triggerLabel}>{currentLabel}</AppText>
      <CaretDownIcon size={16} color={theme.colors.textMuted} weight="bold" />
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close view filter" style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet, paddingHorizontal: theme.spacing.page, paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}>
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          <View style={styles.sheetHeader}>
            <View style={styles.titleCopy}>
              <AppText variant="heading">View</AppText>
              <AppText variant="caption" muted>Choose what you want to see</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close view filter" onPress={() => setOpen(false)} style={styles.closeButton}>
              <AppText variant="label" style={{ color: theme.colors.brandStrong }}>Done</AppText>
            </Pressable>
          </View>

          <View style={styles.options}>
            <FilterOption icon={<PawPrintIcon size={20} color={theme.colors.brandStrong} weight="duotone" />} label="All Pets" detail="Everything you can access" selected={sameFilter(value, { kind: 'all' })} onPress={() => select({ kind: 'all' })} />

            {families.length > 0 ? <AppText variant="caption" muted style={styles.sectionLabel}>FAMILIES</AppText> : null}
            {families.map((family) => <FilterOption key={family.id} icon={<UsersThreeIcon size={20} color={theme.colors.accent} weight="duotone" />} label={family.name} detail="Everyone and every Pet in this Family" selected={sameFilter(value, { kind: 'family', familyId: family.id })} onPress={() => select({ kind: 'family', familyId: family.id })} />)}

            {pets.length > 0 ? <AppText variant="caption" muted style={styles.sectionLabel}>PETS</AppText> : null}
            {pets.map((pet) => <FilterOption key={pet.id} icon={<DogIcon size={20} color={theme.colors.lavender} weight="duotone" />} label={pet.name} detail={pet.species ? `${pet.species} · personal view` : 'Personal view'} selected={sameFilter(value, { kind: 'pet', petId: pet.id })} onPress={() => select({ kind: 'pet', petId: pet.id })} />)}
          </View>
        </View>
      </View>
    </Modal>
  </>;
}

function FilterOption({ icon, label, detail, selected, onPress }: { icon: React.ReactNode; label: string; detail: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.option, { borderColor: selected ? theme.colors.brand : theme.colors.border, backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface }, pressed && { opacity: 0.72 }]}>
    <View style={[styles.optionIcon, { backgroundColor: selected ? theme.colors.surface : theme.colors.surfaceRaised }]}>{icon}</View>
    <View style={styles.optionCopy}><AppText variant="label">{label}</AppText><AppText variant="caption" muted numberOfLines={1}>{detail}</AppText></View>
    {selected ? <CheckCircleIcon size={21} color={theme.colors.brandStrong} weight="fill" /> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: 42, maxWidth: 190, paddingHorizontal: 13, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  triggerLabel: { flexShrink: 1 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(40,52,58,0.42)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, gap: 18 },
  handle: { width: 38, height: 4, borderRadius: 4, alignSelf: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleCopy: { gap: 2 },
  closeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  options: { gap: 8 },
  sectionLabel: { marginTop: 10, marginLeft: 4 },
  option: { minHeight: 64, borderWidth: 1, borderRadius: 17, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  optionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1, gap: 2 },
});
