/**
 * Welcome — email + code authentication (spec §13, contract F1).
 * Two steps in one state machine: email → 6-digit code (auto-verify on last digit,
 * 60s resend countdown, dev_code hint in dev mode). After verify: consume a pending
 * invite (deep-link handoff) if any, then route by GET /me → tabs or create-pet.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { Field, PrimaryButton } from '../src/components/ui';
import { useToast } from '../src/components/toast';
import { ApiError, get, post, setToken } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { qk, type Me } from '../src/lib/queries';
import { colors, radius, spacing, touchTarget, typography } from '../src/theme';

/* ------------------------------ Constants -------------------------------- */

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Shared with app/invite/[code].tsx — deep-link invite parked until auth completes. */
const PENDING_INVITE_KEY = 'planet_pending_invite';

interface RequestCodeResponse {
  ok?: boolean;
  expires_in?: number;
  dev_code?: string;
}

interface VerifyResponse {
  token: string;
  user: { id: string; email: string; display_name: string };
}

async function getPendingInvite(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

async function clearPendingInvite(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_INVITE_KEY);
  } catch {
    // already gone — nothing to do
  }
}

/** Prefer the server's semantic sentence (spec §64); fall back to a specific one. */
function errText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'Network unavailable — check your connection.';
    if (err.message && !err.message.startsWith('Request failed')) return err.message;
  }
  return fallback;
}

/* ------------------------------- Wordmark -------------------------------- */

/** Orbit mark — ring + planet, self-drawn (token colors only). */
function OrbitMark({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" accessibilityLabel="PLANET logo">
      <Ellipse
        cx={48}
        cy={48}
        rx={44}
        ry={17}
        fill="none"
        stroke={colors.brand500}
        strokeWidth={2.5}
        transform="rotate(-24 48 48)"
      />
      <Circle cx={48} cy={48} r={17} fill={colors.text} />
      <Circle cx={7.9} cy={59.5} r={4} fill={colors.brand300} />
    </Svg>
  );
}

/* ------------------------------- Screen ---------------------------------- */

type Step = 'email' | 'code';

