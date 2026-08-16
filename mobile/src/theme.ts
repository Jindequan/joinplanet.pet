/**
 * PLANET design tokens — single source of truth (UI spec §4 §5 §8 §9 §10 §98).
 * Components must never use raw color/spacing/radius values; import from here.
 */

export const colors = {
  // Base (spec §4.1)
  bg: '#F5F8F9',
  surface: '#FFFFFF',
  surfaceSoft: '#EDF6F9',
  border: '#DFE7EA',
  text: '#152126',
  textSecondary: '#65727A',
  textTertiary: '#99A3A8',
  onDark: '#FFFFFF',

  // Brand Blue (spec §4.2)
  brand100: '#DDF3FB',
  brand300: '#9ADCF3',
  brand500: '#47B9E2',
  brand700: '#147FA8',

  // Semantic (spec §5)
  success: '#57A879',
  warning: '#D89A3A',
  symptom: '#D75E67',
  medication: '#318EB3',
  neutral: '#7E8A90',
  ai: '#796BEA',

  // Tab bar inactive (spec §12)
  inactive: '#7E8A90',
} as const;

export type ColorToken = keyof typeof colors;

/** Append alpha to a token hex — keeps derived colors token-driven (no raw hex in components). */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

/** 4pt spacing scale (spec §8). */
export const spacing = {
  s4: 4,
  s8: 8,
  s12: 12,
  s16: 16,
  s20: 20,
  s24: 24,
  s32: 32,
  s40: 40,
  s48: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Radius scale (spec §9). */
export const radius = {
  hero: 28,
  cardLg: 24,
  card: 18,
  input: 16,
  button: 16,
  chip: 999,
  floating: 26,
} as const;

export type RadiusToken = keyof typeof radius;

/** Shadows (spec §10) — default card is a whisper, floating nav carries weight. */
export const shadows = {
  card: {
    shadowColor: '#152126',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  floating: {
    shadowColor: '#152126',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 8,
  },
} as const;

/** Typography sizes/weights (spec §7). */
export const typography = {
  hero: { fontSize: 32, fontWeight: '600', lineHeight: 40 },
  page: { fontSize: 28, fontWeight: '600', lineHeight: 34 },
  section: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  card: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodySm: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  micro: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
} as const;

export type TypographyToken = keyof typeof typography;

/** Motion durations (spec §77). */
export const motion = {
  tap: 120,
  row: 160,
  card: 200,
  sheet: 300,
  hero: 320,
} as const;

/** Minimum touch target (spec §8). */
export const touchTarget = 44;

export const theme = {
  colors,
  spacing,
  radius,
  shadows,
  typography,
  motion,
  touchTarget,
} as const;
