import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { publishablePackages } from '../../../scripts/lib/workspace.mjs';

const { scripts } = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };

function steps(script: string): string[] {
  return scripts[script].split('&&').map((step) => step.trim());
}

describe('release scripts', () => {
  it('bump builds, checks dist imports, starts services, and tests before bumping versions', async () => {
    expect(scripts.bump).toBe('node scripts/prerelease.mjs');

    const { STEPS } = (await import('../../../scripts/prerelease.mjs')) as {
      STEPS: { name: string; run: string[] | ((bump: string) => string[]) }[];
    };
    const bump = STEPS.map((step) =>
      (typeof step.run === 'function' ? step.run('minor') : step.run).join(' '),
    );

    const build = bump.indexOf('pnpm build');
    const check = bump.indexOf('pnpm check:dist-imports');
    const services = bump.indexOf('pnpm test:services');
    const test = bump.indexOf('pnpm test:release');

    expect(build).toBeGreaterThanOrEqual(0);
    expect(check).toBe(build + 1);
    expect(services).toBeGreaterThan(check);
    expect(test).toBeGreaterThan(services);
    expect(bump.at(-1)).toBe('node scripts/bump.mjs minor');
  });

  it('bump checks for a single frogbot install before building', async () => {
    const { STEPS } = (await import('../../../scripts/prerelease.mjs')) as {
      STEPS: { name: string; run: string[] | ((bump: string) => string[]) }[];
    };
    const bump = STEPS.map((step) =>
      (typeof step.run === 'function' ? step.run('minor') : step.run).join(' '),
    );

    const install = bump.indexOf('pnpm install --frozen-lockfile');
    const check = bump.indexOf('pnpm check:single-frogbot');

    expect(install).toBeGreaterThanOrEqual(0);
    expect(check).toBe(install + 1);
    expect(check).toBeLessThan(bump.indexOf('pnpm build'));
  });

  it.each(['release', 'release:resume'])(
    '%s builds, checks dist imports, then publishes without rerunning the tests bump already ran',
    (script) => {
      const release = steps(script);

      const build = release.indexOf('pnpm build');
      const check = release.indexOf('pnpm check:dist-imports');

      expect(build).toBeGreaterThanOrEqual(0);
      expect(check).toBe(build + 1);
      expect(release.indexOf('pnpm publish-packages')).toBe(check + 1);
      expect(release).not.toContain('pnpm test:release');
    },
  );

  it('check:dist-imports runs the exact-case import check', () => {
    expect(scripts['check:dist-imports']).toBe('node scripts/check-dist-imports.mjs');
  });

  it('check:single-frogbot runs the manifest check', () => {
    expect(scripts['check:single-frogbot']).toBe('node scripts/check-single-frogbot.mjs');
  });

  it('every publishable package removes dist before building', () => {
    const builds = publishablePackages().map(({ dir, name }) => {
      const manifest = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')) as {
        scripts?: Record<string, string>;
      };

      return { build: manifest.scripts?.build, name };
    });

    const unclean = builds.filter(({ build }) => !build?.startsWith('rm -rf dist && '));

    expect(builds.length).toBeGreaterThan(0);
    expect(unclean).toEqual([]);
  });

  it('test:release runs every project with live suites on, then the Postgres and Mongo suites', () => {
    expect(steps('test:release')).toEqual([
      'RUN_E2E=1 vitest run',
      'pnpm test:int:db:pg',
      'pnpm test:int:db:mongo',
    ]);
  });
});
