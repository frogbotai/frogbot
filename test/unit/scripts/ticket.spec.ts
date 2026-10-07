import { describe, expect, it } from 'vitest';

import {
  affectedRuns,
  docsOnly,
  landGates,
  markdownSpecs,
} from '../../../scripts/lib/affected.mjs';
import {
  branchName,
  dockerUp,
  downServices,
  expandBraces,
  formatTable,
  hasTesterRow,
  keyOfWorktree,
  landLevel,
  lanes,
  ledgerLine,
  nextNumber,
  parseArgs,
  parseHeader,
  parseLedger,
  parseReflogMerges,
  parseTouches,
  parseWorktrees,
  slugOf,
  squashMessage,
  stageOf,
  statusRow,
  tail,
  ticketGit,
  ticketKeyOf,
  ticketOfBranch,
  tierOf,
  untilMainSettles,
  worktreePath,
} from '../../../scripts/ticket.mjs';

const header = (line: string) => `# Ticket 999 — Scratch\n\n${line}\n\n## Summary\n`;

describe('parseArgs', () => {
  it('reads each command', () => {
    expect(parseArgs(['new', '999', '--type', 'chore'])).toEqual({
      command: 'new',
      ticket: 999,
      type: 'chore',
    });

    expect(parseArgs(['--', 'land', '999'])).toEqual({ command: 'land', ticket: 999 });

    expect(parseArgs(['status', '--batch', '28'])).toEqual({ command: 'status', batch: 28 });
    expect(parseArgs(['status', '--batch', 'deferred'])).toEqual({
      command: 'status',
      batch: 'deferred',
    });

    expect(parseArgs(['next'])).toEqual({ command: 'next' });
  });

  it('reads a part key, in either case', () => {
    expect(parseArgs(['land', '210B'])).toEqual({ command: 'land', ticket: 210, part: 'b' });
    expect(parseArgs(['new', '212b'])).toEqual({
      command: 'new',
      ticket: 212,
      part: 'b',
      type: 'feat',
    });
  });

  it('reads stats and found', () => {
    expect(parseArgs(['stats', '--batch', '27'])).toEqual({ command: 'stats', batch: 27 });
    expect(parseArgs(['found', '--source', 'x.md'])).toEqual({ command: 'found', source: 'x.md' });
  });

  it('reads verify and its --list switch', () => {
    expect(parseArgs(['verify'])).toEqual({ command: 'verify' });
    expect(parseArgs(['verify', '--list'])).toEqual({ command: 'verify', list: true });
  });

  it('defaults the branch type to feat', () => {
    expect(parseArgs(['new', '999'])).toEqual({ command: 'new', ticket: 999, type: 'feat' });
  });

  it.each([
    [[], 'no command'],
    [['bogus'], 'unknown command "bogus"'],
    [['new'], 'new needs one ticket number'],
    [['new', 'abc'], '"abc" is not a ticket number'],
    [['new', '999', '--type', 'feature'], '--type "feature" is not one of'],
    [['land', '999', '--type', 'fix'], 'land takes no --type'],
    [['land', '999', '-m', 'chore: scratch'], 'unknown argument "-m"'],
    [['next', '5'], 'next takes no arguments'],
    [['status', '--batch', 'soon'], '--batch "soon" is not a batch'],
    [['status', '--all'], 'unknown argument "--all"'],
    [['land', '210bc'], '"210bc" is not a ticket number'],
    [['found', 'bug · land · `pnpm test:ui`'], 'found reads its row from stdin, not an argument'],
    [['stats', '27'], 'stats takes no arguments'],
    [['verify', '236'], 'verify takes no arguments'],
    [['land', '236', '--list'], 'land takes no --list'],
  ])('rejects %j', (argv, error) => {
    expect(parseArgs(argv)).toMatchObject({ error: expect.stringContaining(error) });
  });
});