export default function WelcomeScreen() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const routing = useRef(false);

  useEffect(() => {
    if (step !== 'code' || resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, resendIn]);

  const requestCode = useCallback(async () => {
    const next = email.trim().toLowerCase();
    if (!EMAIL_RE.test(next)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setSending(true);
    setEmailError(null);
    try {
      const res = await post<RequestCodeResponse>('/auth/request-code', { email: next });
      setEmail(next);
      setDevCode(typeof res.dev_code === 'string' ? res.dev_code : null);
      setCode('');
      setCodeError(null);
      setResendIn(RESEND_SECONDS);
      setStep('code');
    } catch (err) {
      setEmailError(errText(err, "Couldn't send the code. Try again."));
    } finally {
      setSending(false);
    }
  }, [email]);

  const resend = useCallback(async () => {
    if (resending || resendIn > 0) return;
    setResending(true);
    setCodeError(null);
    try {
      const res = await post<RequestCodeResponse>('/auth/request-code', { email });
      setDevCode(typeof res.dev_code === 'string' ? res.dev_code : null);
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setCodeError(errText(err, "Couldn't resend the code."));
    } finally {
      setResending(false);
    }
  }, [email, resendIn, resending]);

  /** Post-verify routing: pending invite → join; then /me decides tabs vs create-pet. */
  const routeAfterAuth = useCallback(async () => {
    const pending = await getPendingInvite();
    if (pending) {
      try {
        await post('/circles/join', { invite_code: pending });
      } catch {
        toast({ message: 'That invite is no longer valid.' });
      }
      await clearPendingInvite();
    }
    let hasCircle = false;
    try {
      await queryClient.fetchQuery({
        queryKey: qk.me,
        queryFn: () => get<Me>('/me'),
      });
      hasCircle = (queryClient.getQueryData<Me>(qk.me)?.circles.length ?? 0) > 0;
    } catch {
      // Tabs will re-fetch /me; don't block sign-in on a transient failure.
    }
    router.replace(hasCircle ? '/(tabs)' : '/create-pet');
  }, [toast]);

  const verify = useCallback(
    async (digits: string) => {
      setVerifying(true);
      setCodeError(null);
      try {
        const res = await post<VerifyResponse>('/auth/verify', { email, code: digits });
        await setToken(res.token);
        if (routing.current) return;
        routing.current = true;
        await routeAfterAuth();
      } catch (err) {
        setCodeError(errText(err, "That code didn't work. Try again."));
        setVerifying(false);
      }
    },
    [email, routeAfterAuth],
  );

  const handleCodeChange = useCallback(
    (raw: string) => {
      if (verifying) return;
      const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
      setCode(digits);
      setCodeError(null);
      if (digits.length === CODE_LENGTH) void verify(digits);
    },
    [verify, verifying],
  );

  const backToEmail = useCallback(() => {
    setStep('email');
    setCode('');
    setCodeError(null);
    setDevCode(null);
    setResendIn(RESEND_SECONDS);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <OrbitMark />
          <Text style={styles.wordmark}>PLANET</Text>
          <Text style={styles.tagline}>
            Their whole world.{'\n'}One place.
          </Text>
        </View>

        {step === 'email' ? (
          <View style={styles.form}>
            <Field
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              error={emailError}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              onSubmitEditing={requestCode}
            />
            <PrimaryButton
              label="Continue"
              onPress={requestCode}
              loading={sending}
              style={styles.cta}
            />
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.codeIntro}>We sent a code to</Text>
            <Text style={styles.codeEmail}>{email}</Text>

            <View style={styles.codeRow}>
              {Array.from({ length: CODE_LENGTH }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.codeCell,
                    i === code.length && !codeError && styles.codeCellActive,
                    codeError ? styles.codeCellError : null,
                  ]}
                >
                  <Text style={styles.codeDigit}>{code[i] ?? ''}</Text>
                </View>
              ))}
              <TextInput
                value={code}
                onChangeText={handleCodeChange}
                maxLength={CODE_LENGTH}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoFocus
                caretHidden
                editable={!verifying}
                accessibilityLabel="Verification code"
                style={styles.codeInput}
              />
            </View>

            {codeError ? <Text style={styles.codeErrorText}>{codeError}</Text> : null}
            {!codeError && verifying ? (
              <Text style={styles.codeHint}>Checking…</Text>
            ) : null}
            {devCode && !verifying ? (
              <Text style={styles.devCode}>Dev code: {devCode}</Text>
            ) : null}

            <View style={styles.resendRow}>
              {resendIn > 0 ? (
                <Text style={styles.resendWait}>Resend in {resendIn}s</Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={resend}
                  disabled={resending}
                  hitSlop={spacing.s8}
                >
                  {({ pressed }) => (
                    <Text style={[styles.resendLink, (pressed || resending) && styles.linkDim]}>
                      {resending ? 'Resending…' : 'Resend code'}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={backToEmail}
              hitSlop={spacing.s8}
              style={styles.changeEmail}
            >
              {({ pressed }) => (
                <Text style={[styles.resendLink, pressed && styles.linkDim]}>
                  Use a different email
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* -------------------------------- Styles ---------------------------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s32,
    gap: spacing.s40,
  },
  hero: { alignItems: 'center', gap: spacing.s12 },
  wordmark: { ...typography.hero, color: colors.text },
  tagline: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  form: { gap: spacing.s16 },
  cta: { marginTop: spacing.s4 },
  codeIntro: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  codeEmail: {
    ...typography.card,
    color: colors.text,
    textAlign: 'center',
  },
  codeRow: {
    flexDirection: 'row',
    gap: spacing.s8,
    marginTop: spacing.s8,
  },
  codeCell: {
    flex: 1,
    height: touchTarget + 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
  },
  codeCellActive: { borderColor: colors.brand500, borderWidth: 2 },
  codeCellError: { borderColor: colors.symptom },
  codeDigit: { ...typography.page, color: colors.text },
  codeInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  codeErrorText: {
    ...typography.caption,
    color: colors.symptom,
    textAlign: 'center',
  },
  codeHint: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  devCode: {
    ...typography.micro,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  resendRow: { minHeight: touchTarget, justifyContent: 'center', alignItems: 'center' },
  resendWait: { ...typography.caption, color: colors.textSecondary },
  resendLink: {
    ...typography.caption,
    color: colors.brand700,
    fontWeight: '600',
    textAlign: 'center',
  },
  linkDim: { opacity: 0.5 },
  changeEmail: { minHeight: touchTarget, justifyContent: 'center', alignItems: 'center' },
});
