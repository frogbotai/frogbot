import type { PlaywrightTestConfig } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { testPort, testPortOffset } from '../../__helpers/shared/testPorts';

const originalArgv = process.argv;
const allProjects = [
  'blank',
  'custom-field',
  'custom-field-firefox',
  'custom-field-webkit',
  'rich-text',
  'live-preview',
  'chat-assets',
  'question',
  'question-firefox',
  'question-webkit',
  'plugin-seo',
];

const dependencyURLs: Record<string, string[]> = {
  'chat-assets': [`http://localhost:${testPort(3126)}/health`],
};

const readyPaths: Record<string, string> = {
  'plugin-seo': '/admin',
};

function serverURL(baseURL: string | undefined, name: string) {
  return baseURL && `${baseURL}${readyPaths[name] ?? ''}`;
}

function webServers(config: PlaywrightTestConfig) {
  return [config.webServer ?? []].flat();
}

function builtFixtures(config: PlaywrightTestConfig) {
  const build = webServers(config).find((server) => server.name === 'build');

  return (
    build &&
    JSON.parse(build.env?.FROGBOT_BROWSER_FIXTURES ?? '[]').map(
      ({ name }: { name: string }) => name,
    )
  );
}

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
});

describe('browser project servers', () => {
  it.each([
    { name: 'no selection', args: [], projects: allProjects },
    { name: 'positional test filter', args: ['navShell.browser.spec.ts'], projects: allProjects },
    { name: 'equals form', args: ['--project=live-preview'], projects: ['live-preview'] },
    { name: 'space form', args: ['--project', 'custom-field'], projects: ['custom-field'] },
    {
      name: 'project with a dependency server',
      args: ['--project=chat-assets'],
      projects: ['chat-assets'],
    },
    {
      name: 'project whose server is ready on /admin',
      args: ['--project=plugin-seo'],
      projects: ['plugin-seo'],
    },
    { name: 'chromium project', args: ['--project', 'question'], projects: ['question'] },
    {
      name: 'browser variant with its own server',
      args: ['--project=question-firefox'],
      projects: ['question-firefox'],
    },
    {
      name: 'setup project',
      args: ['--project', 'custom-field-webkit-setup'],
      projects: ['custom-field-webkit'],
    },
    {
      name: 'repeated equals flags',
      args: ['--project=live-preview', '--project=custom-field'],
      projects: ['custom-field', 'live-preview'],
    },
    {
      name: 'repeated space flags',
      args: ['--project', 'blank', '--project', 'rich-text'],
      projects: ['blank', 'rich-text'],
    },
    {
      name: 'mixed flag forms',
      args: ['--project', 'custom-field', '--project=live-preview'],
      projects: ['custom-field', 'live-preview'],
    },
    {
      name: 'multiple following space values',
      args: ['--project', 'live-preview', 'custom-field'],
      projects: ['custom-field', 'live-preview'],
    },
    {
      name: 'following values after equals form',
      args: ['--project=live-preview', 'custom-field'],
      projects: ['custom-field', 'live-preview'],
    },
    {
      name: 'duplicate selections',
      args: ['--project=live-preview', '--project', 'live-preview'],
      projects: ['live-preview'],
    },
    {
      name: 'case-insensitive selection',
      args: ['--project=LIVE-PREVIEW'],
      projects: ['live-preview'],
    },
    {
      name: 'other option values are not projects',
      args: ['--project=live-preview', '--grep', 'custom-field'],
      projects: ['live-preview'],
    },
    {
      name: 'argument separator ends selection',
      args: ['--project=live-preview', '--', 'custom-field', '--project=blank'],
      projects: ['live-preview'],
    },
    {
      name: 'argument separator before project-like test filter',
      args: ['--', '--project=live-preview'],
      projects: allProjects,
    },
    { name: 'wildcard selection', args: ['--project=*field'], projects: allProjects },
    {
      name: 'wildcard alongside exact selection',
      args: ['--project=live-preview', '--project', '*field'],
      projects: allProjects,
    },
    {
      name: 'regular-expression characters remain literal',
      args: ['--project=live.preview'],
      projects: [],
    },
  ])('starts the matching servers for $name', async ({ args, projects }) => {
    process.argv = [process.execPath, 'playwright', 'test', ...args];
    vi.resetModules();

    const { default: config } = await import('../../browser/playwright.config.js');
    const expectedURLs = projects.flatMap((name) => [
      ...(dependencyURLs[name] ?? []),
      serverURL(config.projects?.find((project) => project.name === name)?.use?.baseURL, name),
    ]);

    expect(expectedURLs).not.toContain(undefined);
    expect(
      webServers(config)
        .flatMap((server) => server.url ?? [])
        .sort(),
    ).toEqual(expectedURLs.sort());
  });

  it('serves projects from offset ports and shares the offset with servers and workers', async () => {
    process.argv = [process.execPath, 'playwright', 'test'];
    vi.resetModules();

    const { default: config } = await import('../../browser/playwright.config.js');
    const blank = config.projects?.find((project) => project.name === 'blank');

    expect(blank?.use?.baseURL).toBe(`http://localhost:${testPort(3111)}`);
    expect(process.env.FROGBOT_TEST_PORT_OFFSET).toBe(String(testPortOffset));
  });

  it('gives every project its own server and runs its tests one at a time', async () => {
    process.argv = [process.execPath, 'playwright', 'test'];
    vi.resetModules();

    const { default: config } = await import('../../browser/playwright.config.js');
    const projects = config.projects?.filter((project) => !project.name?.endsWith('-setup')) ?? [];

    expect(new Set(projects.map((project) => project.use?.baseURL)).size).toBe(projects.length);
    expect(projects.filter((project) => project.workers !== 1).map(({ name }) => name)).toEqual([]);
  });

  it('builds each fixture the selected projects need once, before starting their servers', async () => {
    process.argv = [
      process.execPath,
      'playwright',
      'test',
      '--project',
      'question',
      'question-webkit',
      'plugin-seo',
    ];

    vi.resetModules();

    const { default: config } = await import('../../browser/playwright.config.js');

    expect(
      webServers(config)
        .map(({ name }) => name)
        .slice(0, 2),
    ).toEqual(['slot', 'build']);
    expect(builtFixtures(config)).toEqual(['question', 'plugin-wrappers']);
  });

  it('runs every project in series on dev servers shared by browser variants with FROGBOT_BROWSER_DEV=1', async () => {
    process.argv = [process.execPath, 'playwright', 'test', '--project', 'question-firefox'];
    vi.stubEnv('FROGBOT_BROWSER_DEV', '1');
    vi.resetModules();

    const { default: config } = await import('../../browser/playwright.config.js');
    const project = (name: string) => config.projects?.find((entry) => entry.name === name);

    expect(config.workers).toBe(1);
    expect(builtFixtures(config)).toBeUndefined();
    expect(project('question-firefox')?.use?.baseURL).toBe(project('question')?.use?.baseURL);
    expect(project('question-firefox')?.dependencies).toEqual(['question-setup']);
    expect(webServers(config).map((server) => server.url)).toEqual([
      undefined,
      `http://localhost:${testPort(3127)}`,
    ]);
    expect(webServers(config)[1]?.command).toMatch(/"dev"$/);
  });
});