describe('parseHeader', () => {
  it('reads Depends on and Batch from the header line', () => {
    expect(parseHeader(header('Plan: — · Depends on: 215, 216 · Batch: 29'))).toEqual({
      line: 3,
      depends: [215, 216],
      batch: 29,
      problems: [],
    });
  });

  it('accepts none and deferred', () => {
    expect(parseHeader(header('Plan: — · Depends on: none · Batch: deferred'))).toMatchObject({
      depends: [],
      batch: 'deferred',
      problems: [],
    });

    expect(parseHeader(header('Plan: — · Depends on: none · Batch: none'))?.batch).toBe('none');
  });

  it('skips older tickets with no Batch field', () => {
    expect(parseHeader('# Ticket 12\n\nPlan: x\n\nThe `Batch:` line is new.\n')).toBeNull();
  });

  it('names each bad value', () => {
    expect(parseHeader(header('Plan: — · Depends on: none · Batch: soon'))?.problems).toEqual([
      'Batch: "soon" is not a number, none or deferred',
    ]);

    expect(parseHeader(header('Plan: — · Depends on: 215 and 216 · Batch: 29'))?.problems).toEqual([
      'Depends on: "215 and 216" is not none or ticket numbers like 215, 216',
    ]);

    expect(parseHeader(header('Plan: — · Batch: 29'))?.problems).toEqual(['missing "Depends on:"']);
  });
});

describe('stageOf', () => {
  const none = { research: false, spec: null, plan: null, implement: false, landed: false };

  it.each([
    [{}, 'issue'],
    [{ research: true }, 'research'],
    [{ research: true, spec: '# Spec\n\nStatus: Draft\n' }, 'spec draft'],
    [{ spec: '# Spec\n\nStatus: Approved (2026-10-04)\n' }, 'spec approved'],
    [{ spec: '# Spec\n\nStatus: Approved\n' }, 'spec draft'],
    [{ plan: '# Plan\n\nStatus: Draft\n' }, 'plan draft'],
    [{ plan: '# Plan\n\nStatus: Go (2026-10-04, batch 29)\n' }, 'go'],
    [{ plan: '# Plan\n\nStatus: Go (2026-10-04)\n', implement: true }, 'implement'],
    [{ implement: true, landed: true }, 'landed'],
    [{ landed: true }, 'landed'],
  ])('%j is %s', (docs, stage) => {
    expect(stageOf({ ...none, ...docs })).toBe(stage);
  });
});

describe('parseTouches', () => {
  it('reads an inline list', () => {
    expect(
      parseTouches('touches: [packages/frogbot/src/jobs/runtime.ts, docs/index.mdx]\n'),
    ).toEqual(['packages/frogbot/src/jobs/runtime.ts', 'docs/index.mdx']);
  });

  it('reads backticked paths, expands braces and stops at the next block', () => {
    const plan = [
      '# Plan',
      '',
      'touches:',
      '',
      '- `package.json` (script `ticket`)',
      '- `scripts/ticket.mjs`, `scripts/lib/affected.mjs`',
      '- internal: `packages/frogbot/src/{jobs/sweep,triggers/task}.ts`',
      '- scripts/check.mjs',
      '- CONTRIBUTING.md (one row)',
      '',
      '## Approach',
      '',
      '- `not/a/touch.ts`',
    ].join('\n');

    expect(parseTouches(plan)).toEqual([
      'package.json',
      'scripts/ticket.mjs',
      'scripts/lib/affected.mjs',
      'packages/frogbot/src/jobs/sweep.ts',
      'packages/frogbot/src/triggers/task.ts',
      'scripts/check.mjs',
      'CONTRIBUTING.md',
    ]);
  });

  it('is empty when the plan has no touches line', () => {
    expect(parseTouches('# Plan\n\nStatus: Draft\n')).toEqual([]);
  });

  it('expands every brace group', () => {
    expect(expandBraces('test/{browser,e2e}/fixtures/{a,b}.ts')).toEqual([
      'test/browser/fixtures/a.ts',
      'test/browser/fixtures/b.ts',
      'test/e2e/fixtures/a.ts',
      'test/e2e/fixtures/b.ts',
    ]);
  });
});

