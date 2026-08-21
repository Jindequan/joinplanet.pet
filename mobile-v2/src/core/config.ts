const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const publicWebBaseUrl = process.env.EXPO_PUBLIC_PUBLIC_WEB_BASE_URL?.trim();

export const appConfig = {
  apiBaseUrl: apiBaseUrl || 'http://127.0.0.1:8081/api/v1',
  publicWebBaseUrl: publicWebBaseUrl || 'https://www.joinplanet.pet',
  enablePreview: process.env.EXPO_PUBLIC_ENABLE_PREVIEW === 'true',
  requestTimeoutMs: 15_000,
} as const;

if (__DEV__ && !apiBaseUrl) {
  console.info('[PLANET] EXPO_PUBLIC_API_BASE_URL is not set; using local API default.');
}
