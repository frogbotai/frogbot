import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { publishablePackages, ROOT } from '../../../scripts/lib/workspace.mjs';

const { scripts } = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };

type Step = {
  name: string;
  run: string[] | ((bump: string) => string[]);
  env?: Record<string, string>;
};

async function bumpSteps(): Promise<string[]> {
  const { STEPS } = (await import('../../../scripts/prerelease.mjs')) as { STEPS: Step[] };

  return STEPS.map((step) => {
    const env = Object.entries(step.env ?? {}).map(([name, value]) => `${name}=${value} `);

    return `${env.join('')}${(typeof step.run === 'function' ? step.run('minor') : step.run).join(' ')}`;
  });
}

type Run = (command: string, args: string[]) => { status: number; stdout: string; stderr: string };

function release() {
  return import('../../../scripts/release.mjs');
}

async function releaseSteps(resume: boolean): Promise<string[]> {
  return (await release())
    .releaseSteps({ resume })
    .map(({ name, run }) => (typeof run === 'function' ? name : run.join(' ')));
}

const HEAD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

function fakeGit({
  released = false,
  local,
  remote,
  onMain = true,
}: {
  released?: boolean;
  local?: string;
  remote?: string;
  onMain?: boolean;
}) {
  const calls: string[] = [];

  const run: Run = (command, args) => {
    const call = [command, ...args].join(' ');
    const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
    const no = { status: 1, stdout: '', stderr: 'no' };

    calls.push(call);

    if (call.startsWith('gh release view')) return released ? ok('https://example.com/v1.1.0') : no;
    if (call.startsWith('git merge-base')) return onMain ? ok() : no;
    if (call === 'git rev-parse HEAD') return ok(HEAD);
    if (call.startsWith('git rev-parse -q --verify')) return local ? ok(local) : no;
    if (call.startsWith('git ls-remote')) return ok(remote ? `${remote}\trefs/tags/v1.1.0` : '');

    return ok(call.startsWith('gh release create') ? 'https://example.com/new' : '');
  };

  return { calls, run };
}

