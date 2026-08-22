import React, { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ArrowRightIcon, CheckCircleIcon, LockKeyIcon, SparkleIcon } from '../src/ui/icons';
import { AppText, Button, Card, Screen, TextField } from '../src/ui/components';
import { useTheme } from '../src/core/providers/theme-provider';
import { planetApi } from '../src/core/api/planet-api';
import { ApiError } from '../src/core/network/api-client';
import { useSession } from '../src/core/providers/session-provider';
import { codeSchema, emailSchema } from '../src/core/forms';

const items = [{ icon: SparkleIcon, title: 'A clear day', body: 'See the care moments that deserve your attention.' }, { icon: CheckCircleIcon, title: 'A shared rhythm', body: 'Let the right people help without losing the thread.' }, { icon: LockKeyIcon, title: 'A private record', body: 'Keep their health story close and in your control.' }];

export default function SignInRoute() {
  const { theme } = useTheme();
  const { signIn } = useSession();
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
      await signIn(result.token); router.replace('/(tabs)');
    } catch (err) { setError(authErrorMessage(err, 'Unable to sign in.')); }
    finally { verifyingRef.current = false; setVerifying(false); }
  }

  const sendCodeLabel = sent ? (resendSeconds > 0 ? `Send a new code · ${resendSeconds}s` : 'Send a new code') : (resendSeconds > 0 ? `Try again in ${resendSeconds}s` : 'Send sign-in code');
  const loading = requesting || verifying;
  return <Screen scroll contentContainerStyle={styles.content}><AppText variant="caption" muted>PLANET / SIGN IN</AppText><AppText variant="display">Come back to your orbit.</AppText><AppText muted>Use your email to receive a secure sign-in code. No password to remember.</AppText><Card style={styles.form}><TextField label="Email" value={email} onChangeText={(value) => { setEmail(value); if (sent) { setSent(false); setCode(''); setHint(''); setResendSeconds(0); } setError(''); }} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" editable={!loading} /><Button label={sendCodeLabel} onPress={() => void requestCode()} loading={requesting} disabled={loading || !email.trim() || resendSeconds > 0} icon={<ArrowRightIcon size={18} color={theme.colors.onBrand} weight="bold" />} />{sent ? <><TextField label="Six-digit code" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="123456" hint={hint} editable={!loading} /><Button label="Enter PLANET" onPress={() => void verifyCode()} loading={verifying} disabled={loading || code.trim().length !== 6} variant="secondary" /></> : null}{error ? <AppText style={{ color: theme.colors.danger }}>{error}</AppText> : null}</Card><AppText variant="caption" muted>Private by default. Shared only with the people you choose.</AppText>{items.map(({ icon: Icon, title, body }) => <Card key={title} style={styles.card}><View style={[styles.itemIcon, { backgroundColor: theme.colors.brandSoft }]}><Icon size={22} color={theme.colors.brandStrong} weight="duotone" /></View><View style={styles.itemCopy}><AppText variant="heading">{title}</AppText><AppText muted>{body}</AppText></View></Card>)}</Screen>;
}

const styles = StyleSheet.create({ content: { maxWidth: 640, alignSelf: 'center', width: '100%', gap: 16 }, form: { gap: 14, marginTop: 6 }, card: { flexDirection: 'row', alignItems: 'center', gap: 12 }, itemIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, itemCopy: { flex: 1, gap: 3 } });
