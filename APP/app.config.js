/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const baseConfig = require('./app.json');

/**
 * EAS project ownership is environment-specific and must not be committed as
 * a guessed UUID. CI/release environments provide it explicitly; local
 * development keeps the rest of app.json unchanged.
 */
module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  const resolved = config ?? baseConfig.expo;

  return {
    ...resolved,
    ...(projectId
      ? {
          extra: {
            ...(resolved.extra ?? {}),
            eas: {
              ...(resolved.extra?.eas ?? {}),
              projectId,
            },
          },
        }
      : {}),
  };
};
