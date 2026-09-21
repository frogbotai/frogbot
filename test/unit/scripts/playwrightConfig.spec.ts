import { afterEach, describe, expect, it, vi } from 'vitest';

const originalArgv = process.argv;
const allProjects = ['blank', 'custom-field', 'rich-text', 'live-preview'];

afterEach(() => {
  process.argv = originalArgv;
});

describe('browser project servers', () => {
  it.each([
    { name: 'no selection', args: [], projects: allProjects },
    { name: 'positional test filter', args: ['navShell.browser.spec.ts'], projects: allProjects },
    { name: 'equals form', args: ['--project=live-preview'], projects: ['live-preview'] },
    { name: 'space form', args: ['--project', 'custom-field'], projects: ['custom-field'] },
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
    const servers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];
    const expectedURLs = projects.map(
      (name) => config.projects?.find((project) => project.name === name)?.use?.baseURL,
    );

    expect(expectedURLs).not.toContain(undefined);
    expect(servers.map((server) => server?.url)).toEqual(expectedURLs);
  });
});
