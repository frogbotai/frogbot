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

async function releaseSteps(resume: boolean): Promise<string[]> {
  const release = (await import('../../../scripts/release.mjs')) as {
    releaseSteps: (options: { resume: boolean }) => string[][];
  };

  return release.releaseSteps({ resume }).map((step) => step.join(' '));
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
    expect(bump.slice(services + 1, -1)).toEqual([
      'RUN_E2E=1 pnpm test',
      'pnpm test:int:pg test/database/int.spec.ts test/search/postgres',
      'pnpm test:int:mongo test/database/int.spec.ts test/search/mongodb test/kv/mongo-native.int.spec.ts',
    ]);
    expect(bump.at(-1)).toBe('node scripts/bump.mjs minor');
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
    'release (resume: %s) builds, checks dist imports, then publishes without rerunning the tests bump already ran',
    async (resume) => {
      expect(scripts.release).toBe('node scripts/release.mjs');

      const release = await releaseSteps(resume);

      const build = release.indexOf('pnpm build');
      const check = release.indexOf('pnpm check dist-imports');

      expect(build).toBeGreaterThanOrEqual(0);
      expect(check).toBe(build + 1);
      expect(release[check + 1]).toBe(
        'pnpm -r publish --access public --no-git-checks --report-summary',
      );
      expect(release.at(-1)).toBe('pnpm release:status');
      expect(release.some((step) => step.includes('test'))).toBe(false);
    },
  );

  it('release --resume skips the install', async () => {
    expect(await releaseSteps(false)).toContain('pnpm install --frozen-lockfile');
    expect(await releaseSteps(true)).not.toContain('pnpm install --frozen-lockfile');
  });

  it('docker:start starts every service profile and waits for them', () => {
    expect(scripts['docker:start']).toBe(
      'docker compose -f test/docker-compose.yml --profile postgres --profile redis --profile mongodb --profile mongodb-search --profile storage up -d --wait --wait-timeout 120',
    );
  });

  it('the root has 25 commands plus the git hook scripts', () => {
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
