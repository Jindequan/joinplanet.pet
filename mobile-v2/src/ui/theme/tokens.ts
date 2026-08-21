import { Platform } from 'react-native';

const cardShadow = Platform.select({
  ios: { shadowColor: '#9A6B4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14 },
  android: { elevation: 2 },
  default: { boxShadow: '0 4px 14px rgba(24,35,30,0.06)' },
}) ?? {};
const floatingShadow = Platform.select({
  ios: { shadowColor: '#9A6B4F', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 24 },
  android: { elevation: 8 },
  default: { boxShadow: '0 8px 24px rgba(24,35,30,0.12)' },
}) ?? {};

export const lightTheme = {
  colors: {
    background: '#F7F4EE', surface: '#FFFEFA', surfaceRaised: '#EEEAE1', border: '#E3DED2', text: '#20302E', textMuted: '#71807A', textSubtle: '#99A39D', brand: '#4A8178', brandStrong: '#245E57', brandSoft: '#DDEBE4', iconSurface: '#E5F0EB', accent: '#D98B61', accentStrong: '#B86843', accentSurface: '#F6E2D4', sun: '#D8AC59', lavender: '#7C789B', lavenderSurface: '#E9E7F1', success: '#398066', warning: '#A66B24', danger: '#B34B45', inverseSurface: '#20302E', inverseText: '#FFFFFF', overlay: 'rgba(32,48,46,0.42)', onBrand: '#FFFFFF', onDanger: '#FFFFFF',
    focusRing: '#9CCBC0', onBrandMuted: 'rgba(255,255,255,0.72)', onBrandSoft: 'rgba(255,255,255,0.82)', onBrandLine: 'rgba(255,255,255,0.32)', onBrandOrb: 'rgba(255,255,255,0.20)', onBrandOrbStrong: 'rgba(255,255,255,0.22)', skeletonStrong: 'rgba(255,255,255,0.66)', skeletonMuted: 'rgba(255,255,255,0.48)', glassLight: 'rgba(255,255,255,0.78)', glassDark: 'rgba(15,23,42,0.76)',
  },
  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40, page: 20, section: 24, bottomClearance: 140 },
  radius: { sm: 10, md: 14, lg: 18, xl: 26, sheet: 28, pill: 999 },
  typography: { display: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const }, title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const }, heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const }, body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const }, label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const }, caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const } },
  motion: { pressOpacity: 0.72, disabledOpacity: 0.45, fast: 150, normal: 250 },
  layout: { contentMax: 720, compactContentMax: 640, touchTarget: 44, hairline: 1 },
  shadow: { card: cardShadow, floating: floatingShadow },
  touchTarget: 44,
} as const;

export type AppTheme = Omit<typeof lightTheme, 'colors'> & { colors: Record<keyof typeof lightTheme.colors, string> };
