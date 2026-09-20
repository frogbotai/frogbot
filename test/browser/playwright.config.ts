import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '..', '..');
const richTextFixture = path.join(repoRoot, 'test', 'e2e', 'fixtures', 'rich-text');
const blankPort = 3111;
const customFieldPort = 3112;
const richTextPort = 3113;
const livePreviewPort = 3114;
const selectedProject =
  process.argv.find((argument) => argument.startsWith('--project='))?.split('=')[1] ??
  process.argv[process.argv.indexOf('--project') + 1];

const blankServer = {
  command: 'pnpm --filter blank dev',
  cwd: repoRoot,
  url: `http://localhost:${blankPort}`,
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
  stdout: 'ignore' as const,
  stderr: 'pipe' as const,
  env: {
    PORT: String(blankPort),
    DATABASE_URL: 'file:./frogbot.browser.db',
    FROGBOT_SECRET: 'browser-test-secret',
    NEXT_TELEMETRY_DISABLED: '1',
  },
};

const richTextServer = {
  command: 'node ../../../../packages/frogbot/bin.js dev',
  cwd: richTextFixture,
  url: `http://localhost:${richTextPort}`,
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
  stdout: 'ignore' as const,
  stderr: 'pipe' as const,
  env: {
    PORT: String(richTextPort),
    DATABASE_URL: 'file:./rich-text.browser.db',
    FROGBOT_SECRET: 'browser-test-secret',
    NEXT_TELEMETRY_DISABLED: '1',
  },
};

const livePreviewServer = {
  command: 'pnpm --filter frogbot-browser-live-preview dev',
  cwd: repoRoot,
  url: `http://localhost:${livePreviewPort}`,
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
  stdout: 'ignore' as const,
  stderr: 'pipe' as const,
  env: {
    PORT: String(livePreviewPort),
    DATABASE_URL: 'file:./frogbot.browser.db',
    FROGBOT_SECRET: 'browser-test-secret',
    NEXT_TELEMETRY_DISABLED: '1',
  },
};

const customFieldServer = {
  command: 'pnpm --filter frogbot-browser-custom-field dev',
  cwd: repoRoot,
  url: `http://localhost:${customFieldPort}`,
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
  stdout: 'ignore' as const,
  stderr: 'pipe' as const,
  env: {
    PORT: String(customFieldPort),
    DATABASE_URL: 'file:./frogbot.custom-field.browser.db',
    FROGBOT_SECRET: 'browser-test-secret',
    NEXT_TELEMETRY_DISABLED: '1',
  },
};

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
      name: 'rich-text',
      testMatch: 'richText.browser.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${richTextPort}`,
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
    {
      name: 'custom-field',
      testMatch: 'customField.browser.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${customFieldPort}`,
        channel: 'chromium',
      },
    },
  ],
  webServer:
    selectedProject === 'rich-text'
      ? [richTextServer]
      : selectedProject === 'live-preview'
        ? [livePreviewServer]
        : selectedProject === 'custom-field'
          ? [customFieldServer]
          : selectedProject === 'blank'
            ? [blankServer]
            : [blankServer, customFieldServer, richTextServer, livePreviewServer],
});