describe('tierOf', () => {
  it.each([
    'packages/frogbot/src/jobs/runtime.ts',
    'packages/frogbot/src/collections/config/types.ts',
    'packages/ui/src/exports/chat.ts',
    'packages/storage-s3/src/index.ts',
    'examples/fly-sqlite/src/migrations/index.ts',
    'packages/frogbot/src/ai/access.ts',
    'packages/frogbot/src/chat/channelAccess.ts',
    'packages/frogbot/src/uploads/index.ts',
    'packages/frogbot/src/auth/access/isAdmin.ts',
  ])('%s is full', (file) => {
    expect(tierOf([file])).toBe('full');
  });

  it.each([
    'docs/access-control/overview.mdx',
    'packages/ui/src/components/button.tsx',
    'README.md',
    'docs/index.mdx',
  ])('%s is light', (file) => {
    expect(tierOf([file])).toBe('light');
  });

  it('is full when any path is full', () => {
    expect(tierOf(['README.md', 'packages/frogbot/src/jobs/runtime.ts'])).toBe('full');
  });

  it('is — with no plan', () => {
    expect(tierOf(null)).toBe('—');
  });
});

describe('lanes', () => {
  it('joins tickets that depend on each other or share a path', () => {
    const result = lanes([
      { number: 215, depends: [], touches: ['package.json', '.husky/pre-commit'] },
      { number: 216, depends: [], touches: ['scripts/check.mjs', 'package.json'] },
      { number: 217, depends: [216], touches: ['scripts/check-generated.mjs'] },
      { number: 221, depends: [], touches: ['.github/feature-process/'] },
      { number: 224, depends: [100], touches: ['.idea/_process/archive/**'] },
      { number: 230, depends: [], touches: ['.idea/_process/archive/decisions.md'] },
    ]);

    expect(Object.fromEntries(result)).toEqual({
      215: 'A',
      216: 'A',
      217: 'A',
      221: 'B',
      224: 'C',
      230: 'C',
    });
  });

  it('matches a directory entry against files inside it', () => {
    const result = lanes([
      { number: 1, depends: [], touches: ['.github/feature-process/'] },
      { number: 2, depends: [], touches: ['.github/feature-process/README.md'] },
    ]);

    expect(result.get(1)).toBe(result.get(2));
  });
});

describe('naming', () => {
  it('builds the branch from the folder slug', () => {
    expect(slugOf('ticket999_scratch_folder')).toBe('scratch-folder');
    expect(branchName({ type: 'chore', ticket: 999, slug: 'scratch' })).toBe(
      'chore/ticket-999-scratch',
    );
  });

  it('puts the worktree next to the main checkout, ending in the number', () => {
    expect(worktreePath('/code/frogbot/frogbot', 999)).toBe('/code/frogbot/frogbot-ticket999');
  });

  it('names a part with its letter', () => {
    const key = ticketKeyOf({ ticket: 210, part: 'b' });

    expect(branchName({ type: 'feat', ticket: key, slug: 'kinds' })).toBe('feat/ticket-210b-kinds');
    expect(worktreePath('/code/frogbot/frogbot', key)).toBe('/code/frogbot/frogbot-ticket210b');
    expect(ticketKeyOf({ ticket: 210, part: undefined })).toBe('210');
  });

  it.each([
    [{ path: '/c/frogbot-ticket210b', branch: 'feat/ticket-210b-kinds' }, '210b'],
    [{ path: '/c/frogbot-ticket210', branch: 'feat/ticket-210-kinds' }, '210'],
    [{ path: '/c/elsewhere', branch: 'feat/ticket-212B-bulk' }, '212b'],
    [{ path: '/c/frogbot', branch: 'main' }, null],
  ])('%j has key %s', (tree, key) => {
    expect(keyOfWorktree(tree)).toBe(key);
  });

  it.each([
    ['feat/ticket-218-ticket-cli', 218],
    ['feat/ticket125-connections', 125],
    ['fix/ticket-82', 82],
    ['main', null],
    ['feat/ticketing-5', null],
    ['feat/ticket-210b-kinds', 210],
  ])('%s belongs to ticket %s', (branch, ticket) => {
    expect(ticketOfBranch(branch)).toBe(ticket);
  });
});

