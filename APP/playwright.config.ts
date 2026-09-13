import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PLANET_APP_E2E_PORT ?? 43918)
const e2eApiBaseUrl = process.env.PLANET_APP_E2E_API_BASE_URL
const e2eApiEnv = e2eApiBaseUrl ? `EXPO_PUBLIC_API_BASE_URL=${JSON.stringify(e2eApiBaseUrl)}` : ''

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'zh-CN',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `${e2eApiEnv} npx expo start --web --port ${port}`.trim(),
    url: `http://127.0.0.1:${port}/auth`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile390',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
})
