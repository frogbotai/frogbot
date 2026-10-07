import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { testPort, testPortOffset } from '../__helpers/shared/testPorts';
import type { QuestionOptions } from './__helpers/questionTest';
import type { SignInOptions } from './__helpers/signIn';
import { stopServersOnSignal } from './__helpers/stopServersOnSignal';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '..', '..');
const frogbotBin = path.join(repoRoot, 'packages', 'frogbot', 'bin.js');
const resetDatabaseScript = path.join(dirname, 'resetDatabase.mjs');
const buildFixturesScript = path.join(dirname, 'buildFixtures.mjs');
const slotScript = path.join(repoRoot, 'scripts', 'lib', 'slot.mjs');

const dev = process.env.FROGBOT_BROWSER_DEV === '1';

process.env.FROGBOT_TEST_PORT_OFFSET = String(testPortOffset);

stopServersOnSignal();

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

type Fixture = {
  dir: string;
  cli: 'frogbot' | 'next';
  env: Record<string, string>;
};

const fixtures = {
  question: {
    dir: path.join(dirname, 'fixtures', 'question'),
    cli: 'next',
    env: { FROGBOT_SECRET: 'browser-question-secret' },
  },
  'custom-field': {
    dir: path.join(dirname, 'fixtures', 'custom-field'),
    cli: 'frogbot',
    env: { FROGBOT_SECRET: 'browser-test-secret' },
  },
  blank: {
    dir: path.join(repoRoot, 'templates', 'blank'),
    cli: 'frogbot',
    env: { FROGBOT_SECRET: 'browser-test-secret', OPENAI_API_KEY: 'browser-test-key' },
  },
  'rich-text': {
    dir: path.join(repoRoot, 'test', 'e2e', 'fixtures', 'rich-text'),
    cli: 'frogbot',
    env: { FROGBOT_SECRET: 'browser-test-secret' },
  },
  'chat-assets': {
    dir: path.join(dirname, 'fixtures', 'chat-assets'),
    cli: 'next',
    env: { FROGBOT_SECRET: 'browser-chat-assets-secret' },
  },
  'live-preview': {
    dir: path.join(dirname, 'fixtures', 'live-preview'),
    cli: 'frogbot',
    env: { FROGBOT_SECRET: 'browser-test-secret' },
  },
  'plugin-wrappers': {
    dir: path.join(repoRoot, 'test', 'e2e', 'fixtures', 'plugin-wrappers'),
    cli: 'frogbot',
    env: { FROGBOT_SECRET: 'browser-test-secret', NODE_PATH: '' },
  },
} satisfies Record<string, Fixture>;

type Server = {
  fixture: keyof typeof fixtures;
  port: number;
  database: string;
  devServer?: string;
  readyPath?: string;
  env?: Record<string, string>;
  modelPort?: number;
};

const chatProviderPort = testPort(3126);

const questionServer = (port: number, database: string, modelPort: number): Server => ({
  fixture: 'question',
  port,
  database,
  modelPort,
  env: { BROWSER_MODEL_URL: `http://127.0.0.1:${modelPort}/v1` },
});

