import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  playwrightProjects,
  READ_ONLY,
  repoScratchDirs,
  sourceTests,
  unassignedSpecs,
  unresetSuites,
  vitestProjects,
} from '../../../scripts/check-tests.mjs';
import vitestConfig from '../../../vitest.config';

const root = path.resolve(import.meta.dirname, '../../..');

const vitest = vitestProjects(vitestConfig);

const playwright = playwrightProjects(
  {
    testDir: path.join(root, 'test/browser'),
    testMatch: '*.browser.spec.ts',
    projects: [
      { name: 'question-setup', testMatch: 'auth.setup.ts' },
      { name: 'question', testMatch: ['question.browser.spec.ts', 'money.browser.spec.ts'] },
      { name: 'rich-text', testMatch: /richText\.browser\.spec\.ts$/ },
    ],
  },
  'test/browser/playwright.config.ts',
);

function unassigned(files: string[], projects = vitest) {
  return unassignedSpecs({ files, vitest: projects, playwright, root });
}

function unreset(sources: Record<string, string>, readOnly: Record<string, string> = {}) {
  return unresetSuites({
    files: Object.keys(sources),
    read: (file: string) => sources[file],
    readOnly,
  });
}

function scratch(source: string) {
  return repoScratchDirs({ file: 'test/x.spec.ts', source });
}

const boot = `
  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });
`;

const reset = `
  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });
`;

describe('test files under src', () => {
  it('rejects packages/frogbot/src/kv/index.test-d.ts from b2378a74', () => {
    expect(sourceTests(['packages/frogbot/src/kv/index.test-d.ts'])).toEqual([
      {
        file: 'packages/frogbot/src/kv/index.test-d.ts',
        message: 'test file under src: move it to test/unit/<package>/',
      },
    ]);
  });

  it('rejects specs and tests in plugin sources', () => {
    expect(
      sourceTests([
        'packages/plugins/plugin-roles/src/allow.test-d.ts',
        'packages/ui/src/Button.spec.tsx',
        'packages/frogbot/src/index.test.ts',
      ]).map(({ file }) => file),
    ).toEqual([
      'packages/plugins/plugin-roles/src/allow.test-d.ts',
      'packages/ui/src/Button.spec.tsx',
      'packages/frogbot/src/index.test.ts',
    ]);
  });

  it('allows type tests under test/ and specs outside src', () => {
    expect(
      sourceTests([
        'test/unit/frogbot/kv/index.test-d.ts',
        'packages/frogbot/scripts/x.spec.ts',
        'packages/frogbot/src/testing.ts',
      ]),
    ).toEqual([]);
  });
});

describe('specs in no project', () => {
  it('rejects test/jobs/baseline.spec.ts from cd82efaf', () => {
    expect(unassigned(['test/jobs/baseline.spec.ts'])).toEqual([
      {
        file: 'test/jobs/baseline.spec.ts',
        message: 'spec matches no vitest or Playwright project',
      },
    ]);
  });

  it('rejects test/gateway/int.spec.ts under the gateway include of db1ce399', () => {
    const before = vitest.map((project) =>
      project.name === 'gateway-integration'
        ? { ...project, include: ['test/gateway/**/*.int.spec.ts'] }
        : project,
    );

    expect(unassigned(['test/gateway/int.spec.ts'], before)).toHaveLength(1);
    expect(unassigned(['test/gateway/int.spec.ts'])).toEqual([]);
  });

  it('accepts specs every vitest project includes', () => {
    expect(
      unassigned([
        'test/unit/scripts/checkTests.spec.ts',
        'test/ui/ui/chat/Composer.spec.tsx',
        'test/jobs/limited-claims.int.spec.ts',
        'test/e2e/scaffold.e2e.spec.ts',
        'test/gateway/golden.spec.ts',
        'test/live/models.live.spec.ts',
      ]),
    ).toEqual([]);
  });

  it('honours a project exclude', () => {
    expect(unassigned(['test/unit/gateway/node_modules/x.spec.ts'])).toHaveLength(1);
  });

  it('accepts browser specs a Playwright project lists by name or pattern', () => {
    expect(
      unassigned(['test/browser/money.browser.spec.ts', 'test/browser/richText.browser.spec.ts']),
    ).toEqual([]);
  });

  it('rejects a browser spec that only the root testMatch covers', () => {
    expect(unassigned(['test/browser/navShell.browser.spec.ts'])).toEqual([
      {
        file: 'test/browser/navShell.browser.spec.ts',
        message: 'spec matches no vitest or Playwright project',
      },
    ]);
  });

  it('ignores files that are not specs', () => {
    expect(unassigned(['test/browser/auth.setup.ts', 'test/jobs/fixture.ts'])).toEqual([]);
  });

  it('refuses vitest projects it cannot match', () => {
    expect(() => vitestProjects({ test: { projects: ['packages/*'] } })).toThrow(
      'only inline projects',
    );
  });
});

