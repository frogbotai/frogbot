import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '..', '..');
const blankPort = 3111;
const livePreviewPort = 3114;

export default defineConfig({
  testDir: dirname,
  testMatch: '*.browser.spec.ts',
  outputDir: path.join(dirname, 'test-results'),
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list', { printSteps: true }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'blank',
      testMatch: 'navShell.browser.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${blankPort}`,
        channel: 'chromium',
      },
    },
    {
      name: 'live-preview',
      testMatch: 'livePreview.browser.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${livePreviewPort}`,
        channel: 'chromium',
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter blank dev',
      cwd: repoRoot,
      url: `http://localhost:${blankPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        PORT: String(blankPort),
        DATABASE_URL: 'file:./frogbot.browser.db',
        FROGBOT_SECRET: 'browser-test-secret',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
    {
      command: 'pnpm --filter frogbot-browser-live-preview dev',
      cwd: repoRoot,
      url: `http://localhost:${livePreviewPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        PORT: String(livePreviewPort),
        DATABASE_URL: 'file:./frogbot.browser.db',
        FROGBOT_SECRET: 'browser-test-secret',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
