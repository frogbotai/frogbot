import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { testPort, testPortOffset } from '../__helpers/shared/testPorts';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '..', '..');
const richTextFixture = path.join(repoRoot, 'test', 'e2e', 'fixtures', 'rich-text');
const pluginSeoFixture = path.join(repoRoot, 'test', 'e2e', 'fixtures', 'plugin-wrappers');
const blankPort = testPort(3111);
const customFieldPort = testPort(3112);
const richTextPort = testPort(3113);
const livePreviewPort = testPort(3114);
const chatAssetsPort = testPort(3125);
const chatProviderPort = testPort(3126);
const questionPort = testPort(3127);
const pluginSeoPort = testPort(3128);

process.env.FROGBOT_TEST_PORT_OFFSET = String(testPortOffset);

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

// Each server starts from an empty database, like Payload's PAYLOAD_DROP_DATABASE.
// The reset runs as part of the server command, so a reused server keeps its data.
const resetDatabaseScript = path.join(dirname, 'resetDatabase.mjs');
const freshDatabase = (databaseFile: string, command: string) =>
  `node ${JSON.stringify(resetDatabaseScript)} ${JSON.stringify(databaseFile)} && ${command}`;

const startAllServers =
  selectedProjects.size === 0 || [...selectedProjects].some((project) => project.includes('*'));

const blankServer = {
  command: freshDatabase(
    path.join(repoRoot, 'templates', 'blank', 'frogbot.browser.db'),
    'pnpm --filter blank dev',
  ),
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
  command: freshDatabase(
    path.join(richTextFixture, 'rich-text.browser.db'),
    'node ../../../../packages/frogbot/bin.js dev',
  ),
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
  command: freshDatabase(
    path.join(pluginSeoFixture, 'plugin-wrappers.browser.db'),
    'node ../../../../packages/frogbot/bin.js dev',
  ),
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
  command: freshDatabase(
    path.join(dirname, 'fixtures', 'live-preview', 'frogbot.browser.db'),
    'pnpm --filter frogbot-browser-live-preview dev',
  ),
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
  command: freshDatabase(
    path.join(dirname, 'fixtures', 'custom-field', 'frogbot.custom-field.browser.db'),
    'pnpm --filter frogbot-browser-custom-field dev',
  ),
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
    command: freshDatabase(
      path.join(dirname, 'fixtures', 'chat-assets', 'frogbot.db'),
      'node ../../../node_modules/next/dist/bin/next dev',
    ),
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
  command: freshDatabase(
    path.join(dirname, 'fixtures', 'question', 'frogbot.db'),
    'node ../../../node_modules/next/dist/bin/next dev',
  ),
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
        'modelSelector.browser.spec.ts',
        'modelAllowlist.browser.spec.ts',
        'channelChat.browser.spec.ts',
        'chatErrors.browser.spec.ts',
        'messagesOverride.browser.spec.ts',
        'breadcrumbs.browser.spec.ts',
        'topBarPhone.browser.spec.ts',
        'costUSD.browser.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${questionPort}`,
        channel: 'chromium',
      },
    },
    {
      name: 'question-firefox',
      testMatch: [
        'reasoningSelector.browser.spec.ts',
        'modelSelector.browser.spec.ts',
        'breadcrumbs.browser.spec.ts',
        'topBarPhone.browser.spec.ts',
      ],
      use: {
        ...devices['Desktop Firefox'],
        baseURL: `http://localhost:${questionPort}`,
      },
    },
    {
      name: 'question-webkit',
      testMatch: [
        'reasoningSelector.browser.spec.ts',
        'modelSelector.browser.spec.ts',
        'breadcrumbs.browser.spec.ts',
        'topBarPhone.browser.spec.ts',
      ],
      use: {
        ...devices['Desktop Safari'],
        baseURL: `http://localhost:${questionPort}`,
      },
    },
    {
      name: 'blank',
      testMatch: [
        'generalPicker.browser.spec.ts',
        'iconGeometry.browser.spec.ts',
        'navShell.browser.spec.ts',
      ],
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
      testMatch: ['accountMenu.browser.spec.ts', 'livePreview.browser.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${livePreviewPort}`,
        channel: 'chromium',
      },
    },
    {
      name: 'custom-field',
      testMatch: [
        'customField.browser.spec.ts',
        'adminTheme.browser.spec.ts',
        'cssLayers.browser.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${customFieldPort}`,
        channel: 'chromium',
      },
    },
    {
      name: 'custom-field-firefox',
      testMatch: 'cssLayers.browser.spec.ts',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: `http://localhost:${customFieldPort}`,
      },
    },
    {
      name: 'custom-field-webkit',
      testMatch: 'cssLayers.browser.spec.ts',
      use: {
        ...devices['Desktop Safari'],
        baseURL: `http://localhost:${customFieldPort}`,
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
    .filter(
      ([name]) =>
        startAllServers ||
        [...selectedProjects].some((project) => project === name || project.startsWith(`${name}-`)),
    )
    .flatMap(([, server]) => server),
});