describe('nextNumber', () => {
  it('is one more than the highest folder, branch or worktree', () => {
    const folders = ['ticket9_a', 'ticket246_b', 'ticket21_c', 'notes'];

    expect(nextNumber({ folders, branches: ['main'], worktrees: [] })).toBe(247);
    expect(nextNumber({ folders, branches: ['fix/ticket-250-x'], worktrees: [] })).toBe(251);
    expect(
      nextNumber({
        folders,
        branches: [],
        worktrees: [{ path: '/c/frogbot-ticket300', branch: null }],
      }),
    ).toBe(301);
  });
});

describe('git output', () => {
  const porcelain = [
    'worktree /c/frogbot',
    'HEAD ac567a5a',
    'branch refs/heads/main',
    '',
    'worktree /c/frogbot-ticket218',
    'HEAD ac567a5a',
    'branch refs/heads/feat/ticket-218-ticket-cli',
    '',
    'worktree /c/frogbot-ticket219',
    'HEAD ac567a5a',
    'detached',
    '',
  ].join('\n');

  it('parses worktrees', () => {
    expect(parseWorktrees(porcelain)).toEqual([
      { path: '/c/frogbot', branch: 'main' },
      { path: '/c/frogbot-ticket218', branch: 'feat/ticket-218-ticket-cli' },
      { path: '/c/frogbot-ticket219', branch: null },
    ]);
  });

  it('reads the branches fast-forwarded into main from its reflog', () => {
    const reflog = [
      'ac567a5a merge fix/ticket-217-generated-files: Fast-forward',
      '41c4b0a9 commit: chore: bump version to 0.30.0',
      '1ce026b4 merge test-speed: Fast-forward',
    ].join('\n');

    expect(parseReflogMerges(reflog)).toEqual([
      { sha: 'ac567a5a', branch: 'fix/ticket-217-generated-files' },
      { sha: '1ce026b4', branch: 'test-speed' },
    ]);
  });

  const state = {
    branches: ['main', 'feat/ticket-218-ticket-cli', 'chore/ticket-219-guards'],
    merged: ['main', 'feat/ticket-218-ticket-cli', 'chore/ticket-219-guards'],
    worktrees: parseWorktrees(porcelain),
    landed: ['fix/ticket-217-generated-files', 'chore/ticket-219-guards'],
  };

  it('keeps a fresh branch at the tip of main in implement', () => {
    expect(ticketGit(218, state)).toEqual({
      branch: 'feat/ticket-218-ticket-cli',
      worktree: '/c/frogbot-ticket218',
      merged: true,
      landed: false,
    });
  });

  it('is landed after a fast-forward, with or without the branch', () => {
    expect(ticketGit(217, state)).toEqual({
      branch: null,
      worktree: null,
      merged: null,
      landed: true,
    });

    expect(ticketGit(219, state)).toMatchObject({
      branch: 'chore/ticket-219-guards',
      landed: true,
    });
  });

  it('is not landed while a reworked branch has commits main lacks', () => {
    expect(ticketGit(219, { ...state, merged: ['main'] })).toMatchObject({
      merged: false,
      landed: false,
    });
  });

  it('builds a status row', () => {
    const row = statusRow({
      ticket: 218,
      header: { line: 3, depends: [215, 216], batch: 29, problems: [] },
      research: true,
      spec: 'Status: Approved (2026-10-04)',
      plan: 'Status: Go (2026-10-04)\n\ntouches: [scripts/ticket.mjs]',
      git: ticketGit(218, state),
      counts: { ahead: 1, behind: 0 },
      lane: 'A',
    });

    expect(row).toEqual({
      ticket: '218',
      stage: 'implement',
      tier: 'light',
      depends: '215, 216',
      lane: 'A',
      branch: 'feat/ticket-218-ticket-cli',
      worktree: 'yes',
      'ahead/behind': '+1 -0',
      merged: 'yes',
    });

    expect(formatTable([row])).toEqual([
      'ticket  stage      tier   depends   lane  branch                      worktree  ahead/behind  merged',
      '218     implement  light  215, 216  A     feat/ticket-218-ticket-cli  yes       +1 -0         yes',
    ]);
  });
});

