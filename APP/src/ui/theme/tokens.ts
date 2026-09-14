import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/** Tokens aligned to frozen mobile-v3 `:root` design language. */
const cardShadow = (Platform.select({
  ios: {
    shadowColor: '#1c251f',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.05,
    shadowRadius: 11,
  },
  android: { elevation: 2 },
  web: { boxShadow: '0px 5px 14px rgba(28, 37, 31, 0.08)' },
  // RN Web maps the shadow props to a real box-shadow. The previous empty
  // fallback keeps the same visual result on platforms without boxShadow.
  default: {
    shadowColor: '#1c251f',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
}) ?? {}) as ViewStyle;

const floatingShadow = (Platform.select({
  ios: {
    shadowColor: '#1c251f',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  android: { elevation: 8 },
  web: { boxShadow: '0px -5px 18px rgba(28, 37, 31, 0.12)' },
  default: {
    shadowColor: '#1c251f',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
}) ?? {}) as ViewStyle;

export const lightTheme = {
  colors: {
    ink: '#252b26',
    muted: '#5c665f',
    // Secondary copy still needs to survive small caption sizes on a warm
    // paper surface. The previous value was decorative-only contrast.
    soft: '#66736a',
    paper: '#fbfaf5',
    paperStrong: '#fffdf9',
    canvas: '#e9e8e1',
    line: 'rgba(44,63,53,0.16)',
    lineStrong: 'rgba(44,63,53,0.28)',
    forest: '#337458',
    forest2: '#1d5a43',
    sage: '#79a98d',
    sageSoft: '#e4f0e8',
    secondary: '#dcece2',
    coral: '#cb654e',
    coralDark: '#a94a38',
    coralSoft: '#f5e3dc',
    mint: '#d5ecdf',
    mintStrong: '#79a98d',
    danger: '#a04435',
    inverseText: '#ffffff',
    onBrand: '#ffffff',
    onBrandMuted: '#f6e6df',
    onBrandSoft: 'rgba(255,255,255,0.16)',
    onBrandLine: 'rgba(255,255,255,0.65)',
    identityFrom: '#39705b',
    identityTo: '#2e5747',
    dangerLine: 'rgba(162,68,53,0.18)',
    focusRing: 'rgba(215,110,87,0.14)',
    // aliases used by existing providers
    background: '#fbfaf5',
    surface: '#fffdf9',
    surfaceRaised: '#fbfaf5',
    border: 'rgba(44,63,53,0.16)',
    text: '#252b26',
    textMuted: '#5c665f',
    textSubtle: '#7c877f',
    brand: '#cb654e',
    brandStrong: '#a94a38',
    brandSoft: '#f5e3dc',
    inverseSurface: '#a94a38',
    overlay: 'rgba(28,37,31,0.46)',
    onDanger: '#ffffff',
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    page: 20,
    section: 20,
    bottomClearance: 112,
  },
  radius: {
    sm: 8,
    md: 11,
    lg: 14,
    xl: 17,
    sheet: 22,
    pill: 999,
  },
  typography: {
    display: { fontSize: 34, lineHeight: 40, fontWeight: '800' as const, letterSpacing: -0.8 },
    title: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
    heading: { fontSize: 18, lineHeight: 25, fontWeight: '700' as const, letterSpacing: -0.15 },
    body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
    label: { fontSize: 14, lineHeight: 19, fontWeight: '700' as const },
    caption: { fontSize: 12.5, lineHeight: 17, fontWeight: '500' as const },
    eyebrow: { fontSize: 11.5, lineHeight: 15, fontWeight: '800' as const, letterSpacing: 1.2 },
  } satisfies Record<string, TextStyle>,
  motion: {
    pressOpacity: 0.78,
    disabledOpacity: 0.5,
    pressIn: 110,
    pressOut: 190,
    fast: 110,
    normal: 240,
    /** Vertical offset for enter transitions (px). */
    enterOffset: 6,
    /** Delay between staggered list items (ms). */
    stagger: 24,
    /** Spring for progress / emphasis (damping/stiffness). */
    spring: { damping: 18, stiffness: 180 },
  },
  // Keep desktop workspaces readable without imposing a second column on
  // mobile. This is the outer page frame; modal sheets keep using contentMax.
  layout: { contentMax: 640, pageMax: 1120, touchTarget: 44 },
  shadow: { card: cardShadow, floating: floatingShadow },
  touchTarget: 44,
} as const;

/** Semantic dark palette. Component code keeps using the same roles, so the
 * night surface is a deliberate theme rather than a global color inversion. */
export const darkTheme = {
  ...lightTheme,
  colors: {
    ...lightTheme.colors,
    ink: '#f2f5ef',
    muted: '#bdc9c1',
    soft: '#9baa9f',
    paper: '#101713',
    paperStrong: '#18231c',
    canvas: '#0b100d',
    line: 'rgba(218,239,226,0.16)',
    lineStrong: 'rgba(218,239,226,0.3)',
    forest: '#8dd2ad',
    forest2: '#2c8f6a',
    sage: '#78bd98',
    sageSoft: '#203b2c',
    secondary: '#274936',
    coral: '#e98970',
    coralDark: '#ef9b82',
    coralSoft: '#4a2c27',
    mint: '#294b39',
    mintStrong: '#91d9b1',
    danger: '#ee907b',
    inverseText: '#101713',
    onBrand: '#ffffff',
    onBrandMuted: '#f7d8cf',
    onBrandSoft: 'rgba(255,255,255,0.18)',
    onBrandLine: 'rgba(255,255,255,0.6)',
    identityFrom: '#2e7659',
    identityTo: '#1b4e3b',
    dangerLine: 'rgba(238,144,123,0.28)',
    focusRing: 'rgba(233,137,112,0.24)',
    background: '#101713',
    surface: '#18231c',
    surfaceRaised: '#101713',
    border: 'rgba(218,239,226,0.16)',
    text: '#f2f5ef',
    textMuted: '#bdc9c1',
    textSubtle: '#9baa9f',
    brand: '#e98970',
    brandStrong: '#ef9b82',
    brandSoft: '#4a2c27',
    inverseSurface: '#ef9b82',
    overlay: 'rgba(0,0,0,0.62)',
    onDanger: '#101713',
  },
  shadow: {
    card: cardShadow,
    floating: floatingShadow,
  },
} as unknown as typeof lightTheme;

export type AppTheme = {
  colors: Record<keyof typeof lightTheme.colors, string>;
  spacing: typeof lightTheme.spacing;
  radius: typeof lightTheme.radius;
  typography: typeof lightTheme.typography;
  motion: typeof lightTheme.motion;
  layout: typeof lightTheme.layout;
  shadow: typeof lightTheme.shadow;
  touchTarget: number;
};
