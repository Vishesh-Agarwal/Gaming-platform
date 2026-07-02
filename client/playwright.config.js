import { defineConfig } from '@playwright/test';

const clientPort = 5173;
const serverPort = 3001;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  webServer: [
    {
      command: `PORT=${serverPort} npm run start --prefix ../server`,
      url: `http://127.0.0.1:${serverPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `VITE_SERVER_URL=http://127.0.0.1:${serverPort} npm run dev -- --host 127.0.0.1 --port ${clientPort} --strictPort`,
      url: `http://127.0.0.1:${clientPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  use: {
    baseURL: `http://127.0.0.1:${clientPort}`,
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'mobile-portrait',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'mobile-landscape',
      use: {
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
