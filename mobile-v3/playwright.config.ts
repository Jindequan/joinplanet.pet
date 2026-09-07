import { defineConfig, devices } from "@playwright/test";

// Keep E2E isolated from other Vite previews commonly using 4173 in this
// workspace. Override in CI when the runner allocates its own port.
const e2ePort = Number(process.env.PLANET_E2E_PORT ?? 43917);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: "retain-on-failure",
    // UI 语言默认跟随浏览器;e2e 断言中文文案,固定 zh。
    locale: "zh-CN",
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${e2ePort}`,
    url: `http://127.0.0.1:${e2ePort}/auth`,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "mobile390",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "mobile430",
      use: { ...devices["Pixel 5"], viewport: { width: 430, height: 932 } },
    },
    {
      name: "tablet768",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "desktop1280",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
