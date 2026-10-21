import { defineConfig, devices } from '@playwright/test';

// Runs against the production build (npm run build first), served by `vite preview`.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    // PW_CHROMIUM lets a machine with a preinstalled Chromium skip `playwright install`
    launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 800, height: 500 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 732, height: 330 } } },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
