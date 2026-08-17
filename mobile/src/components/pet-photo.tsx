/**
 * PetPhoto — the pet's real photo wherever it matters (spec §3 "宠物是视觉
 * 中心", §84). Falls back to a letter bubble when no avatar has been uploaded.
 * All call sites import this one component; keep the interface stable.
 */
import React from 'react';
import { StyleSheet, Text, View, type ImageStyle, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { API_BASE } from '../lib/api';
import { colors, radius } from '../theme';

export function avatarUrl(avatarKey?: string | null): string | null {
  if (!avatarKey) return null;
  if (/^https?:\/\//i.test(avatarKey)) return avatarKey;
  return `${API_BASE}/files/${avatarKey}`;
}

export function PetPhoto({
  avatarKey,
  name,
  size = 56,
  round = true,
  style,
}: {
  avatarKey?: string | null;
  name: string;
  size?: number;
  round?: boolean;
  style?: ImageStyle | ViewStyle;
}) {
  const uri = avatarUrl(avatarKey);
  const shape = {
    width: size,
    height: size,
    borderRadius: round ? size / 2 : radius.card,
  };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[shape, styles.photo, style as ImageStyle]}
        contentFit="cover"
        transition={150}
        recyclingKey={avatarKey ?? undefined}
      />
    );
  }

  return (
    <View style={[shape, styles.fallback, style]}>
      <Text style={[styles.initial, { fontSize: Math.max(14, size * 0.36) }]}>
        {(name || '?').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: colors.surfaceSoft },
  fallback: {
    backgroundColor: colors.brand100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: colors.brand700,
    fontWeight: '600',
  },
});
