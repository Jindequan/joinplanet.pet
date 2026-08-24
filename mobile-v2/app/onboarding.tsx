import React, { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ArrowRightIcon, LockKeyIcon } from '../src/ui/icons';
import { AppText, Button, Card, Screen, TextField } from '../src/ui/components';
import { useTheme } from '../src/core/providers/theme-provider';
import { planetApi } from '../src/core/api/planet-api';
import { ApiError } from '../src/core/network/api-client';
import { useSession } from '../src/core/providers/session-provider';
import { codeSchema, emailSchema } from '../src/core/forms';

export default function SignInRoute() {
  const { theme } = useTheme();
  const { signIn } = useSession();
  const params = useLocalSearchParams<{ inviteCode?: string }>();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const requestingRef = useRef(false);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = setInterval(() => setResendSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  function authErrorMessage(errorValue: unknown, fallback: string) {
    if (errorValue instanceof ApiError) {
      if (errorValue.status === 401) return 'That code is invalid or expired. Send a new code and try again.';
      if (errorValue.status === 429) return 'Too many attempts. Wait a moment, then request a new code.';
      return errorValue.message;
    }
    return fallback;
  }

  async function requestCode() {
    if (requestingRef.current || verifyingRef.current) return;
    requestingRef.current = true;
    setRequesting(true); setError(''); setCode(''); setHint('');
    const parsed = emailSchema.safeParse({ email });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Enter a valid email.'); requestingRef.current = false; setRequesting(false); return; }
    try {
      const result = await planetApi.auth.requestCode(parsed.data.email);
      setSent(true); setResendSeconds(60);
      if (result.dev_code) { setCode(result.dev_code); setHint(`Development code: ${result.dev_code} · valid for 10 minutes`); }
      else setHint('Check your inbox for the six-digit code.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) { setResendSeconds(30); setError('Too many attempts. Try again when the countdown ends.'); }
      else setError(authErrorMessage(err, 'Unable to send a code.'));
    } finally { requestingRef.current = false; setRequesting(false); }
  }

  async function verifyCode() {
    if (requestingRef.current || verifyingRef.current) return;
    verifyingRef.current = true; setVerifying(true); setError('');
    const parsed = codeSchema.safeParse({ email, code });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Enter a valid code.'); verifyingRef.current = false; setVerifying(false); return; }
    try {
      const result = await planetApi.auth.verifyCode(parsed.data.email, parsed.data.code, 'planet-mobile');
      await signIn(result.token);
      const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : undefined;
      router.replace(inviteCode ? { pathname: '/(tabs)/family', params: { mode: 'join', code: inviteCode } } : '/(tabs)');
    } catch (err) { setError(authErrorMessage(err, 'Unable to sign in.')); }
    finally { verifyingRef.current = false; setVerifying(false); }
  }

  const sendCodeLabel = sent ? (resendSeconds > 0 ? `Send a new code · ${resendSeconds}s` : 'Send a new code') : (resendSeconds > 0 ? `Try again in ${resendSeconds}s` : 'Send sign-in code');
  const loading = requesting || verifying;
  return <Screen scroll contentContainerStyle={styles.content}><View style={styles.intro}><AppText variant="caption" muted>PLANET / SIGN IN</AppText><AppText variant="display">Welcome to your care space.</AppText><AppText muted>We’ll email you a secure six-digit code. No password to remember.</AppText></View><Card style={styles.form}><TextField label="Email" value={email} onChangeText={(value) => { setEmail(value); if (sent) { setSent(false); setCode(''); setHint(''); setResendSeconds(0); } setError(''); }} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" editable={!loading} /><Button label={sendCodeLabel} onPress={() => void requestCode()} loading={requesting} disabled={loading || !email.trim() || resendSeconds > 0} icon={<ArrowRightIcon size={18} color={theme.colors.onBrand} weight="bold" />} />{sent ? <><TextField label="Six-digit code" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="123456" hint={hint} editable={!loading} /><Button label="Enter PLANET" onPress={() => void verifyCode()} loading={verifying} disabled={loading || code.trim().length !== 6} variant="secondary" /></> : null}{error ? <AppText style={{ color: theme.colors.danger }}>{error}</AppText> : null}</Card><View style={[styles.privacy, { backgroundColor: theme.colors.brandSoft }]}><View style={[styles.privacyIcon, { backgroundColor: theme.colors.surface }]}><LockKeyIcon size={19} color={theme.colors.brandStrong} weight="duotone" /></View><View style={styles.privacyCopy}><AppText variant="label">Private by default</AppText><AppText variant="caption" muted>Shared only with the people you choose.</AppText></View></View></Screen>;
}

const styles = StyleSheet.create({ content: { maxWidth: 560, alignSelf: 'center', width: '100%', gap: 22, paddingTop: 34 }, intro: { gap: 10 }, form: { gap: 14, padding: 18 }, privacy: { minHeight: 72, borderRadius: 20, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }, privacyIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, privacyCopy: { flex: 1, gap: 2 } });
