/**
 * Create pet — minimal onboarding (spec §15): name → species chips → photo →
 * POST /circles → avatar upload (multipart POST /pets/{id}/attachments with no
 * event binding; the storage key is extracted from the attachment url since the
 * response carries none — contract F5) → PATCH /pets/{id} {avatar_key} →
 * "Meet {name}." → tabs. A failed photo upload never blocks circle creation
 * (toast, then continue). An "Have an invite code? Join instead" link hands
 * off to /join.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera, Image as ImageIcon, PawPrint } from 'lucide-react-native';
import { Chip, Field, PrimaryButton, SecondaryButton } from '../src/components/ui';
import { useToast } from '../src/components/toast';
import { ApiError, AuthError, patch, post, upload } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { qk } from '../src/lib/queries';
import { colors, radius, spacing, typography } from '../src/theme';

type Species = 'dog' | 'cat' | 'other';
type Step = 'name' | 'species' | 'photo' | 'done';

const SPECIES: { value: Species; label: string }[] = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'other', label: 'Other' },
];

const PHOTO_SIZE = 160;

function errText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'Network unavailable — check your connection.';
    if (err.message && !err.message.startsWith('Request failed')) return err.message;
  }
  return fallback;
}

/** Compress before upload (spec §39): max side 1600, JPEG quality 0.8. */
async function compressPhoto(uri: string, width: number, height: number): Promise<string> {
  const actions =
    Math.max(width, height) > 1600
      ? [{ resize: width >= height ? { width: 1600 } : { height: 1600 } }]
      : [];
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

/**
 * Attachment responses carry no storage_key (contract F5) — the key is the
 * last path segment of the returned `/…/api/v1/files/{key}` url.
 */
function attachmentKeyFromUrl(url: string): string | null {
  const last = url.split('?')[0].split('#')[0].split('/').filter(Boolean).pop();
  return last ? last : null;
}

/** Upload the pet avatar (no event binding) and point the pet at it via avatar_key. */
async function uploadAvatar(petId: string, uri: string): Promise<void> {
  const form = new FormData();
  form.append('file', { uri, name: 'avatar.jpg', type: 'image/jpeg' } as unknown as Blob);
  const res = await upload<{ attachment: { url: string } }>(`/pets/${petId}/attachments`, form);
  const key = attachmentKeyFromUrl(res.attachment.url);
  if (!key) throw new ApiError(0, 'Attachment response is missing the file key');
  await patch(`/pets/${petId}`, { avatar_key: key });
}

export default function CreatePetScreen() {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<Species | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { toast } = useToast();

  const petName = name.trim();

  const pickPhoto = useCallback(async (source: 'camera' | 'library') => {
    setPhotoError(null);
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Allow photo access in Settings to add a photo.');
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 1, // compression happens once, in the manipulator step below
          });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    try {
      setPhotoUri(await compressPhoto(asset.uri, asset.width, asset.height));
    } catch {
      setPhotoUri(asset.uri); // still try the original — the server caps size anyway
    }
  }, []);

  const createCircle = useCallback(async () => {
    if (submitting) return;
    if (!petName) {
      setStep('name');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await post<{ pet: { id: string | number } }>('/circles', {
        pet_name: petName,
        species: species ?? 'other',
        breed: '',
      });
      const petId = String(res.pet.id);
      if (photoUri) {
        // The photo is polish, not a gate (spec §15) — a failed upload must
        // never block the circle: toast and continue to "Meet {name}."
        try {
          await uploadAvatar(petId, photoUri);
        } catch {
          toast({ message: "Photo couldn't be uploaded." });
        }
      }
      await queryClient.invalidateQueries({ queryKey: qk.me });
      setStep('done');
    } catch (err) {
      if (err instanceof AuthError) {
        router.replace('/welcome');
        return;
      }
      setSubmitError(errText(err, `Couldn't create ${petName}'s home. Try again.`));
    } finally {
      setSubmitting(false);
    }
  }, [petName, photoUri, species, submitting, toast]);

  const goJoin = useCallback(() => router.push('/join'), []);

  if (step === 'done') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.doneWrap}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.donePhoto} contentFit="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <PawPrint size={typography.page.fontSize * 2} color={colors.brand700} />
            </View>
          )}
          <Text style={styles.meet}>Meet {petName}.</Text>
          <PrimaryButton
            label="Start caring"
            onPress={() => router.replace('/(tabs)')}
            style={styles.cta}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'name' ? (
          <>
            <Text style={styles.prompt}>What's your pet's name?</Text>
            <Field
              label="Name"
              placeholder="Milo"
              value={name}
              onChangeText={setName}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => petName && setStep('species')}
            />
            <PrimaryButton
              label="Continue"
              onPress={() => setStep('species')}
              disabled={!petName}
              style={styles.cta}
            />
            <Pressable
              accessibilityRole="button"
              onPress={goJoin}
              hitSlop={spacing.s8}
              style={styles.altLink}
            >
              {({ pressed }) => (
                <Text style={[styles.altLinkText, pressed && styles.linkDim]}>
                  Have an invite code? Join instead
                </Text>
              )}
            </Pressable>
          </>
        ) : null}

        {step === 'species' ? (
          <>
            <Text style={styles.prompt}>What kind of pet is {petName}?</Text>
            <View style={styles.chipRow}>
              {SPECIES.map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  selected={species === s.value}
                  onPress={() => {
                    setSpecies(s.value);
                    setStep('photo');
                  }}
                />
              ))}
            </View>
            <BackLink onPress={() => setStep('name')} />
          </>
        ) : null}

        {step === 'photo' ? (
          <>
            <Text style={styles.prompt}>Add a photo</Text>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} contentFit="cover" />
            ) : (
              <View style={[styles.photoPreview, styles.photoPlaceholder]}>
                <PawPrint size={typography.page.fontSize * 2} color={colors.brand700} />
              </View>
            )}
            <View style={styles.pickRow}>
              <SecondaryButton
                label="Camera"
                icon={Camera}
                onPress={() => pickPhoto('camera')}
                style={styles.pickButton}
              />
              <SecondaryButton
                label="Library"
                icon={ImageIcon}
                onPress={() => pickPhoto('library')}
                style={styles.pickButton}
              />
            </View>
            {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}
            {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
            <PrimaryButton
              label="Continue"
              onPress={createCircle}
              loading={submitting}
              style={styles.cta}
            />
            <Pressable
              accessibilityRole="button"
              onPress={createCircle}
              disabled={submitting}
              hitSlop={spacing.s8}
              style={styles.altLink}
            >
              {({ pressed }) => (
                <Text style={[styles.altLinkText, (pressed || submitting) && styles.linkDim]}>
                  Skip
                </Text>
              )}
            </Pressable>
            <BackLink onPress={() => setStep('species')} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={spacing.s8}
      style={styles.altLink}
    >
      {({ pressed }) => (
        <Text style={[styles.backLinkText, pressed && styles.linkDim]}>Back</Text>
      )}
    </Pressable>
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
    gap: spacing.s16,
  },
  prompt: { ...typography.page, color: colors.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s8 },
  photoPreview: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radius.chip,
    alignSelf: 'center',
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand100,
    borderWidth: 0,
  },
  pickRow: { flexDirection: 'row', gap: spacing.s8 },
  pickButton: { flex: 1 },
  errorText: {
    ...typography.caption,
    color: colors.symptom,
    textAlign: 'center',
  },
  cta: { marginTop: spacing.s4 },
  altLink: { minHeight: spacing.s40, justifyContent: 'center', alignItems: 'center' },
  altLinkText: {
    ...typography.caption,
    color: colors.brand700,
    fontWeight: '600',
    textAlign: 'center',
  },
  backLinkText: { ...typography.caption, color: colors.textSecondary },
  linkDim: { opacity: 0.5 },
  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s16,
    gap: spacing.s24,
  },
  donePhoto: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  meet: { ...typography.hero, color: colors.text, textAlign: 'center' },
});
