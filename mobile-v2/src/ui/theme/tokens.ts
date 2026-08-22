import { Platform } from 'react-native';

const cardShadow = Platform.select({
  ios: { shadowColor: '#78716C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10 },
  android: { elevation: 2 },
  default: { boxShadow: '0 3px 10px rgba(28,25,23,0.07)' },
}) ?? {};
const floatingShadow = Platform.select({
  ios: { shadowColor: '#78716C', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 18 },
  android: { elevation: 8 },
  default: { boxShadow: '0 8px 22px rgba(28,25,23,0.12)' },
}) ?? {};

export const lightTheme = {
  colors: {
    background: '#FAFAF9', surface: '#FFFFFF', surfaceRaised: '#F5F5F4', border: '#E7E5E4', text: '#292524', textMuted: '#78716C', textSubtle: '#A8A29E', brand: '#F97316', brandStrong: '#C2410C', brandSoft: '#FFEDD5', iconSurface: '#FFF7ED', accent: '#A78BFA', accentStrong: '#7C3AED', accentSurface: '#F5F3FF', sun: '#F59E0B', lavender: '#7C3AED', lavenderSurface: '#EDE9FE', success: '#16A34A', warning: '#D97706', danger: '#DC2626', inverseSurface: '#1C1917', inverseText: '#FFFFFF', overlay: 'rgba(28,25,23,0.42)', onBrand: '#FFFFFF', onDanger: '#FFFFFF',
    focusRing: '#FDBA74', onBrandMuted: 'rgba(255,255,255,0.78)', onBrandSoft: 'rgba(255,255,255,0.88)', onBrandLine: 'rgba(255,255,255,0.32)', onBrandOrb: 'rgba(255,255,255,0.20)', onBrandOrbStrong: 'rgba(255,255,255,0.26)', skeletonStrong: 'rgba(255,255,255,0.66)', skeletonMuted: 'rgba(255,255,255,0.48)', glassLight: 'rgba(255,255,255,0.90)', glassDark: 'rgba(28,25,23,0.82)', ringFill: 'rgba(255,255,255,0.42)',
  },
  // FloatingTabBar sits above the scroll content. Keep enough tail room for
  // the final action to clear the bar on short iPhone and web viewports.
  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40, page: 20, section: 24, bottomClearance: 192 },
  radius: { sm: 6, md: 10, lg: 14, xl: 20, sheet: 24, pill: 999 },
  typography: { display: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const }, title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const }, heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const }, body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const }, label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const }, caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const } },
  motion: { pressOpacity: 0.72, disabledOpacity: 0.45, fast: 150, normal: 250 },
  layout: { contentMax: 720, compactContentMax: 640, touchTarget: 44, hairline: 1 },
  shadow: { card: cardShadow, floating: floatingShadow },
  touchTarget: 44,
} as const;

export type AppTheme = Omit<typeof lightTheme, 'colors'> & { colors: Record<keyof typeof lightTheme.colors, string> };
