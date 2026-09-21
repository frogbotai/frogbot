import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const { scripts } = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };

describe('release scripts', () => {
  it.each([
    { script: 'bump', action: 'node scripts/bump.mjs' },
    { script: 'release', action: 'pnpm publish-packages' },
  ])('$script builds before testing and tests before $action', ({ script, action }) => {
    const steps = scripts[script].split('&&').map((step) => step.trim());
    const build = steps.indexOf('pnpm build');
    const test = steps.indexOf('pnpm test');

    expect(build).toBeGreaterThanOrEqual(0);
    expect(test).toBeGreaterThan(build);
    expect(steps.indexOf(action)).toBeGreaterThan(test);
  });
});
