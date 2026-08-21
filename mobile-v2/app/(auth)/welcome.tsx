import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AppText, Button, Screen } from '../../src/ui/components';
import { useTheme } from '../../src/core/providers/theme-provider';
import { ArrowRightIcon, HeartIcon, PawPrintIcon, ShieldCheckIcon, UsersThreeIcon } from '../../src/ui/icons';

const promises = [{ icon: PawPrintIcon, title: 'Know what matters today', body: 'Simple care moments for every Pet you look after.' }, { icon: UsersThreeIcon, title: 'Share without losing control', body: 'Invite the right people and keep every Pet relationship clear.' }, { icon: ShieldCheckIcon, title: 'Keep their story close', body: 'Health notes, routines and little memories in one living record.' }];

export default function WelcomeRoute() {
  const { theme } = useTheme();
  return <Screen scroll contentContainerStyle={styles.content}><View style={styles.brandRow}><View style={[styles.logo, { backgroundColor: theme.colors.brandSoft }]}><HeartIcon size={22} color={theme.colors.brandStrong} weight="fill" /></View><AppText variant="heading" style={{ letterSpacing: 1 }}>PLANET</AppText></View><View style={styles.intro}><AppText variant="display">Care feels lighter{`\n`}when it is shared.</AppText><AppText muted style={styles.lede}>A calm, living home for the Pets you love—and the people who help you care for them.</AppText></View><LinearGradient colors={[theme.colors.brandStrong, theme.colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}><View style={[styles.heroOrbLarge, { borderColor: theme.colors.onBrandOrb }]} /><View style={[styles.heroOrbSmall, { borderColor: theme.colors.onBrandOrbStrong }]} /><View style={[styles.heroPet, { backgroundColor: theme.colors.surface }]}><PawPrintIcon size={28} color={theme.colors.accentStrong} weight="duotone" /></View><AppText variant="caption" style={{ color: theme.colors.onBrandMuted }}>A SMALL PLACE FOR BIG LOVE</AppText><AppText variant="title" style={{ color: theme.colors.onBrand, maxWidth: 250 }}>Everything they need. Nothing you do not.</AppText><AppText style={{ color: theme.colors.onBrandSoft }}>Start with one Pet. Build a care rhythm that fits your real life.</AppText></LinearGradient><Button label="Enter PLANET" onPress={() => router.push('/(auth)/onboarding')} icon={<ArrowRightIcon size={18} color={theme.colors.onBrand} weight="bold" />} /><View style={styles.promiseList}>{promises.map(({ icon: Icon, title, body }) => <View key={title} style={styles.promise}><View style={[styles.promiseIcon, { backgroundColor: theme.colors.surface }]}><Icon size={20} color={theme.colors.brandStrong} weight="duotone" /></View><View style={styles.promiseCopy}><AppText variant="label">{title}</AppText><AppText variant="caption" muted>{body}</AppText></View></View>)}</View><Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/onboarding')} style={styles.existing}><AppText variant="caption" muted>Already have a PLANET?</AppText><AppText variant="label" style={{ color: theme.colors.brandStrong }}>Sign in</AppText></Pressable></Screen>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 620, alignSelf: 'center', width: '100%', paddingBottom: 48, gap: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  logo: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  intro: { gap: 10, marginTop: 12 },
  lede: { fontSize: 17, lineHeight: 25, maxWidth: 470 },
  hero: { minHeight: 252, borderRadius: 27, padding: 22, justifyContent: 'flex-end', gap: 9, overflow: 'hidden' },
  heroOrbLarge: { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 1, right: -72, top: -34 },
  heroOrbSmall: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 1, right: 18, top: 22 },
  heroPet: { position: 'absolute', width: 68, height: 68, borderRadius: 34, right: 58, top: 59, alignItems: 'center', justifyContent: 'center' },
  promiseList: { gap: 5 },
  promise: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  promiseIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  promiseCopy: { flex: 1, gap: 2 },
  existing: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 44 },
});
