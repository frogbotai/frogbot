import {
  existsSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createHost,
  createProfile,
  fallbackURLs,
  legacyBase,
  legacyEntry,
  legacyIndex,
  modernEntry,
  modernIndex,
  preparedClient,
  repoRoot,
  runClient,
  type HostingHost,
  type HostingProfile,
  type HostingRequest,
  type HostingResult,
} from './fixtures/skill-distribution/hosting/harness.js';

const skills = preparedClient('SKILL_HOSTING_SKILLS_BIN');
const opencode = preparedClient('SKILL_HOSTING_OPENCODE_BIN');
const canonical = join(repoRoot, 'skills/frogbot');
let entry: Buffer;
let references: string[];
let host: HostingHost;
let profile: HostingProfile;
let results: (HostingResult & { requests: HostingRequest[] })[];

function expectEntryOnly(directory: string) {
  expect(readdirSync(directory)).toEqual(['SKILL.md']);

  const installed = readFileSync(join(directory, 'SKILL.md'));
  const urls = fallbackURLs(installed.toString());

  expect(installed).toEqual(entry);
  expect(urls).toHaveLength(23);
  expect(new Set(urls).size).toBe(23);
  expect(urls.map((url) => url.split('/').at(-1)).sort()).toEqual(references);

  for (const name of references) {
    expect(installed.toString()).toContain(`](reference/${name})`);
    expect(existsSync(join(directory, 'reference', name))).toBe(false);
  }
}

function expectRequest(path: string, status: number) {
  expect(host.requests).toContainEqual({ method: 'GET', path, status });
}

async function install() {
  const result = await runClient({
    executable: skills.executable,
    args: ['add', host.origin, '--skill', 'frogbot', '--agent', 'opencode', '--yes'],
    profile,
  });

  results.push({ ...result, requests: [...host.requests] });

  return result;
}

async function discover() {
  profile.configure(`${host.origin}${legacyBase}`);

  const result = await runClient({
    executable: opencode.executable,
    args: ['debug', 'skill', '--print-logs'],
    profile,
  });

  results.push({ ...result, requests: [...host.requests] });

  return {
    ...result,
    skills: JSON.parse(result.stdout) as { name: string; location: string; content: string }[],
  };
}

