/* eslint-disable no-undef */

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';
const publicWebBaseUrl = process.env.EXPO_PUBLIC_PUBLIC_WEB_BASE_URL?.trim() ?? '';
const previewEnabled = process.env.EXPO_PUBLIC_ENABLE_PREVIEW?.trim() === 'true';

let apiUrl;
try {
  apiUrl = new URL(apiBaseUrl);
} catch {
  console.error('web-production-env: EXPO_PUBLIC_API_BASE_URL must be a valid https URL ending in /api/v1');
  process.exit(1);
}

const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(apiUrl.hostname);
if (
  apiUrl.protocol !== 'https:' ||
  isLoopback ||
  apiUrl.pathname.replace(/\/+$/, '') !== '/api/v1' ||
  apiUrl.search ||
  apiUrl.hash
) {
  console.error('web-production-env: EXPO_PUBLIC_API_BASE_URL must be an https URL ending in /api/v1, without query or hash');
  process.exit(1);
}

if (publicWebBaseUrl) {
  let publicWebUrl;
  try {
    publicWebUrl = new URL(publicWebBaseUrl);
  } catch {
    console.error('web-production-env: EXPO_PUBLIC_PUBLIC_WEB_BASE_URL must be a valid https URL');
    process.exit(1);
  }
  if (publicWebUrl.protocol !== 'https:' || publicWebUrl.search || publicWebUrl.hash) {
    console.error('web-production-env: EXPO_PUBLIC_PUBLIC_WEB_BASE_URL must be an https URL without query or hash');
    process.exit(1);
  }
}

if (previewEnabled) {
  console.error('web-production-env: EXPO_PUBLIC_ENABLE_PREVIEW=true is forbidden in production');
  process.exit(1);
}

console.log(
  `web-production-env: passed (API ${apiBaseUrl || 'built-in production default'}, web ${publicWebBaseUrl || 'built-in production default'})`,
);