const servers: Record<string, Server> = {
  question: questionServer(testPort(3127), 'frogbot.db', testPort(3129)),
  'question-firefox': {
    ...questionServer(testPort(3130), 'frogbot.firefox.db', testPort(3131)),
    devServer: 'question',
  },
  'question-webkit': {
    ...questionServer(testPort(3132), 'frogbot.webkit.db', testPort(3133)),
    devServer: 'question',
  },
  'custom-field': {
    fixture: 'custom-field',
    port: testPort(3112),
    database: 'frogbot.custom-field.browser.db',
  },
  'custom-field-firefox': {
    fixture: 'custom-field',
    port: testPort(3134),
    database: 'frogbot.custom-field-firefox.browser.db',
    devServer: 'custom-field',
  },
  'custom-field-webkit': {
    fixture: 'custom-field',
    port: testPort(3135),
    database: 'frogbot.custom-field-webkit.browser.db',
    devServer: 'custom-field',
  },
  blank: { fixture: 'blank', port: testPort(3111), database: 'frogbot.browser.db' },
  'rich-text': { fixture: 'rich-text', port: testPort(3113), database: 'rich-text.browser.db' },
  'chat-assets': {
    fixture: 'chat-assets',
    port: testPort(3125),
    database: 'frogbot.db',
    env: { BROWSER_PROVIDER_URL: `http://localhost:${chatProviderPort}/v1` },
  },
  'live-preview': { fixture: 'live-preview', port: testPort(3114), database: 'frogbot.browser.db' },
  'plugin-seo': {
    fixture: 'plugin-wrappers',
    port: testPort(3128),
    database: 'plugin-wrappers.browser.db',
    readyPath: '/admin',
  },
};

const serverFor = (project: string) => (dev && servers[project].devServer) || project;

const browsers = {
  chromium: { ...devices['Desktop Chrome'], channel: 'chromium' },
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};

const authFile = (server: string) => path.join(dirname, '.auth', `${server}.json`);

const setupProject = (server: string, signInOptions: SignInOptions = {}) => ({
  name: `${server}-setup`,
  testMatch: 'auth.setup.ts',
  use: {
    ...browsers.chromium,
    baseURL: `http://localhost:${servers[server].port}`,
    signInOptions,
    authFile: authFile(server),
  },
});

const project = ({
  name,
  browser = 'chromium',
  testMatch,
}: {
  name: string;
  browser?: keyof typeof browsers;
  testMatch: string | string[];
}) => {
  const server = serverFor(name);
  const { port, modelPort } = servers[server];

  return {
    name,
    testMatch,
    dependencies: [`${server}-setup`],
    workers: 1,
    use: {
      ...browsers[browser],
      baseURL: `http://localhost:${port}`,
      storageState: authFile(server),
      ...(modelPort ? { modelPort } : {}),
    },
  };
};

const crossBrowserQuestionSpecs = [
  'reasoningSelector.browser.spec.ts',
  'modelSelector.browser.spec.ts',
  'breadcrumbs.browser.spec.ts',
  'topBarPhone.browser.spec.ts',
];

const signInOptions: Record<string, SignInOptions> = {
  'rich-text': { adminRoute: '/admin' },
  'plugin-seo': { adminRoute: '/admin' },
};

const testProjects = [
  project({
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
      'money.browser.spec.ts',
      'fieldCell.browser.spec.ts',
      'optionColors.browser.spec.ts',
      'simpleKinds.browser.spec.ts',
      'systemFields.browser.spec.ts',
      'virtualPaths.browser.spec.ts',
      'aiField.browser.spec.ts',
    ],
  }),
  project({ name: 'question-firefox', browser: 'firefox', testMatch: crossBrowserQuestionSpecs }),
  project({ name: 'question-webkit', browser: 'webkit', testMatch: crossBrowserQuestionSpecs }),
  project({ name: 'rich-text', testMatch: 'richText.browser.spec.ts' }),
  project({
    name: 'custom-field',
    testMatch: [
      'customField.browser.spec.ts',
      'adminTheme.browser.spec.ts',
      'cssLayers.browser.spec.ts',
    ],
  }),
  project({
    name: 'blank',
    testMatch: [
      'generalPicker.browser.spec.ts',
      'iconGeometry.browser.spec.ts',
      'navShell.browser.spec.ts',
    ],
  }),
  project({ name: 'chat-assets', testMatch: 'chatAssets.browser.spec.ts' }),
  project({
    name: 'custom-field-firefox',
    browser: 'firefox',
    testMatch: 'cssLayers.browser.spec.ts',
  }),
  project({
    name: 'custom-field-webkit',
    browser: 'webkit',
    testMatch: 'cssLayers.browser.spec.ts',
  }),
  project({
    name: 'live-preview',
    testMatch: ['accountMenu.browser.spec.ts', 'livePreview.browser.spec.ts'],
  }),
  project({ name: 'plugin-seo', testMatch: 'seoFields.browser.spec.ts' }),
];

