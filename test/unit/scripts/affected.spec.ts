import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { discoverChecks } from '../../../scripts/check.mjs';
import {
  affectedSet,
  CHECK_INPUTS,
  formatList,
  levelReached,
  testTypeDirs,
  typecheckAreas,
  verifyGroups,
} from '../../../scripts/lib/affected.mjs';
import { runGroups, worktreePatchId } from '../../../scripts/lib/verify.mjs';

const root = path.resolve(import.meta.dirname, '../../..');

function diff(sha: string) {
  return readFileSync(path.join(import.meta.dirname, 'fixtures', 'affected', `${sha}.txt`), 'utf8')
    .split('\n')
    .filter((line) => line.includes('\t'))
    .map((line) => line.split('\t').at(-1) as string);
}

const frogbotAreas = typecheckAreas({
  dir: 'packages/frogbot',
  text: readFileSync(path.join(root, 'packages/frogbot/scripts/typecheck.mjs'), 'utf8'),
});

const packages = [
  { name: 'frogbot', dir: 'packages/frogbot', typecheck: true, areas: frogbotAreas },
  { name: '@frogbotai/next', dir: 'packages/next', typecheck: true },
  { name: '@frogbotai/ui', dir: 'packages/ui', typecheck: true, typeTests: ['test/types/ui'] },
  { name: '@frogbotai/db-sqlite', dir: 'packages/db-sqlite', typecheck: true },
  { name: 'frogbot-test-suite', dir: 'test', typecheck: false },
];

const vitest = [
  {
    name: 'unit',
    specs: [
      'test/unit/frogbot/fields/virtualPaths.spec.ts',
      'test/unit/frogbot/jobs/queue.spec.ts',
      'test/unit/scripts/checkPackages.spec.ts',
      'test/unit/scripts/ticket.spec.ts',
    ],
  },
  { name: 'gateway-unit', specs: [] },
  {
    name: 'ui',
    specs: ['test/ui/next/fields/FieldCell.spec.tsx', 'test/ui/next/elements/Nav/Nav.spec.tsx'],
  },
  {
    name: 'int',
    specs: [
      'test/database/sqlite-busy.int.spec.ts',
      'test/fields/int.spec.ts',
      'test/jobs/queue.int.spec.ts',
    ],
  },
];

const browser = {
  projects: [
    {
      name: 'question',
      fixture: 'test/browser/fixtures/question',
      specs: [
        'test/browser/fieldCell.browser.spec.ts',
        'test/browser/virtualPaths.browser.spec.ts',
      ],
    },
    {
      name: 'question-webkit',
      fixture: 'test/browser/fixtures/question',
      specs: ['test/browser/fieldCell.browser.spec.ts'],
    },
    { name: 'blank', fixture: 'templates/blank', specs: ['test/browser/navShell.browser.spec.ts'] },
    {
      name: 'plugin-seo',
      fixture: 'test/e2e/fixtures/plugin-wrappers',
      specs: ['test/browser/seoFields.browser.spec.ts'],
    },
  ],
  infrastructure: ['test/browser/playwright.config.ts', 'test/browser/buildFixtures.mjs'],
  imports: {
    'test/browser/navShell.browser.spec.ts': ['test/browser/__helpers/nav.ts'],
  },
  fixturePackages: {
    'test/browser/fixtures/question': ['@frogbotai/next', '@frogbotai/ui', 'frogbot'],
    'templates/blank': ['@frogbotai/next', '@frogbotai/ui', 'frogbot'],
    'test/e2e/fixtures/plugin-wrappers': ['frogbot'],
  },
};

const checks = Object.keys(CHECK_INPUTS);

const map = (files: string[], related: object[] = []) =>
  affectedSet({ files, packages, vitest, related, browser, checks });

