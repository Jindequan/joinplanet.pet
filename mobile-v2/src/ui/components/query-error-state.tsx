import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../core/providers/theme-provider";
import { Button } from "./button";
import { AppText } from "./app-text";

export function QueryErrorState({
  title = "Something did not load",
  body = "We could not reach PLANET right now. Your saved data is safe.",
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.mark, { backgroundColor: theme.colors.accentSurface }]}>
        <AppText variant="title" style={{ color: theme.colors.accentStrong }}>!</AppText>
      </View>
      <AppText variant="heading">{title}</AppText>
      <AppText muted style={styles.body}>{body}</AppText>
      <Button label="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  mark: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  body: { textAlign: "center", maxWidth: 320 },
});
