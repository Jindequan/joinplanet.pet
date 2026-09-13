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
    soft: '#7c877f',
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
    body: { fontSize: 15, lineHeight: 22, fontWeight: '500' as const },
    label: { fontSize: 14, lineHeight: 19, fontWeight: '700' as const },
    caption: { fontSize: 12.5, lineHeight: 17, fontWeight: '600' as const },
    eyebrow: { fontSize: 11.5, lineHeight: 15, fontWeight: '800' as const, letterSpacing: 1.2 },
  } satisfies Record<string, TextStyle>,
  motion: {
    pressOpacity: 0.78,
    disabledOpacity: 0.5,
    fast: 140,
    normal: 220,
    /** Vertical offset for enter transitions (px). */
    enterOffset: 8,
    /** Delay between staggered list items (ms). */
    stagger: 40,
    /** Spring for progress / emphasis (damping/stiffness). */
    spring: { damping: 18, stiffness: 180 },
  },
  // Keep desktop workspaces readable without imposing a second column on
  // mobile. This is the outer page frame; modal sheets keep using contentMax.
  layout: { contentMax: 640, pageMax: 1120, touchTarget: 44 },
  shadow: { card: cardShadow, floating: floatingShadow },
  touchTarget: 44,
} as const;

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