describe('hosted skill protocol with prepared real clients', () => {
  beforeAll(() => {
    entry = readFileSync(join(canonical, 'SKILL.md'));
    references = readdirSync(join(canonical, 'reference')).sort();

    expect(references).toHaveLength(23);
    expect(readdirSync(canonical).sort()).toEqual(['SKILL.md', 'reference']);
    expect(readlinkSync(join(repoRoot, 'docs/.mintlify/skills'))).toBe('../../skills');
    expect(realpathSync(join(repoRoot, 'docs/.mintlify/skills/frogbot'))).toBe(
      realpathSync(canonical),
    );
  });

  beforeEach(async () => {
    results = [];
    profile = createProfile();
    host = await createHost(entry);
  });

  afterEach(async ({ task }) => {
    console.info(
      JSON.stringify({
        case: task.name,
        requests: host.requests,
        clients: results.map(({ code, signal, stdout, stderr, requests }) => ({
          code,
          signal,
          requests,
          diagnostics: `${stdout}\n${stderr}`
            .split('\n')
            .filter((line) => !line.trimStart().startsWith('"content":'))
            .filter((line) =>
              /failed|error|not found|no well-known|404|fetching index/i.test(line),
            ),
        })),
      }),
    );

    await host.close();
    rmSync(profile.root, { recursive: true, force: true });
  });

  describe.skipIf(Boolean(skills.missing))(skills.missing || 'skills hosted installs', () => {
    it('identifies the prepared skills client version', async () => {
      const result = await runClient({
        executable: skills.executable,
        args: ['--version'],
        profile,
      });

      console.info(`Prepared skills ${result.stdout.trim()}: ${skills.executable}`);
      expect(result.stdout.trim()).toBe('1.5.23');
    });

    it.each(['v0.2', 'legacy'] as const)(
      'installs only the canonical entry through %s and retains 23 fallbacks',
      async (protocol) => {
        host[protocol === 'v0.2' ? 'modern' : 'legacy']();

        const result = await install();

        expect(result.stdout).toContain('Found 1 skill');
        expect(result.signal).toBeNull();
        expectEntryOnly(profile.installed);
        expectRequest(modernIndex, protocol === 'v0.2' ? 200 : 404);
        expectRequest(legacyIndex, protocol === 'legacy' ? 200 : 404);
        expectRequest(protocol === 'v0.2' ? modernEntry : legacyEntry, 200);
        expect(host.requests.every(({ path }) => !path.includes('/reference/'))).toBe(true);
      },
    );

    it.each([
      {
        name: 'v0.2 digest mismatch',
        setup: () => host.modern({ mismatch: true }),
        path: modernEntry,
        status: 200,
      },
      {
        name: 'v0.2 missing entry',
        setup: () => host.modern({ missing: true }),
        path: modernEntry,
        status: 404,
      },
      { name: 'missing indices', setup: () => host.routes.clear(), path: modernIndex, status: 404 },
      {
        name: 'legacy missing entry',
        setup: () => host.legacy({ missing: true }),
        path: legacyEntry,
        status: 404,
      },
      {
        name: 'legacy lowercase-only route',
        setup: () => host.legacy({ lowercase: true }),
        path: legacyEntry,
        status: 404,
      },
    ])(
      'does not install from $name and exposes the actual diagnostic',
      async ({ setup, path, status }) => {
        setup();

        const result = await install();

        expect(existsSync(profile.installed)).toBe(false);
        expect(result.stdout + result.stderr).toContain(
          'No well-known skills found; trying direct download...',
        );
        expect(result.stdout + result.stderr).toContain('Download failed with HTTP 404');
        expect(result.stdout + result.stderr).toContain('Installation failed');
        expectRequest(path, status);
        expectRequest('/', 404);
        expect(host.requests.filter((request) => request.path.endsWith('/skill.md'))).toEqual([]);
        expectRequest(
          path.startsWith('/.well-known/agent-skills') ? legacyIndex : modernIndex,
          404,
        );
      },
    );
  });

  describe.skipIf(Boolean(opencode.missing))(
    opencode.missing || 'opencode hosted discovery',
    () => {
      it('identifies the prepared opencode client version', async () => {
        const result = await runClient({
          executable: opencode.executable,
          args: ['--version'],
          profile,
        });

        console.info(`Prepared opencode ${result.stdout.trim()}: ${opencode.executable}`);
        expect(result.stdout.trim()).toBe('1.18.31');
      });

      it('resolves home, config, data, state and cache inside the fresh test profile', async () => {
        const result = await runClient({
          executable: opencode.executable,
          args: ['debug', 'paths'],
          profile,
        });

        const paths = Object.fromEntries(
          result.stdout
            .trim()
            .split('\n')
            .map((line) => line.trim().split(/\s+/)),
        );

        expect(paths.home).toBe(profile.env.HOME);
        expect(paths.config).toBe(profile.env.OPENCODE_CONFIG_DIR);
        expect(paths.data).toBe(join(profile.env.XDG_DATA_HOME!, 'opencode'));
        expect(paths.state).toBe(join(profile.env.XDG_STATE_HOME!, 'opencode'));
        expect(paths.cache).toBe(join(profile.env.XDG_CACHE_HOME!, 'opencode'));
        expect(Object.values(paths).every((path) => path.startsWith(`${profile.root}/`))).toBe(
          true,
        );
        expect(profile.env).not.toHaveProperty('NODE_OPTIONS');
        expect(
          Object.keys(profile.env).filter((key) =>
            /API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/.test(key),
          ),
        ).toEqual([]);
      });

      it('discovers the uppercase legacy entry in its isolated cache', async () => {
        host.legacy();

        const result = await discover();
        const found = result.skills.filter((skill) => skill.name === 'frogbot');

        expect(found).toHaveLength(1);
        expect(found[0].location).toBe(join(profile.cached, 'SKILL.md'));
        expect(fallbackURLs(found[0].content)).toHaveLength(23);
        expectEntryOnly(profile.cached);
        expect(host.requests).toEqual([
          { method: 'GET', path: legacyIndex, status: 200 },
          { method: 'GET', path: legacyEntry, status: 200 },
        ]);
        expect(
          result.skills
            .filter((skill) => skill.location !== '<built-in>')
            .map((skill) => skill.name),
        ).toEqual(['frogbot']);
      });

      it.each([
        {
          name: 'missing index',
          setup: () => host.routes.clear(),
          path: legacyIndex,
          diagnostic: 'failed to fetch index',
        },
        {
          name: 'missing entry',
          setup: () => host.legacy({ missing: true }),
          path: legacyEntry,
          diagnostic: 'failed to download',
        },
        {
          name: 'lowercase-only route',
          setup: () => host.legacy({ lowercase: true }),
          path: legacyEntry,
          diagnostic: 'failed to download',
        },
      ])('reports $name without discovering a skill', async ({ setup, path, diagnostic }) => {
        setup();

        const result = await discover();

        expect(result.skills.filter((skill) => skill.name === 'frogbot')).toEqual([]);
        expect(existsSync(join(profile.cached, 'SKILL.md'))).toBe(false);
        expect(result.stderr).toContain(diagnostic);
        expectRequest(path, 404);
        expect(host.requests.filter((request) => request.path.endsWith('/skill.md'))).toEqual([]);
      });

      it('reuses unversioned cached bytes until the skill cache is removed', async () => {
        host.legacy();

        await discover();
        expectEntryOnly(profile.cached);

        const stale = entry
          .toString()
          .replace(/(  version: ')[^']+(')/, (_, prefix, suffix) => `${prefix}0.0.0${suffix}`);

        expect(stale).not.toBe(entry.toString());
        writeFileSync(join(profile.cached, 'SKILL.md'), stale);
        host.requests.length = 0;

        const cached = await discover();

        expect(cached.skills.find((skill) => skill.name === 'frogbot')?.location).toBe(
          join(profile.cached, 'SKILL.md'),
        );
        expect(readFileSync(join(profile.cached, 'SKILL.md'), 'utf8')).toBe(stale);
        expect(host.requests).toEqual([{ method: 'GET', path: legacyIndex, status: 200 }]);

        rmSync(profile.cached, { recursive: true });
        host.requests.length = 0;

        await discover();

        expectEntryOnly(profile.cached);
        expectRequest(legacyEntry, 200);
      });
    },
  );
});