describe('int specs that boot without a reset', () => {
  it('rejects test/audit-log/int.spec.ts from 972f2bc8', () => {
    const source = `import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';

describe('audit log plugin integration', () => {
  let booted: BootedFrogBot;
  let accountId: number | string;
  let authorization: Record<string, string>;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
    const account = await booted.restClient.post<{ doc: { id: number | string } }>(
      '/api/accounts',
      credentials,
    );
`;

    expect(unreset({ 'test/audit-log/int.spec.ts': source })).toEqual([
      {
        file: 'test/audit-log/int.spec.ts',
        line: 9,
        message:
          'calls bootFrogBot without clearAndSeed: reset in beforeEach, or add it to READ_ONLY if its tests only read',
      },
    ]);
  });

  it('accepts a spec that resets with clearAndSeed', () => {
    expect(unreset({ 'test/auth/int.spec.ts': boot + reset })).toEqual([]);
  });

  it('accepts a reset through a helper the spec imports', () => {
    expect(
      unreset({
        'test/system-fields/users.int.spec.ts': `import { clearAndNumber } from './boot.js';\n${boot}`,
        'test/system-fields/boot.ts': `export async function clearAndNumber(frogbot) {\n  await clearAndSeed(frogbot, 'empty');\n}`,
      }),
    ).toEqual([]);
  });

  it('does not count importing the clearAndSeed definition as a reset', () => {
    expect(
      unreset({
        'test/x/int.spec.ts': `import { clearAndSeed } from '../__helpers/shared/clearAndSeed';\n${boot}`,
        'test/__helpers/shared/clearAndSeed/index.ts': `export async function clearAndSeed(frogbot, scenario) {}`,
      }),
    ).toHaveLength(1);
  });

  it('accepts a read-only spec and ignores specs that do not boot', () => {
    expect(
      unreset(
        { 'test/a/int.spec.ts': boot, 'test/b/int.spec.ts': `it('x', () => {});` },
        { 'test/a/int.spec.ts': 'reads only' },
      ),
    ).toEqual([]);
  });

  it('rejects READ_ONLY entries that reset, do not boot, or are gone', () => {
    expect(
      unreset(
        { 'test/a/int.spec.ts': boot + reset, 'test/b/int.spec.ts': `it('x', () => {});` },
        { 'test/a/int.spec.ts': 'x', 'test/b/int.spec.ts': 'x', 'test/c/int.spec.ts': 'x' },
      ).map(({ file, message }) => `${file} ${message}`),
    ).toEqual([
      'test/a/int.spec.ts calls clearAndSeed: remove it from READ_ONLY',
      'test/b/int.spec.ts listed in READ_ONLY but is not a tracked bootFrogBot spec',
      'test/c/int.spec.ts listed in READ_ONLY but is not a tracked bootFrogBot spec',
    ]);
  });

  it('gives every READ_ONLY entry a reason', () => {
    for (const reason of Object.values(READ_ONLY)) expect(reason).toMatch(/\w/);
  });
});

describe('mkdtemp scratch folders', () => {
  it('rejects the bump.spec.ts scratch folder from 322bd1bf', () => {
    const source = `const repo = fileURLToPath(new URL('../../../', import.meta.url));
const testRoot = join(repo, 'test/unit/scripts');

beforeEach(async () => {
  temporary = realpathSync(mkdtempSync(join(testRoot, '.bump-')));
});`;

    expect(scratch(source)).toEqual([
      {
        file: 'test/x.spec.ts',
        line: 5,
        message:
          'mkdtemp outside os.tmpdir() or test/.tmp/: scratch folders inside the repo break lint',
      },
    ]);
  });

  it('rejects the connections-ui app folder from 00b86c61', () => {
    const source = `const root = resolve(import.meta.dirname, '../..');
const app = await mkdtemp(join(root, 'examples/.connections-ui-'));`;

    expect(scratch(source)).toHaveLength(1);
  });

  it('rejects a scratch folder under .idea/tmp', () => {
    expect(
      scratch(`const tempRoot = join(repoRoot, '.idea', 'tmp');
const dir = mkdtempSync(join(tempRoot, 'docs-fences-'));`),
    ).toHaveLength(1);
  });

  it.each([
    ["mkdtempSync(path.join(os.tmpdir(), 'frogbot-ui-'))"],
    ["await mkdtemp(join(tmpdir(), 'frogbot-session-'))"],
    ["realpathSync(mkdtempSync(join(tmpdir(), 'frogbot-with-frogbot-')))"],
    ["mkdtemp(path.join(root, 'test', '.tmp', 'build-package-'))"],
    [
      "const tempRoot = join(repoRoot, 'test/.tmp');\nconst cwd = await mkdtemp(join(tempRoot, 'graphql-bin-'));",
    ],
    [
      "const parent = path.join(repoRoot, 'test', '.tmp');\nconst root = fs.mkdtempSync(path.join(parent, 'skill-installation-'));",
    ],
  ])('accepts %s', (source) => {
    expect(scratch(source)).toEqual([]);
  });

  it('ignores the mkdtemp import', () => {
    expect(scratch("import { mkdtemp, rm } from 'node:fs/promises';")).toEqual([]);
  });
});