describe('affectedSet on past commits', () => {
  it('maps da7ba14f (virtual path fields) to packages, areas, specs, projects and checks', () => {
    const set = map(diff('da7ba14f'));

    expect(set.typecheck).toEqual([
      { name: '@frogbotai/next', areas: [] },
      { name: 'frogbot', areas: ['source', 'fields'] },
    ]);
    expect(set.specs).toEqual({
      unit: ['test/unit/frogbot/fields/virtualPaths.spec.ts'],
      'gateway-unit': [],
      ui: ['test/ui/next/fields/FieldCell.spec.tsx'],
      int: ['test/fields/int.spec.ts'],
    });
    expect(set.browser).toEqual(['question', 'question-webkit', 'blank', 'plugin-seo']);
    expect(set.checks).toEqual([
      'branding',
      'dist-imports',
      'docs-fences',
      'docs-links',
      'docs-references',
      'option-tables',
      'tests',
    ]);
    expect(set.uncovered).toEqual([]);
  });

  it('credits 5650d419 (db-sqlite busy recovery) to the specs whose imports reach each file', () => {
    const files = diff('5650d419');

    expect(map(files).uncovered).toEqual([
      'packages/db-sqlite/src/index.ts',
      'packages/db-sqlite/src/recoverFromBusy.ts',
    ]);

    const related = [
      {
        project: 'int',
        spec: 'test/jobs/queue.int.spec.ts',
        sources: ['packages/db-sqlite/src/recoverFromBusy.ts'],
      },
    ];
    const set = map(files, related);

    expect(set.typecheck).toEqual([{ name: '@frogbotai/db-sqlite', areas: [] }]);
    expect(set.specs.int).toEqual([
      'test/database/sqlite-busy.int.spec.ts',
      'test/jobs/queue.int.spec.ts',
    ]);
    expect(set.browser).toEqual([]);
    expect(set.uncovered).toEqual(['packages/db-sqlite/src/index.ts']);
  });

  it('maps 4453eeaf (check packages) to its spec and the checks that read its files', () => {
    const set = map(diff('4453eeaf'));

    expect(set.typecheck).toEqual([]);
    expect(set.specs.unit).toEqual(['test/unit/scripts/checkPackages.spec.ts']);
    expect(set.checks).toEqual(['packages', 'scripts', 'tests']);
    expect(set.uncovered).toEqual([]);
  });
});

describe('affectedSet', () => {
  it('picks browser projects by fixture and by spec import', () => {
    expect(map(['test/browser/fixtures/question/shared.ts']).browser).toEqual([
      'question',
      'question-webkit',
    ]);
    expect(map(['test/browser/__helpers/nav.ts']).browser).toEqual(['blank']);
    expect(map(['packages/ui/src/Button.tsx']).browser).toEqual([
      'question',
      'question-webkit',
      'blank',
    ]);
  });

  it('runs no int spec or browser project that land would not run', () => {
    const related = [
      { project: 'int', spec: 'test/fields/int.spec.ts', sources: ['scripts/lib/workspace.mjs'] },
    ];
    const set = map(['scripts/lib/workspace.mjs'], related);

    expect(set.specs.int).toEqual([]);
    expect(set.uncovered).toEqual(['scripts/lib/workspace.mjs']);
    expect(map(['packages/frogbot/src/fields/index.ts']).browser).toEqual([]);
  });

  it('covers a type test by the typecheck that runs it, and source by tests only', () => {
    const set = map([
      'test/types/jobs/native.test-d.ts',
      'test/types/ui/props.test-d.ts',
      'packages/frogbot/src/chat/stream.ts',
    ]);

    expect(set.typecheck).toEqual([
      { name: '@frogbotai/ui', areas: [] },
      { name: 'frogbot', areas: ['source', 'jobs'] },
    ]);
    expect(set.uncovered).toEqual(['packages/frogbot/src/chat/stream.ts']);
  });

  it('maps a package index and a skills folder to their mirrors and area', () => {
    expect(map(['packages/next/src/fields/FieldCell/index.client.tsx']).specs.ui).toEqual([
      'test/ui/next/fields/FieldCell.spec.tsx',
    ]);
    expect(map(['packages/frogbot/src/skills/load.ts']).typecheck).toEqual([
      { name: 'frogbot', areas: ['source', 'skill'] },
    ]);
  });
});