describe('release scripts', () => {
  it('bump builds, checks dist imports, checks UI packaging, starts services, and tests before bumping versions', async () => {
    expect(scripts.bump).toBe('node scripts/prerelease.mjs');

    const bump = await bumpSteps();

    const build = bump.indexOf('pnpm build');
    const check = bump.indexOf('pnpm check dist-imports');
    const services = bump.indexOf('pnpm docker:start');

    expect(build).toBeGreaterThanOrEqual(0);
    expect(check).toBe(build + 1);
    expect(bump.slice(check + 1, services)).toEqual([
      'node scripts/test-ui-package.mjs',
      'node scripts/test-ui-next.mjs',
    ]);
    expect(bump.slice(services + 1, -2)).toEqual([
      'RUN_E2E=1 RUN_COMPILER_CHECKS=1 pnpm test',
      'pnpm test:int:pg test/database/int.spec.ts test/search/postgres',
      'pnpm test:int:mongo test/database/int.spec.ts test/search/mongodb test/kv/mongo-native.int.spec.ts',
    ]);
    expect(bump.slice(-2)).toEqual([
      'node scripts/bump.mjs minor',
      'node scripts/release-changelog.mjs',
    ]);
  });

  it('bump checks for a single frogbot install before building', async () => {
    const bump = await bumpSteps();

    const install = bump.indexOf('pnpm install --frozen-lockfile');
    const check = bump.indexOf('pnpm check single-frogbot');

    expect(install).toBeGreaterThanOrEqual(0);
    expect(check).toBe(install + 1);
    expect(check).toBeLessThan(bump.indexOf('pnpm build'));
  });

  it.each([false, true])(
    'release (resume: %s) checks sign-ins, HEAD and the notes before publishing, posts the GitHub release last, and runs no tests',
    async (resume) => {
      expect(scripts.release).toBe('node scripts/release.mjs');

      expect(await releaseSteps(resume)).toEqual([
        'npm whoami',
        'gh auth status',
        'git fetch origin main',
        'check-head',
        'notes',
        ...(resume ? [] : ['pnpm install --frozen-lockfile']),
        'pnpm build',
        'pnpm check dist-imports',
        'publish',
        'wait-for-npm',
        'github-release',
      ]);
    },
  );

  it('check-head refuses a HEAD that is not on origin/main, or a tag elsewhere', async () => {
    const { checkHead } = await release();

    expect(() => checkHead({ tag: 'v1.1.0', run: fakeGit({}).run })).not.toThrow();
    expect(() =>
      checkHead({ tag: 'v1.1.0', run: fakeGit({ local: HEAD, remote: HEAD }).run }),
    ).not.toThrow();
    expect(() => checkHead({ tag: 'v1.1.0', run: fakeGit({ onMain: false }).run })).toThrow(
      /origin\/main/,
    );
    expect(() => checkHead({ tag: 'v1.1.0', run: fakeGit({ local: OTHER }).run })).toThrow(
      /local tag/,
    );
    expect(() => checkHead({ tag: 'v1.1.0', run: fakeGit({ remote: OTHER }).run })).toThrow(
      /remote tag/,
    );
  });

  it('github-release only prints the URL when the release exists', async () => {
    const { githubRelease } = await release();
    const { calls, run } = fakeGit({ released: true });
    const lines: string[] = [];

    githubRelease({ tag: 'v1.1.0', notes: '/tmp/notes.md', run, log: (line) => lines.push(line) });

    expect(calls).toEqual(['gh release view v1.1.0 --json url --jq .url']);
    expect(lines).toEqual(['v1.1.0 is already released: https://example.com/v1.1.0']);
  });

  it.each([
    [{}, ['git tag v1.1.0', 'git push origin v1.1.0']],
    [{ local: HEAD }, ['git push origin v1.1.0']],
    [{ local: HEAD, remote: HEAD }, []],
  ])('github-release with tags %o tags, pushes and publishes the release', async (tags, writes) => {
    const { githubRelease } = await release();
    const { calls, run } = fakeGit(tags);

    githubRelease({ tag: 'v1.1.0', notes: '/tmp/notes.md', run, log: () => {} });

    expect(calls.filter((call) => /^git (tag|push)|^gh release create/.test(call))).toEqual([
      ...writes,
      'gh release create v1.1.0 --title v1.1.0 --notes-file /tmp/notes.md --verify-tag',
    ]);
  });

  it('github-release stops before writing anything when the tag is on another commit', async () => {
    const { githubRelease } = await release();
    const { calls, run } = fakeGit({ remote: OTHER });

    expect(() =>
      githubRelease({ tag: 'v1.1.0', notes: '/tmp/notes.md', run, log: () => {} }),
    ).toThrow(/remote tag v1.1.0 points at bbbbbbbb/);
    expect(calls.some((call) => /^git (tag|push)|^gh release create/.test(call))).toBe(false);
  });

  const pkgs = ['@x/a', '@x/b', '@x/c'].map((name) => ({
    dir: `/p/${name}`,
    name,
    version: '1.1.0',
  }));

  type State = 'published' | 'missing' | 'error';

  function registry(states: Record<string, State>) {
    return (pkg: { name: string }) =>
      Promise.resolve({ ...pkg, state: states[pkg.name] ?? 'missing' });
  }

  it('publish skips versions npm already has and publishes the rest', async () => {
    const { publish } = await release();
    const states: Record<string, State> = { '@x/a': 'published' };
    const published: string[] = [];

    await publish({
      packages: pkgs,
      status: registry(states),
      publishOne: (pkg: { name: string }) => {
        published.push(pkg.name);
        states[pkg.name] = 'published';

        return 0;
      },
      log: () => {},
    });

    expect(published).toEqual(['@x/b', '@x/c']);
  });

  it('publish counts a failed publish as done when npm has the version, and fails otherwise', async () => {
    const { publish } = await release();
    const states: Record<string, State> = {};

    const publishOne = (pkg: { name: string }) => {
      if (pkg.name === '@x/a') states[pkg.name] = 'published';

      return 1;
    };

    await expect(
      publish({ packages: pkgs, status: registry(states), publishOne, log: () => {} }),
    ).rejects.toThrow(/publish failed for @x\/b, @x\/c; .*pnpm release --resume/);
  });

  it('wait-for-npm retries until every package is visible', async () => {
    const { waitForNpm } = await release();
    let checks = 0;
    const sleeps: number[] = [];

    await waitForNpm({
      packages: pkgs,
      status: (pkg: { name: string }) =>
        Promise.resolve({ ...pkg, state: checks++ < 4 ? 'missing' : 'published' }),
      interval: 5,
      sleep: (ms: number) => {
        sleeps.push(ms);

        return Promise.resolve();
      },
      log: () => {},
    });

    expect(sleeps).toEqual([5, 5]);
  });

  it('wait-for-npm gives up after the timeout and names what is missing', async () => {
    const { waitForNpm } = await release();

    await expect(
      waitForNpm({
        packages: pkgs,
        status: registry({ '@x/a': 'published', '@x/b': 'published' }),
        timeout: 0,
        sleep: async () => {},
        log: () => {},
      }),
    ).rejects.toThrow(/npm still lacks @x\/c; run pnpm release --resume/);
  });

  it('release status reads the registry past its cache', async () => {
    const { packageStatus } = await import('../../../scripts/release-status.mjs');
    const urls: string[] = [];

    const result = await packageStatus(pkgs[0], {
      registry: 'https://registry.test',
      fetch: (url: string) => {
        urls.push(url);

        return Promise.resolve(new Response(JSON.stringify({ versions: { '1.1.0': {} } })));
      },
    });

    expect(result.state).toBe('published');
    expect(urls[0]).toMatch(/^https:\/\/registry\.test\/@x%2fa\?t=\d+$/);
  });

  it('docker:start starts every service profile and waits for them', () => {
    expect(scripts['docker:start']).toBe(
      'docker compose -f test/docker-compose.yml --profile postgres --profile redis --profile mongodb --profile mongodb-search --profile storage up -d --wait --wait-timeout 120',
    );
  });

  it('the root has 27 commands plus the git hook scripts', () => {
    expect(Object.keys(scripts).sort()).toEqual(
      [
        'build',
        'typecheck',
        'lint',
        'lint:fix',
        'prettier',
        'prettier:write',
        'check',
        'test',
        'test:unit',
        'test:ui',
        'test:int',
        'test:int:pg',
        'test:int:mongo',
        'test:int:sqlite',
        'test:gateway',
        'test:e2e',
        'test:browser',
        'test:live',
        'docker:start',
        'docker:clean',
        'generate:types',
        'sync:catalog',
        'bump',
        'release',
        'release:status',
        'ticket',
        'vendored',
        'lint-staged',
        'prepare',
      ].sort(),
    );
  });

  it('check is the only root check script, and runs the check runner', () => {
    expect(scripts.check).toBe('node scripts/check.mjs');
    expect(Object.keys(scripts).filter((name) => name.startsWith('check:'))).toEqual([]);
  });

  it('every publishable package builds with the shared package build', () => {
    const shared = path.join(ROOT, 'scripts', 'build-package.mjs');

    const builds = publishablePackages().map(({ dir, name }) => {
      const manifest = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')) as {
        scripts?: Record<string, string>;
      };

      const [command, script] = manifest.scripts?.build?.split(' ') ?? [];

      return { name, shared: command === 'node' && path.resolve(dir, script ?? '') === shared };
    });

    const unshared = builds.filter(({ shared }) => !shared);

    expect(builds.length).toBeGreaterThan(0);
    expect(unshared).toEqual([]);
  });
});
