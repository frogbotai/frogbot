import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { failedTests, flakyRetry } from '../../../scripts/lib/flaky.mjs';
import {
  appendFinding,
  findingLine,
  findingProblem,
  nextFindingId,
} from '../../../scripts/lib/found.mjs';

const summary = (entries: string[], failed = entries.length) =>
  [
    '  ✘   14 [rich-text] › test/browser/richText.browser.spec.ts:21:1 › edits (7.7s)',
    '',
    `  ${failed} failed`,
    ...entries.map((entry) => `    ${entry} `),
    '  2 skipped',
    '  543 passed (3.3m)',
    ' ELIFECYCLE  Command failed with exit code 1.',
  ].join('\n');

const richText =
  '[rich-text] › test/browser/richText.browser.spec.ts:21:1 › edits, saves and reloads';

const viewSelection =
  '[rich-text] › test/browser/richText.browser.spec.ts:391:1 › view selection preserves saved content';

const chat = '[chat-assets] › test/browser/chat.browser.spec.ts:10:1 › uploads a file';

describe('flakyRetry', () => {
  it('reads the failed tests from the summary only', () => {
    expect(failedTests(summary([richText, chat]))).toEqual([
      { project: 'rich-text', test: 'test/browser/richText.browser.spec.ts:21' },
      { project: 'chat-assets', test: 'test/browser/chat.browser.spec.ts:10' },
    ]);
  });

  it('retries known-flaky tests once, by project and line', () => {
    expect(flakyRetry(summary([richText, viewSelection]))).toEqual({
      tests: [
        {
          project: 'rich-text',
          test: 'test/browser/richText.browser.spec.ts:21',
          finding: 'F-037',
        },
        {
          project: 'rich-text',
          test: 'test/browser/richText.browser.spec.ts:391',
          finding: 'F-038',
        },
      ],
      args: [
        '--project',
        'rich-text',
        'test/browser/richText.browser.spec.ts:21',
        'test/browser/richText.browser.spec.ts:391',
      ],
    });
  });

  it('does not retry when any failure is not known to be flaky', () => {
    expect(flakyRetry(summary([richText, chat]))).toBeNull();
  });

  it('does not retry a run that failed before any test', () => {
    expect(flakyRetry('Error: http://localhost:7926/health is already used')).toBeNull();
  });
});

describe('found ids', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const scratch = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'frogbot-found-'));

    dirs.push(dir);

    return dir;
  };

  it('is one more than the highest id in found.md and its archive', () => {
    expect(
      nextFindingId(['- F-007 bug · x · y\n- F-019 bug · x · y\n', '- F-051 idea · z\n']),
    ).toBe('F-052');
    expect(nextFindingId(['Open findings: none yet.\n'])).toBe('F-001');
  });

  it('ignores ids mentioned inside a row', () => {
    expect(nextFindingId(['- F-003 bug · x · same as F-099\n'])).toBe('F-004');
  });

  it('writes one row', () => {
    expect(findingLine({ id: 'F-052', text: ' bug · land · text\n', source: 'a.md' })).toBe(
      '- F-052 bug · land · text [source](a.md)',
    );
  });

  it('accepts one row from a here-doc', () => {
    expect(findingProblem('bug · land · `pnpm test:ui` flakes on the login spec\n')).toBeNull();
  });

  it.each([
    ['', 'no row on stdin'],
    ['bug · land · first\nsecond line\n', '2 lines'],
    ['bug · land · \u001b[31mFAIL\u001b[39m login', 'terminal escape codes'],
    ['bug · land · Test Files  1 failed | 3 passed (4)', 'vitest output'],
    ['bug · land · stderr | test/browser/login.spec.ts > logs in', 'vitest output'],
  ])('refuses %j as captured output', (text, problem) => {
    expect(findingProblem(text)).toContain(problem);
  });

  it('appends the next free id, counting archived rows', () => {
    const dir = scratch();
    const file = path.join(dir, 'found.md');
    const archive = path.join(dir, 'archive-found.md');

    writeFileSync(file, 'Open findings:\n\n- F-019 bug · a · b\n- F-019 bug · c · d');
    writeFileSync(archive, '- F-030 bug · old\n');

    expect(appendFinding({ file, archive, text: 'bug · land · first' }).id).toBe('F-031');
    expect(appendFinding({ file, archive, text: 'bug · land · second' }).id).toBe('F-032');
    expect(readFileSync(file, 'utf8').split('\n').slice(-3)).toEqual([
      '- F-031 bug · land · first',
      '- F-032 bug · land · second',
      '',
    ]);
  });

  it('refuses while another writer holds the lock', () => {
    const dir = scratch();
    const file = path.join(dir, 'found.md');

    writeFileSync(`${file}.lock`, '');

    expect(() => appendFinding({ file, text: 'bug · x · y' })).toThrow('is held');
  });
});