describe('typecheck areas', () => {
  it("reads every area of frogbot's typecheck table", () => {
    expect([...new Set(frogbotAreas.map(({ area }) => area))]).toEqual([
      'source',
      'typetest',
      'skill',
      'pieces',
      'jobs',
      'email',
      'fields',
      'collections',
      'live-preview',
      'admin',
      'ai',
      'auth',
      'search',
      'duplicate',
    ]);
    expect(frogbotAreas.find(({ area }) => area === 'jobs')?.dir).toBe('test/types/jobs');
  });

  it('reads the type-test folders a typecheck script runs', () => {
    expect(
      testTypeDirs(
        'tsc --noEmit && tsc -p ../../test/types/sdk/tsconfig.generated.json && tsc -p ../../test/types/sdk/tsconfig.fallback.json',
      ),
    ).toEqual(['test/types/sdk']);
  });
});

describe('CHECK_INPUTS', () => {
  it('lists every repo check', () => {
    expect(Object.keys(CHECK_INPUTS).sort()).toEqual(discoverChecks());
  });
});

describe('verifyGroups', () => {
  const groups = verifyGroups(map(diff('da7ba14f')));

  it('turns the set into commands, cheapest group first', () => {
    expect(groups.map(({ group }) => group)).toEqual([
      'typecheck',
      'checks',
      'unit',
      'ui',
      'int',
      'browser',
    ]);
    expect(groups[0].commands).toEqual([
      ['pnpm', '--filter', '@frogbotai/next', 'typecheck'],
      ['pnpm', '--filter', 'frogbot', 'typecheck', 'source', 'fields'],
    ]);
    expect(groups[4].commands).toEqual([['pnpm', 'test:int:sqlite', 'test/fields/int.spec.ts']]);
  });

  it('reaches the highest level of the groups that passed', () => {
    expect(levelReached(groups)).toBe('int');
    expect(levelReached(groups.slice(0, 2))).toBe('typecheck');
    expect(levelReached([])).toBeNull();
  });

  it('lists the set with its tier and uncovered files', () => {
    const lines = formatList({ tier: 'light', groups: groups.slice(2, 3), uncovered: ['a.txt'] });

    expect(lines).toEqual([
      'tier: light',
      'unit       pnpm test:unit (1)',
      '             test/unit/frogbot/fields/virtualPaths.spec.ts',
      'uncovered  a.txt',
    ]);
  });
});

describe('runGroups', () => {
  const log = path.join(os.tmpdir(), `verify-${process.pid}.log`);
  const build = async () => ({ ok: true, groups: [] });
  const pass = ['node', '-e', ''];
  const fail = ['node', '-e', 'process.exit(3)'];

  afterEach(() => rmSync(log, { force: true }));

  it('fails on the first red command and skips the groups after it', async () => {
    writeFileSync(log, '');

    const result = await runGroups({
      root,
      log,
      build,
      groups: [
        { group: 'typecheck', level: 'typecheck', commands: [pass] },
        { group: 'unit', level: 'unit', commands: [fail] },
        { group: 'int', level: 'int', commands: [pass] },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.passed.map(({ group }) => group)).toEqual(['typecheck']);
    expect(result.failed).toMatchObject({ group: 'unit', command: fail.join(' ') });
  });

  it('passes when every command passes', async () => {
    writeFileSync(log, '');

    const result = await runGroups({
      root,
      log,
      build,
      groups: [{ group: 'unit', level: 'unit', commands: [pass, pass] }],
    });

    expect(result).toMatchObject({ ok: true, failed: null });
  });
});

describe('worktreePatchId', () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  let repo = '';

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('equals the patch-id of the committed change, untracked files included', () => {
    repo = mkdtempSync(path.join(os.tmpdir(), 'verify-patch-'));

    git(repo, 'init', '--quiet', '--initial-branch=main');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    writeFileSync(path.join(repo, 'a.txt'), 'one\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '--quiet', '-m', 'chore: start');
    git(repo, 'switch', '--quiet', '-c', 'work');
    writeFileSync(path.join(repo, 'a.txt'), 'two\n');
    writeFileSync(path.join(repo, 'b.txt'), 'new\n');

    const before = worktreePatchId(repo);

    git(repo, 'add', '.');
    git(repo, 'commit', '--quiet', '-m', 'feat: change');

    const committed = execFileSync('git', ['patch-id', '--stable'], {
      cwd: repo,
      input: git(repo, 'diff', 'main...HEAD') + '\n',
      encoding: 'utf8',
    }).split(' ')[0];

    expect(before).toBe(committed);
    expect(worktreePatchId(repo)).toBe(committed);
  });
});