describe('ledger', () => {
  const row = {
    ticket: '999',
    patchId: 'abc123',
    level: 'unit',
    evidence: 'pnpm test:unit',
    verifier: 'tester',
    ts: '2026-10-04T00:00:00.000Z',
  };

  it('round-trips a row and skips the header', () => {
    const text = `ticket\tpatch-id\tlevel\tevidence\tverifier\tts\n${ledgerLine(row)}\n`;

    expect(parseLedger(text)).toEqual([row]);
  });

  it('counts a tester row for the current patch-id', () => {
    expect(hasTesterRow([row], { ticket: 999, patchId: 'abc123', worker: 'worker' })).toBe(true);
  });

  it('ignores a tester row for an older patch-id', () => {
    expect(hasTesterRow([row], { ticket: 999, patchId: 'def456', worker: 'worker' })).toBe(false);
  });

  it("ignores the worker's own rows, land's rows and failed rows", () => {
    const worker = { ...row, verifier: 'worker' };
    const land = { ...row, verifier: 'land' };
    const failed = { ...row, level: 'failed' };

    expect(
      hasTesterRow([worker, land, failed], { ticket: 999, patchId: 'abc123', worker: 'worker' }),
    ).toBe(false);
  });

  it('records int when the int run ran', () => {
    expect(landLevel(['check --full', 'test:unit', 'test:ui'])).toBe('unit');
    expect(landLevel(['check --full', 'test:unit', 'test:ui', 'test:int:sqlite'])).toBe('int');
  });

  it('records typecheck when no full unit run ran', () => {
    expect(landLevel(['check --full'])).toBe('typecheck');
    expect(landLevel(['check --full', 'test:unit test/unit/a.spec.ts'])).toBe('typecheck');
  });
});

describe('landGates', () => {
  const base = ['check --full', 'test:unit', 'test:ui'];
  const specs = [
    { file: 'test/unit/docs.spec.ts', text: "readFileSync('docs/rich-text/views.mdx')" },
    { file: 'test/unit/plain.spec.ts', text: 'expect(1).toBe(1)' },
    { file: 'test/unit/gateway/readme.spec.ts', text: "'README.md'" },
    { file: 'test/ui/page.spec.tsx', text: "'page.mdx'" },
  ];

  it.each([
    [['README.md'], true],
    [['docs/fields/ai.mdx', 'packages/ui/README.md'], true],
    [['docs/fields/ai.mdx', 'scripts/ticket.mjs'], false],
    [[], false],
  ])('%j is docs only: %s', (files, expected) => {
    expect(docsOnly(files)).toBe(expected);
  });

  it('finds the unit specs that read Markdown', () => {
    expect(markdownSpecs(specs)).toEqual(['test/unit/docs.spec.ts']);
  });

  it('skips test:unit, test:ui and the affected runs for a docs-only diff', () => {
    expect(landGates({ base, files: ['packages/ui/README.md'], specs: [] })).toEqual([
      'check --full',
    ]);
  });

  it('still runs the unit specs that read Markdown', () => {
    expect(landGates({ base, files: ['docs/rich-text/views.mdx'], specs })).toEqual([
      'check --full',
      'test:unit test/unit/docs.spec.ts',
    ]);
  });

  it('runs every gate when code changed', () => {
    expect(landGates({ base, files: ['README.md', 'packages/ui/a.tsx'], specs })).toEqual([
      ...base,
      'test:int:sqlite',
      'test:browser',
    ]);
  });
});

