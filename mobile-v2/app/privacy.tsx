import React from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText, Button, Card, PageHeader, Screen } from "../src/ui/components";
import { useTheme } from "../src/core/providers/theme-provider";
import { ExportIcon, LockKeyIcon, ShareNetworkIcon } from "../src/ui/icons";

export default function PrivacyRoute() {
  const { theme } = useTheme();
  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <PageHeader eyebrow="YOU / PRIVACY & DATA" title="Privacy & data" />
      <Card style={[styles.hero, { backgroundColor: theme.colors.brandSoft }]}>
        <View style={[styles.heroIcon, { backgroundColor: theme.colors.surface }]}>
          <LockKeyIcon size={25} color={theme.colors.brandStrong} weight="duotone" />
        </View>
        <AppText variant="title">Your data stays private.</AppText>
        <AppText muted>PLANET keeps your Pet records inside the people and Families you choose. Nothing is public unless you create a temporary share.</AppText>
      </Card>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: theme.colors.accentSurface }]}><ShareNetworkIcon size={21} color={theme.colors.accentStrong} weight="duotone" /></View>
          <View style={styles.copy}><AppText variant="heading">Temporary sharing</AppText><AppText muted>Care cards and health summaries expire automatically and can be revoked from a Pet workspace.</AppText></View>
        </View>
        <Button label="Open Pets" variant="secondary" onPress={() => router.push("/(tabs)/pets")} />
      </Card>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: theme.colors.brandSoft }]}><ExportIcon size={21} color={theme.colors.brandStrong} weight="duotone" /></View>
          <View style={styles.copy}><AppText variant="heading">Your data is portable</AppText><AppText muted>Export a Pet record before making a permanent change. Account deletion asks for an explicit confirmation and never silently deletes another person’s history.</AppText></View>
        </View>
        <Button label="Choose a Pet to export" variant="secondary" onPress={() => router.push({ pathname: "/(tabs)/pets", params: { intent: "export" } })} />
      </Card>
      <Card style={styles.card}>
        <View style={styles.copy}><AppText variant="heading">Account deletion</AppText><AppText muted>Delete your account from Profile. PLANET asks you to confirm your email and blocks deletion while you still own an active Pet.</AppText></View>
        <Button label="Open Profile" variant="secondary" onPress={() => router.push("/account")} />
      </Card>
      <AppText variant="caption" muted style={styles.note}>Sharing is an action you choose. Family membership is separate from a public share link.</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: 680, alignSelf: "center", width: "100%", paddingBottom: 140, gap: 16 },
  hero: { gap: 10, padding: 20 },
  heroIcon: { width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  card: { gap: 14 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 4 },
  note: { textAlign: "center", paddingHorizontal: 12, paddingVertical: 6 },
});
