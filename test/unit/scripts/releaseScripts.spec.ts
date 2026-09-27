import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const { scripts } = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };

function steps(script: string): string[] {
  return scripts[script].split('&&').map((step) => step.trim());
}

describe('release scripts', () => {
  it('bump builds, starts services, and tests before bumping versions', async () => {
    expect(scripts.bump).toBe('node scripts/prerelease.mjs');

    const { STEPS } = (await import('../../../scripts/prerelease.mjs')) as {
      STEPS: { name: string; run: string[] | ((bump: string) => string[]) }[];
    };
    const bump = STEPS.map((step) =>
      (typeof step.run === 'function' ? step.run('minor') : step.run).join(' '),
    );

    const build = bump.indexOf('pnpm build');
    const services = bump.indexOf('pnpm test:services');
    const test = bump.indexOf('pnpm test:release');

    expect(build).toBeGreaterThanOrEqual(0);
    expect(services).toBeGreaterThan(build);
    expect(test).toBeGreaterThan(services);
    expect(bump.at(-1)).toBe('node scripts/bump.mjs minor');
  });

  it('release builds and publishes without rerunning the tests bump already ran', () => {
    const release = steps('release');

    expect(release.indexOf('pnpm publish-packages')).toBeGreaterThan(release.indexOf('pnpm build'));
    expect(release).not.toContain('pnpm test:release');
  });

  it('test:release runs every project with live suites on, then the Postgres and Mongo suites', () => {
    expect(steps('test:release')).toEqual([
      'RUN_E2E=1 vitest run',
      'pnpm test:int:db:pg',
      'pnpm test:int:db:mongo',
    ]);
  });
});
