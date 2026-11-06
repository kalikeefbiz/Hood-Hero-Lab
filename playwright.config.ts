import { defineConfig, devices } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PORT || "4173";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: 0,
  // Actions happen in the city: the player walks to the place first, so a
  // gameplay test needs more than the 30 s default.
  timeout: 90_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL:
      process.env.PLAYWRIGHT_PUBLIC_URL ||
      `http://127.0.0.1:${port}${process.env.PLAYWRIGHT_BASE_PATH || "/"}`,
    trace: "retain-on-failure",
    proxy:
      process.env.PLAYWRIGHT_PUBLIC_URL && process.env.HTTPS_PROXY
        ? { server: process.env.HTTPS_PROXY }
        : undefined,
  },
  projects: [
    {
      name: "chromium-mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    {
      name: "webkit-mobile",
      use: {
        ...devices["iPhone 13"],
        ...(process.env.WEBKIT_SOFTWARE_SCALE
          ? { deviceScaleFactor: Number(process.env.WEBKIT_SOFTWARE_SCALE) }
          : {}),
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_PUBLIC_URL
    ? undefined
    : {
        env: {
          VITE_BASE_PATH:
            process.env.PLAYWRIGHT_BASE_PATH ||
            process.env.VITE_BASE_PATH ||
            "/",
        },
        command: `npm run preview -- --port ${port}`,
        url: `http://127.0.0.1:${port}${process.env.PLAYWRIGHT_BASE_PATH || "/"}`,
        reuseExistingServer: !process.env.CI,
      },
});
