import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { failedTests, flakyRetry, KNOWN_FLAKY } from '../../../scripts/lib/flaky.mjs';
import { findingIssue, findingProblem, parseFinding } from '../../../scripts/lib/found.mjs';

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
  '[rich-text] › test/browser/richText.browser.spec.ts:21:1 › edits, saves, reloads, and renders rich text through the generated import map';

const viewSelection =
  '[rich-text] › test/browser/richText.browser.spec.ts:412:1 › view selection preserves saved content and safely renders editor nodes';

const chat = '[chat-assets] › test/browser/chat.browser.spec.ts:10:1 › uploads a file';

describe('flakyRetry', () => {
  it('reads the failed tests from the summary only', () => {
    expect(failedTests(summary([richText, chat]))).toEqual([
      {
        project: 'rich-text',
        test: 'test/browser/richText.browser.spec.ts:21',
        title: 'edits, saves, reloads, and renders rich text through the generated import map',
      },
      {
        project: 'chat-assets',
        test: 'test/browser/chat.browser.spec.ts:10',
        title: 'uploads a file',
      },
    ]);
  });

  it('retries known-flaky tests once, matched by title wherever they move', () => {
    expect(flakyRetry(summary([richText, viewSelection]))).toEqual({
      tests: [
        {
          project: 'rich-text',
          test: 'test/browser/richText.browser.spec.ts:21',
          finding: 'F-037',
        },
        {
          project: 'rich-text',
          test: 'test/browser/richText.browser.spec.ts:412',
          finding: 'F-038',
        },
      ],
      args: [
        'test/browser/richText.browser.spec.ts:21',
        'test/browser/richText.browser.spec.ts:412',
        '--project=rich-text',
      ],
    });
  });

  it('does not retry when any failure is not known to be flaky', () => {
    expect(flakyRetry(summary([richText, chat]))).toBeNull();
  });

  it('does not retry a known file when the failed test is another one', () => {
    const other = '[rich-text] › test/browser/richText.browser.spec.ts:136:1 › creates a link';

    expect(flakyRetry(summary([other]))).toBeNull();
  });

  it('names only tests that still exist', () => {
    for (const { file, title } of KNOWN_FLAKY) {
      expect(readFileSync(path.join(process.cwd(), file), 'utf8')).toContain(`test('${title}'`);
    }
  });

  it('does not retry a run that failed before any test', () => {
    expect(flakyRetry('Error: http://localhost:7926/health is already used')).toBeNull();
  });
});

describe('findings', () => {
  it('turns a row into an issue labeled found and area', () => {
    const finding = parseFinding('pre-existing failure · land · `pnpm test:ui` flakes\n');

    expect(finding).toEqual({
      kind: 'pre-existing failure',
      area: 'land',
      title: '`pnpm test:ui` flakes',
    });
    expect(findingIssue(finding, 'https://example.com/log')).toEqual({
      title: '`pnpm test:ui` flakes',
      body: 'Kind: pre-existing failure\n\nSource: https://example.com/log',
      labels: ['found', 'area:land'],
    });
  });

  it('refuses a row without a kind, an area and a text', () => {
    expect(parseFinding('just some text')).toBeNull();
    expect(parseFinding('bug · land')).toBeNull();
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
});
