/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const baseConfig = require('./app.json');

/**
 * EAS project ownership is environment-specific and must not be committed as
 * a guessed UUID. CI/release environments provide it explicitly; local
 * development keeps the rest of app.json unchanged.
 */
module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  // Capture the runtime API endpoint in Expo config. Metro's development
  // client environment module merges .env values after the CLI starts, so a
  // script-provided EXPO_PUBLIC_API_BASE_URL can otherwise be shadowed by a
  // stale local .env file. The app reads this serialized value as its source
  // of truth on Web and native.
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const resolved = config ?? baseConfig.expo;

  return {
    ...resolved,
    ...(projectId || apiBaseUrl
      ? {
          extra: {
            ...(resolved.extra ?? {}),
            ...(apiBaseUrl ? { apiBaseUrl } : {}),
            ...(projectId
              ? {
                  eas: {
                    ...(resolved.extra?.eas ?? {}),
                    projectId,
                  },
                }
              : {}),
          },
        }
      : {}),
  };
};
