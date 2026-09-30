import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '..', '..');
const richTextFixture = path.join(repoRoot, 'test', 'e2e', 'fixtures', 'rich-text');
const pluginSeoFixture = path.join(repoRoot, 'test', 'e2e', 'fixtures', 'plugin-wrappers');
const blankPort = 3111;
const customFieldPort = 3112;
const richTextPort = 3113;
const livePreviewPort = 3114;
const chatAssetsPort = 3125;
const chatProviderPort = 3126;
const questionPort = 3127;
const pluginSeoPort = 3128;
const selectedProjects = new Set<string>();
let collectingProjects = false;

for (const argument of process.argv.slice(2)) {
  if (argument === '--') break;

  if (argument === '--project') {
    collectingProjects = true;
    continue;
  }

  if (argument.startsWith('--project=')) {
    selectedProjects.add(argument.slice('--project='.length).toLocaleLowerCase());
    collectingProjects = true;
    continue;
  }

  if (argument.startsWith('-')) {
    collectingProjects = false;
    continue;
  }

  if (collectingProjects) selectedProjects.add(argument.toLocaleLowerCase());
}

const startAllServers =
  selectedProjects.size === 0 || [...selectedProjects].some((project) => project.includes('*'));

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
    OPENAI_API_KEY: 'browser-test-key',
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

const pluginSeoServer = {
  command: 'node ../../../../packages/frogbot/bin.js dev',
  cwd: pluginSeoFixture,
  url: `http://localhost:${pluginSeoPort}/admin`,
  reuseExistingServer: false,
  timeout: 180_000,
  stdout: 'ignore' as const,
  stderr: 'pipe' as const,
  env: {
    PORT: String(pluginSeoPort),
    DATABASE_URL: 'file:./plugin-wrappers.browser.db',
    FROGBOT_SECRET: 'browser-test-secret',
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_PATH: '',
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

const chatAssetsServers = [
  {
    command: 'node test/browser/fixtures/chat-assets/provider.mjs',
    cwd: repoRoot,
    url: `http://localhost:${chatProviderPort}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PORT: String(chatProviderPort) },
  },
  {
    command: 'node ../../../node_modules/next/dist/bin/next dev',
    cwd: path.join(dirname, 'fixtures', 'chat-assets'),
    url: `http://localhost:${chatAssetsPort}`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore' as const,
    stderr: 'pipe' as const,
    env: {
      PORT: String(chatAssetsPort),
      DATABASE_URL: 'file:./frogbot.db',
      FROGBOT_SECRET: 'browser-chat-assets-secret',
      BROWSER_PROVIDER_URL: `http://localhost:${chatProviderPort}/v1`,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
];

const questionServer = {
  command: 'node ../../../node_modules/next/dist/bin/next dev',
  cwd: path.join(dirname, 'fixtures', 'question'),
  url: `http://localhost:${questionPort}`,
  reuseExistingServer: false,
  timeout: 180_000,
  stdout: 'ignore' as const,
  stderr: 'pipe' as const,
  env: {
    PORT: String(questionPort),
    DATABASE_URL: 'file:./frogbot.db',
    FROGBOT_SECRET: 'browser-question-secret',
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
      name: 'plugin-seo',
      testMatch: 'seoFields.browser.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${pluginSeoPort}`,
        channel: 'chromium',
      },
    },
    {
      name: 'chat-assets',
      testMatch: 'chatAssets.browser.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${chatAssetsPort}`,
        channel: 'chromium',
      },
    },
    {
      name: 'question',
      testMatch: [
        'question.browser.spec.ts',
        'reasoningSelector.browser.spec.ts',
        'modelAllowlist.browser.spec.ts',
        'channelChat.browser.spec.ts',
        'chatErrors.browser.spec.ts',
        'messagesOverride.browser.spec.ts',
        'breadcrumbs.browser.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${questionPort}`,
        channel: 'chromium',
      },
    },
    {
      name: 'blank',
      testMatch: ['generalPicker.browser.spec.ts', 'navShell.browser.spec.ts'],
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
      testMatch: ['customField.browser.spec.ts', 'adminTheme.browser.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${customFieldPort}`,
        channel: 'chromium',
      },
    },
  ],
  webServer: Object.entries({
    blank: blankServer,
    'custom-field': customFieldServer,
    'rich-text': richTextServer,
    'live-preview': livePreviewServer,
    'chat-assets': chatAssetsServers,
    question: questionServer,
    'plugin-seo': pluginSeoServer,
  })
    .filter(([name]) => startAllServers || selectedProjects.has(name))
    .flatMap(([, server]) => server),
});
