import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Planet, Sparkle, UsersThree } from 'phosphor-react-native';
import { z } from 'zod';
import { planetApi } from '../../core/api/planet-api';
import { errorMessage, isApiError } from '../../core/api/errors';
import { useSession } from '../../core/providers/session-provider';
import { useTheme } from '../../core/providers/theme-provider';
import { clearAuthEmail, readAuthEmail, writeAuthEmail } from '../../core/storage/auth-email';
import { AppText } from '../../ui/components/app-text';
import { Button } from '../../ui/components/button';
import { LoadingState } from '../../ui/components/loading-state';
import { Screen } from '../../ui/components/screen';
import { TextField } from '../../ui/components/text-field';
import { FadeInView } from '../../ui/motion';

export function AuthScreen() {
  const { theme } = useTheme();
  const { status, signIn } = useSession();
  const { invite: inviteParam } = useLocalSearchParams<{ invite?: string | string[] }>();
  const inviteCode = (Array.isArray(inviteParam) ? inviteParam[0] : inviteParam ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
  const inviteHref = /^[A-Z0-9]{10}$/.test(inviteCode)
    ? `/families/join?code=${encodeURIComponent(inviteCode)}`
    : null;
  const { height: viewportHeight } = useWindowDimensions();
  const compact = viewportHeight < 700;
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const attemptedCode = useRef('');
  const verifyRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    void readAuthEmail().then((saved) => {
      if (saved) {
        setEmail(saved);
        setStep('code');
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setInterval(() => setRetryAfter((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [retryAfter]);

  useEffect(() => {
    verifyRef.current = verify;
  });

  useEffect(() => {
    if (step !== 'code' || code.length !== 6 || busy || retryAfter > 0) return;
    if (attemptedCode.current === code) return;
    attemptedCode.current = code;
    void verifyRef.current();
  }, [busy, code, retryAfter, step]);

  if (status === 'authenticated') return <Redirect href={inviteHref ?? '/(tabs)'} />;
  if (!ready || status === 'loading') {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']} contentStyle={styles.content}>
        <LoadingState label="正在准备登录" />
      </Screen>
    );
  }

  async function requestCode() {
    setError('');
    const parsed = z.string().trim().email().safeParse(email);
    if (!parsed.success) {
      setError('请输入有效的邮箱地址。');
      return;
    }
    setBusy(true);
    try {
      const result = await planetApi.auth.requestCode(parsed.data.toLowerCase());
      const nextEmail = parsed.data.toLowerCase();
      setEmail(nextEmail);
      await writeAuthEmail(nextEmail);
      const nextDevCode = result.dev_code ?? '';
      setDevCode(nextDevCode);
      setCode(nextDevCode);
      setStep('code');
    } catch (e) {
      setError(authErrorMessage(e));
      if (isApiError(e) && e.status === 429) setRetryAfter(e.retryAfterSeconds ?? 60);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== 6) {
      setError('请输入 6 位验证码。');
      return;
    }
    setBusy(true);
    try {
      const result = await planetApi.auth.verifyCode(
        email,
        code,
        Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
      );
      await signIn(result.token, result.user.id);
      await clearAuthEmail();
      router.replace(inviteHref ?? '/');
    } catch (e) {
      setError(authErrorMessage(e));
      if (isApiError(e) && e.status === 429) setRetryAfter(e.retryAfterSeconds ?? 60);
    } finally {
      setBusy(false);
    }
  }

  function authErrorMessage(error: unknown) {
    if (isApiError(error) && error.status === 404) {
      return '登录服务暂时不可用，请稍后重试。';
    }
    return errorMessage(error);
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoiding}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        edges={['top', 'left', 'right', 'bottom']}
        contentStyle={[styles.content, compact && styles.compactContent]}
      >
      <FadeInView style={[styles.page, compact && styles.compactPage]}>
        <View style={styles.brandRow}>
          <View style={[styles.brandMark, { backgroundColor: theme.colors.coralSoft }]}>
            <Planet size={19} color={theme.colors.coralDark} weight="duotone" />
          </View>
          <View style={styles.brandCopy}>
            <AppText variant="eyebrow" color={theme.colors.forest}>PLANET</AppText>
            <AppText variant="caption" soft>家庭宠物照护</AppText>
          </View>
        </View>

        <LinearGradient
          colors={[theme.colors.forest, theme.colors.brandStrong]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, compact && styles.compactHero]}
        >
          <View style={[styles.heroGlow, { backgroundColor: `${theme.colors.mintStrong}55` }]} />
          <View style={styles.heroTopline}>
            <AppText variant="eyebrow" color={theme.colors.onBrandMuted}>
              今天的照护
            </AppText>
            <Sparkle size={18} color={theme.colors.onBrandMuted} weight="fill" />
          </View>
          <AppText
            variant="title"
            color={theme.colors.onBrand}
            style={[styles.heroTitle, compact && styles.compactHeroTitle]}
          >
            {step === 'email' ? '登录后，\n直接看今天要做什么。' : '验证码已发到邮箱。'}
          </AppText>
          <AppText
            color={theme.colors.onBrandMuted}
            style={[styles.heroSubtitle, compact && styles.compactHeroSubtitle]}
          >
            {step === 'email'
              ? '宠物、负责人和完成记录都会显示在同一份清单里。'
              : `我们已把验证码发送到 ${email}。`}
          </AppText>
          <View style={[styles.heroFooter, compact && styles.compactHeroFooter]}>
            <View style={styles.heroPeople}>
              <UsersThree size={17} color={theme.colors.onBrand} weight="bold" />
            </View>
            <AppText variant="caption" color={theme.colors.onBrandMuted}>
              完成后会留下记录
            </AppText>
          </View>
        </LinearGradient>

        <View style={[styles.formCard, { backgroundColor: theme.colors.paperStrong, borderColor: theme.colors.line }]}>
          <View style={styles.formHeader}>
            <View style={styles.formHeadingCopy}>
              <AppText variant="heading" accessibilityRole="header">
                {step === 'email' ? '登录 PLANET' : '确认是你本人'}
              </AppText>
              <AppText variant="caption" muted>
                {step === 'email' ? '用邮箱登录，不需要记密码。' : '输入 6 位验证码即可继续。'}
              </AppText>
            </View>
            <View style={[styles.stepPill, { backgroundColor: theme.colors.sageSoft }]}>
              <AppText variant="caption" color={theme.colors.forest2}>{step === 'email' ? '01' : '02'}</AppText>
            </View>
          </View>

          <TextField
            label={step === 'email' ? '邮箱地址' : '验证码'}
            value={step === 'email' ? email : code}
            onChangeText={(value) =>
              step === 'email' ? setEmail(value) : setCode(value.replace(/\D/g, '').slice(0, 6))
            }
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={step === 'email' ? 'email-address' : 'number-pad'}
            textContentType={step === 'email' ? 'emailAddress' : 'oneTimeCode'}
            maxLength={step === 'email' ? 254 : 6}
            // On a small phone, opening the keyboard immediately hides the
            // primary action. Let the user choose when to focus instead.
            autoFocus={!compact}
            wrapperStyle={styles.field}
          />

          {devCode && __DEV__ ? (
            <View style={[styles.devCode, { backgroundColor: theme.colors.sageSoft }]}>
              <AppText variant="caption">
                开发码：<AppText variant="label">{devCode}</AppText>（已自动填入）
              </AppText>
            </View>
          ) : null}

          {error ? (
            <AppText accessibilityRole="alert" color={theme.colors.danger} variant="caption">
              {error}
            </AppText>
          ) : null}

          <Button
            full
            label={
              retryAfter > 0
                ? `${retryAfter}s 后重试`
                : step === 'email'
                  ? '继续'
                  : '验证并登录'
            }
            busy={busy || retryAfter > 0}
            onPress={() => void (step === 'email' ? requestCode() : verify())}
            style={styles.primaryButton}
          />

          {step === 'code' ? (
            <View style={styles.secondary}>
              <Button
                variant="ghost"
                label={retryAfter > 0 ? `${retryAfter}s 后可重发` : '重新发验证码'}
                disabled={busy || retryAfter > 0}
                onPress={() => {
                  setCode('');
                  attemptedCode.current = '';
                  void requestCode();
                }}
                style={{ flex: 1 }}
              />
              <Button
                variant="ghost"
                label="换个邮箱"
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setDevCode('');
                  setError('');
                  void clearAuthEmail();
                }}
                style={{ flex: 1 }}
              />
            </View>
          ) : null}
        </View>

        {!compact ? (
          <View style={styles.noteRow}>
            <ArrowRight size={15} color={theme.colors.coral} weight="bold" />
            <AppText soft variant="caption">不用来回问，打开就知道下一项。</AppText>
          </View>
        ) : null}
      </FadeInView>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: { flex: 1 },
  content: { paddingTop: 22, paddingBottom: 42 },
  compactContent: { paddingTop: 12, paddingBottom: 18 },
  page: { gap: 18 },
  compactPage: { gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  brandCopy: { gap: 1 },
  hero: { minHeight: 230, borderRadius: 26, padding: 22, overflow: 'hidden', justifyContent: 'space-between' },
  compactHero: { minHeight: 170, padding: 18, borderRadius: 22 },
  heroGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, right: -70, top: -65 },
  heroTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTitle: { marginTop: 28, maxWidth: 270 },
  compactHeroTitle: { marginTop: 10 },
  heroSubtitle: { maxWidth: 285, marginTop: 7 },
  compactHeroSubtitle: { marginTop: 4 },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28 },
  compactHeroFooter: { marginTop: 12 },
  heroPeople: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  formCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 18, gap: 16 },
  formHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  formHeadingCopy: { flex: 1, gap: 3 },
  stepPill: { minWidth: 36, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 8 },
  primaryButton: { borderRadius: 15 },
  devCode: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  secondary: { flexDirection: 'row', gap: 10 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 3 },
});
