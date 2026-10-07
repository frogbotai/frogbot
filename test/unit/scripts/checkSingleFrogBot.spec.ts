import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkSingleFrogBot } from '../../../scripts/check-single-frogbot.mjs';

type Problem = { name: string; field: string };

let dir: string;

function manifest(name: string, fields: Record<string, unknown> = {}) {
  const target = join(dir, name);

  mkdirSync(target, { recursive: true });

  writeFileSync(
    join(target, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', ...fields }),
  );

  return { dir: target, name, version: '1.0.0' };
}

function check(...packages: ReturnType<typeof manifest>[]): Problem[] {
  return checkSingleFrogBot({ packages }) as Problem[];
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'check-single-frogbot-'));
});

afterEach(() => {
  rmSync(dir, { force: true, recursive: true });
});

describe('checkSingleFrogBot', () => {
  it('reports a package that installs frogbot as a regular dependency', () => {
    const pkg = manifest('shared', { dependencies: { frogbot: '1.0.0' } });

    const problems = check(pkg);

    expect(problems).toEqual([{ name: 'shared', field: 'dependencies.frogbot' }]);
  });

  it('reports a package that installs frogbot as an optional dependency', () => {
    const pkg = manifest('shared', { optionalDependencies: { frogbot: '1.0.0' } });

    const problems = check(pkg);

    expect(problems).toEqual([{ name: 'shared', field: 'optionalDependencies.frogbot' }]);
  });

  it('accepts a package that lists frogbot as a peer and a dev dependency', () => {
    const pkg = manifest('shared', {
      peerDependencies: { frogbot: '1.0.0' },
      peerDependenciesMeta: { frogbot: { optional: true } },
      devDependencies: { frogbot: '1.0.0' },
    });

    const problems = check(pkg);

    expect(problems).toEqual([]);
  });

  it('reports framework peers on core frogbot', () => {
    const core = manifest('frogbot', {
      peerDependencies: { '@ai-sdk/otel': '^1.0.0', next: '^15.4.10', react: '^19.0.0' },
    });

    const problems = check(core);

    expect(problems).toEqual([
      { name: 'frogbot', field: 'peerDependencies.next' },
      { name: 'frogbot', field: 'peerDependencies.react' },
    ]);
  });

  it('accepts core frogbot with a next dev dependency and an optional non-framework peer', () => {
    const core = manifest('frogbot', {
      peerDependencies: { '@ai-sdk/otel': '^1.0.0' },
      peerDependenciesMeta: { '@ai-sdk/otel': { optional: true } },
      devDependencies: { next: '15.4.10' },
    });

    const problems = check(core);

    expect(problems).toEqual([]);
  });

  it('passes every publishable package in the repository', () => {
    const problems = checkSingleFrogBot();

    expect(problems).toEqual([]);
  });
});