const selectedServers = [
  ...new Set(
    testProjects
      .filter(
        ({ name }) =>
          startAllServers ||
          selectedProjects.has(name) ||
          selectedProjects.has(`${serverFor(name)}-setup`),
      )
      .map(({ name }) => serverFor(name)),
  ),
];

const quoted = (...parts: string[]) => parts.map((part) => JSON.stringify(part)).join(' ');

const nextBin = (fixture: Fixture) =>
  createRequire(path.join(fixture.dir, 'package.json')).resolve('next/dist/bin/next');

const schemaDatabase = (fixture: Fixture) =>
  path.join(fixture.dir, '.next', 'frogbot-browser', 'schema.db');

const webServer = (name: string) => {
  const { fixture: fixtureName, port, database, readyPath = '', env } = servers[name];
  const fixture: Fixture = fixtures[fixtureName];
  const reset = dev ? [database] : [database, schemaDatabase(fixture)];
  const serve = dev
    ? [fixture.cli === 'frogbot' ? frogbotBin : nextBin(fixture), 'dev']
    : [nextBin(fixture), 'start'];

  return {
    name,
    command: `node ${quoted(resetDatabaseScript, ...reset)} && node ${quoted(...serve)}`,
    cwd: fixture.dir,
    url: `http://localhost:${port}${readyPath}`,
    reuseExistingServer: dev && !process.env.CI,
    timeout: dev ? 180_000 : 60_000,
    stdout: 'ignore' as const,
    stderr: 'pipe' as const,
    env: {
      ...fixture.env,
      ...env,
      PORT: String(port),
      DATABASE_URL: `file:./${database}`,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  };
};

const chatProvider = {
  name: 'chat-provider',
  command: 'node test/browser/fixtures/chat-assets/provider.mjs',
  cwd: repoRoot,
  url: `http://localhost:${chatProviderPort}/health`,
  reuseExistingServer: false,
  timeout: 30_000,
  env: { PORT: String(chatProviderPort) },
};

const selectedFixtures = [...new Set(selectedServers.map((name) => servers[name].fixture))].map(
  (name) => {
    const { dir, env } = fixtures[name];

    return { name, dir, env };
  },
);

const buildServer = {
  name: 'build',
  command: `node ${quoted(buildFixturesScript)}`,
  cwd: repoRoot,
  wait: { stdout: /^ready$/m },
  timeout: 20 * 60_000,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
  env: { FROGBOT_BROWSER_FIXTURES: JSON.stringify(selectedFixtures), NEXT_TELEMETRY_DISABLED: '1' },
};

const slotServer = {
  name: 'slot',
  command: `node ${quoted(slotScript, 'browser')}`,
  cwd: repoRoot,
  wait: { stdout: /^ready$/m },
  timeout: 4 * 60 * 60_000,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
};

export default defineConfig<{ signInOptions: SignInOptions; authFile: string }, QuestionOptions>({
  testDir: dirname,
  testMatch: '*.browser.spec.ts',
  outputDir: path.join(dirname, 'test-results'),
  fullyParallel: false,
  workers: dev ? 1 : 4,
  maxFailures: process.env.CI ? undefined : 3,
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
    ...[...new Set(testProjects.map(({ name }) => serverFor(name)))].map((server) =>
      setupProject(server, signInOptions[server]),
    ),
    ...testProjects,
  ],
  webServer: [
    slotServer,
    ...(dev || selectedFixtures.length === 0 ? [] : [buildServer]),
    ...selectedServers.flatMap((name) =>
      name === 'chat-assets' ? [chatProvider, webServer(name)] : [webServer(name)],
    ),
  ],
});
