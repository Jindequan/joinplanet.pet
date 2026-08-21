import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { PawPrintIcon, UsersThreeIcon } from '../icons';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from './app-text';
import { PetFilterSelector, type ViewFilter, type ViewFilterFamily, type ViewFilterPet } from './pet-filter-selector';

export function OrbitContextBar({ value, families, pets, onChange }: { value: ViewFilter; families: ViewFilterFamily[]; pets: ViewFilterPet[]; onChange: (value: ViewFilter) => void }) {
  const { theme } = useTheme();
  const currentLabel = useMemo(() => {
    if (value.kind === 'family') return families.find((family) => family.id === value.familyId)?.name ?? 'Family';
    if (value.kind === 'pet') return pets.find((pet) => pet.id === value.petId)?.name ?? 'Pet';
    return `${pets.length} ${pets.length === 1 ? 'Pet' : 'Pets'}`;
  }, [families, pets, value]);
  const Icon = value.kind === 'pet' ? PawPrintIcon : UsersThreeIcon;
  return <View style={[styles.bar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <View style={[styles.icon, { backgroundColor: value.kind === 'pet' ? theme.colors.accentSurface : theme.colors.brandSoft }]}><Icon size={19} color={value.kind === 'pet' ? theme.colors.accentStrong : theme.colors.brandStrong} weight="duotone" /></View>
    <View style={styles.copy}><AppText variant="caption" muted>CARE SPACE</AppText><AppText variant="label" numberOfLines={1}>{currentLabel}</AppText></View>
    <PetFilterSelector value={value} families={families} pets={pets} onChange={onChange} />
  </View>;
}

const styles = StyleSheet.create({
  bar: { minHeight: 64, borderWidth: 1, borderRadius: 20, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
});
