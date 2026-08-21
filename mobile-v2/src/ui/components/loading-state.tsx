import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useTheme } from "../../core/providers/theme-provider";
import { AppText } from "./app-text";

export function LoadingState({ label = "Loading your care space" }: { label?: string }) {
  const { theme } = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.wrap}>
      <View style={styles.heading}>
        <View style={[styles.eyebrow, { backgroundColor: theme.colors.surfaceRaised }]} />
        <View style={[styles.title, { backgroundColor: theme.colors.surfaceRaised }]} />
        <View style={[styles.subtitle, { backgroundColor: theme.colors.surfaceRaised }]} />
      </View>
      <View style={[styles.hero, { backgroundColor: theme.colors.brandSoft }]}>
        <View style={[styles.heroIcon, { backgroundColor: theme.colors.surface }]} />
        <View style={styles.heroCopy}><View style={[styles.heroLine, { backgroundColor: "rgba(255,255,255,0.66)" }]} /><View style={[styles.heroLineShort, { backgroundColor: "rgba(255,255,255,0.48)" }]} /></View>
      </View>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[styles.cardIcon, { backgroundColor: theme.colors.surfaceRaised }]} /><View style={styles.cardCopy}><View style={[styles.cardLine, { backgroundColor: theme.colors.surfaceRaised }]} /><View style={[styles.cardLineShort, { backgroundColor: theme.colors.surfaceRaised }]} /></View></View>
      <View style={styles.status}><ActivityIndicator size="small" color={theme.colors.brandStrong} /><AppText variant="caption" muted>{label}</AppText></View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", maxWidth: 680, alignSelf: "center", gap: 16, paddingVertical: 20 },
  heading: { gap: 9 },
  eyebrow: { width: 92, height: 10, borderRadius: 5 },
  title: { width: "68%", height: 29, borderRadius: 9 },
  subtitle: { width: "84%", height: 14, borderRadius: 7 },
  hero: { minHeight: 144, borderRadius: 24, padding: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  heroIcon: { width: 68, height: 68, borderRadius: 23 },
  heroCopy: { flex: 1, gap: 10 },
  heroLine: { width: "70%", height: 18, borderRadius: 7 },
  heroLineShort: { width: "48%", height: 12, borderRadius: 6 },
  card: { minHeight: 76, borderRadius: 18, borderWidth: 1, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: { width: 42, height: 42, borderRadius: 14 },
  cardCopy: { flex: 1, gap: 8 },
  cardLine: { width: "58%", height: 13, borderRadius: 6 },
  cardLineShort: { width: "38%", height: 10, borderRadius: 5 },
  status: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 3 },
});