describe('squashMessage', () => {
  it('keeps the first subject and every body in order', () => {
    expect(
      squashMessage([
        'feat(ui): add a toggle\n\nThe toggle hides the panel.\n',
        'fix: typo',
        'test: cover the toggle\n\nOne spec.\nTwo lines.',
      ]),
    ).toBe('feat(ui): add a toggle\n\nThe toggle hides the panel.\n\nOne spec.\nTwo lines.\n');
  });

  it('marks the subject breaking and keeps each BREAKING CHANGE footer last, once', () => {
    expect(
      squashMessage([
        'feat(ui): add a toggle\n\nFirst body.',
        'refactor: rename\n\nSecond body.\n\nBREAKING CHANGE: `open` is now `expanded`\nand defaults to false.\nRefs: #12',
        'fix: follow up\n\nBREAKING CHANGE: `open` is now `expanded`\nand defaults to false.',
      ]),
    ).toBe(
      'feat(ui)!: add a toggle\n\nFirst body.\n\nSecond body.\n\nRefs: #12\n\nBREAKING CHANGE: `open` is now `expanded`\nand defaults to false.\n',
    );

    expect(squashMessage(['chore: a', 'feat(x)!: b'])).toBe('chore!: a\n');
    expect(squashMessage(['chore!: a', 'fix: b'])).toBe('chore!: a\n');
  });
});

describe('untilMainSettles', () => {
  it('reruns the round, logging each move, until main stays put', async () => {
    const heads = ['a1111111111', 'b2222222222', 'b2222222222'];
    const logged: string[] = [];
    let rounds = 0;

    const result = await untilMainSettles({
      head: () => heads.shift()!,
      round: () => ++rounds,
      log: (line: string) => logged.push(line),
    });

    expect(result).toBe(2);
    expect(logged).toEqual(['main moved to b2222222; rebasing and rerunning gates']);
  });

  it('stops at the first refusal', async () => {
    await expect(
      untilMainSettles({
        head: () => 'a1111111111',
        round: () => {
          throw new Error('pnpm test:unit is red');
        },
      }),
    ).rejects.toThrow('pnpm test:unit is red');
  });
});

describe('downServices', () => {
  it('checks the Docker services of the int gate only', async () => {
    const checked: number[] = [];
    const down = await downServices(
      ['check --full', 'test:unit', 'test:int:sqlite', 'test:browser'],
      ({ port }: { port: number }) => {
        checked.push(port);
        return Promise.resolve(port !== 6379 && port !== 4566);
      },
    );

    expect(checked.sort()).toEqual([10000, 3100, 4443, 4566, 5433, 6379].sort());
    expect(down.map(({ name }: { name: string }) => name)).toEqual(['Redis', 'LocalStack (S3)']);
    expect(dockerUp(down)).toBe(
      'docker compose -f test/docker-compose.yml --profile redis --profile storage up -d',
    );
  });

  it('checks nothing without an int gate', async () => {
    expect(await downServices(['check --full', 'test:unit'], () => Promise.resolve(false))).toEqual(
      [],
    );
  });
});

describe('affectedRuns', () => {
  it.each([
    [['README.md', 'scripts/ticket.mjs'], []],
    [['packages/gateway/package.json'], ['test:int:sqlite', 'test:gateway']],
    [['test/gateway/chatCompletions.int.spec.ts'], ['test:gateway']],
    [['packages/db-sqlite/src/index.ts'], ['test:int:sqlite', 'test:browser']],
    [['packages/ui/src/components/button.tsx'], ['test:int:sqlite', 'test:browser']],
    [['test/browser/chat.spec.ts'], ['test:browser']],
    [['templates/blank/src/app.tsx'], ['test:browser']],
    [['test/jobs/fixture.ts'], ['test:int:sqlite']],
    [['test/__helpers/shared/bootFrogBot.ts'], ['test:int:sqlite']],
    [['test/unit/frogbot/jobs/queue.spec.ts', 'test/types/jobs/native.test-d.ts'], []],
    [['test/e2e/fixtures/rich-text/src/frogbot.config.ts'], ['test:browser']],
  ])('%j runs %j', (files, runs) => {
    expect(affectedRuns(files)).toEqual(runs);
  });
});

describe('tail', () => {
  it('keeps the last non-empty lines', () => {
    expect(tail('a\n\nb\nc\n', 2)).toEqual(['b', 'c']);
  });
});
