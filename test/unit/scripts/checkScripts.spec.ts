import { describe, expect, it } from 'vitest';

import { checkScripts, tableScripts } from '../../../scripts/check-scripts.mjs';

function manifest(scripts: Record<string, string>) {
  return JSON.stringify({ name: 'pkg', scripts }, null, 2);
}

function contributing(...rows: string[]) {
  return [
    '# Contributing',
    '',
    '## Commands',
    '',
    '| Task | Command |',
    '| ---- | ------- |',
    ...rows,
    '',
    '## Next',
    '',
    '| Elsewhere | `pnpm elsewhere` |',
  ].join('\n');
}

function check({
  scripts,
  rows,
  packages = [],
}: {
  scripts: Record<string, string>;
  rows: string[];
  packages?: { file: string; scripts: Record<string, string> }[];
}) {
  return checkScripts({
    root: { file: 'package.json', source: manifest(scripts) },
    contributing: { file: 'CONTRIBUTING.md', source: contributing(...rows) },
    packages: packages.map(({ file, scripts: found }) => ({ file, source: manifest(found) })),
  }) as string[];
}

describe('tableScripts', () => {
  it('reads pnpm scripts from the Command column of the Commands table only', () => {
    const table = tableScripts(
      contributing(
        '| Build | `pnpm install`, `pnpm build`, `pnpm --filter <name> typecheck` |',
        '| Test on Postgres | `pnpm test:int:pg test/database` (`pnpm docker:start` first) |',
        '| Format | `pnpm prettier:write && pnpm lint:fix` |',
        '| Release | `pnpm bump <major\\|minor>`, `pnpm release` |',
      ),
    );

    expect([...table]).toEqual([
      ['build', 7],
      ['test:int:pg', 8],
      ['docker:start', 8],
      ['prettier:write', 9],
      ['lint:fix', 9],
      ['bump', 10],
      ['release', 10],
    ]);
  });
});

describe('checkScripts', () => {
  it('rejects the undocumented test:services root script from 9745fcdb', () => {
    const problems = check({
      scripts: {
        'test:services':
          'docker compose -f test/docker-compose.yml --profile postgres --profile redis --profile mongodb --profile mongodb-search --profile storage up -d --wait --wait-timeout 120',
      },
      rows: [],
    });

    expect(problems).toEqual([
      `package.json:4 script "test:services" has no row in CONTRIBUTING.md's command table`,
    ]);
  });

  it('rejects the generate:ai-types table row from 3fe6c693 once the script is gone', () => {
    const problems = check({
      scripts: { 'sync:catalog': 'node scripts/sync-catalog.mjs' },
      rows: [
        '| Regenerate AI model catalog types | `pnpm generate:ai-types`, `pnpm sync:catalog` |',
      ],
    });

    expect(problems).toEqual(['CONTRIBUTING.md:7 `pnpm generate:ai-types` is not a root script']);
  });

  it("rejects gateway's package test scripts from 3fe6c693", () => {
    const problems = check({
      scripts: {},
      rows: [],
      packages: [
        {
          file: 'packages/gateway/package.json',
          scripts: {
            build: 'node ../../scripts/build-package.mjs',
            clean: 'rm -rf dist',
            'test:e2e:zen': 'RUN_E2E=1 vitest run --root ../.. --project=gateway-zen',
            typecheck: 'tsc --noEmit',
          },
        },
      ],
    });

    expect(problems).toEqual([
      'packages/gateway/package.json:6 script "test:e2e:zen" is not allowed (packages have only build, clean, typecheck)',
    ]);
  });

  it('accepts documented root scripts, the git hook scripts and the three package scripts', () => {
    const problems = check({
      scripts: { build: 'pnpm -r build', 'lint-staged': 'lint-staged', prepare: 'husky' },
      rows: ['| Build | `pnpm install`, `pnpm build` |'],
      packages: [
        {
          file: 'packages/sdk/package.json',
          scripts: { build: 'node build.mjs', clean: 'rm -rf dist', typecheck: 'tsc --noEmit' },
        },
      ],
    });

    expect(problems).toEqual([]);
  });
});
