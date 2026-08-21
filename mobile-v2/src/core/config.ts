import Constants from 'expo-constants';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const publicWebBaseUrl = process.env.EXPO_PUBLIC_PUBLIC_WEB_BASE_URL?.trim();

function runtimeApiBaseUrl() {
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0]?.trim();
  if (host && host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    return `http://${host}:8081/api/v1`;
  }
  return __DEV__ ? 'http://127.0.0.1:8081/api/v1' : 'https://api.joinplanet.pet/api/v1';
}

export const appConfig = {
  apiBaseUrl: apiBaseUrl || runtimeApiBaseUrl(),
  publicWebBaseUrl: publicWebBaseUrl || 'https://www.joinplanet.pet',
  enablePreview: process.env.EXPO_PUBLIC_ENABLE_PREVIEW === 'true',
  requestTimeoutMs: 15_000,
} as const;

if (__DEV__ && !apiBaseUrl) {
  console.info(`[PLANET] EXPO_PUBLIC_API_BASE_URL is not set; using ${appConfig.apiBaseUrl}.`);
}
