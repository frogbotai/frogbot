import { describe, expect, it } from 'vitest';

import { checkCommitMessage, formatProblem } from '../../../scripts/commit-msg.mjs';

describe('checkCommitMessage', () => {
  it.each([
    'fix: x',
    'fix(ui): align icon',
    'feat!: drop option',
    'feat(gateway)!: drop option',
    'refactor(payload-plugin): move helpers',
    'chore: add git hooks for lint-staged, commit guard and commit messages',
    'docs(piece-google-drive): explain scopes',
  ])('accepts %s', (message) => {
    expect(checkCommitMessage(`${message}\n`)).toBeNull();
  });

  it.each([
    'update stuff',
    'gateway: add retry',
    'feature: add retry',
    'Fix: add retry',
    'fix:add retry',
    'fix(UI): align icon',
    'fix(roles, usage): align icon',
    'fix: ',
  ])('refuses the subject %s', (message) => {
    expect(checkCommitMessage(`${message}\n`)).toMatch(
      /^subject ".*" is not a Conventional Commit/,
    );
  });

  it('names the subject and the allowed types', () => {
    const problem = checkCommitMessage('update stuff\n');

    expect(problem).toBe(
      'subject "update stuff" is not a Conventional Commit (type(scope): message, type one of feat, fix, refactor, chore, docs, test, perf, build, ci, style)',
    );
  });

  it('refuses an empty message', () => {
    expect(checkCommitMessage('\n# Please enter the commit message\n')).toBe(
      'the commit message is empty',
    );
  });

  it.each([
    "Merge branch 'feat/ticket-142-vector-d1'",
    "Merge remote-tracking branch 'origin/main'\n\nCo-authored-by: Bot <b@x>",
  ])('accepts the merge commit %s', (message) => {
    expect(checkCommitMessage(message)).toBeNull();
  });

  it.each([
    'Co-authored-by: Bot <b@x>',
    'co-authored-by: Bot <b@x>',
    'Generated with opencode',
    '🤖 Generated with [opencode](https://opencode.ai)',
  ])('refuses the attribution line %s', (line) => {
    expect(checkCommitMessage(`fix: x\n\n${line}\n`)).toBe(
      `"${line}" is an attribution line; commits carry no Co-authored-by or "Generated with" lines`,
    );
  });

  it.each([
    "Ported from opencode's title.txt",
    'The opencode agent now reads AGENTS.md.',
    'Mention Generated with in the middle: not a trailer',
  ])('accepts the body line %s', (line) => {
    expect(checkCommitMessage(`fix: x\n\n${line}\n`)).toBeNull();
  });

  it('ignores comment lines before the subject', () => {
    expect(checkCommitMessage('# Please enter the commit message\nfix: x\n')).toBeNull();
  });

  it('ignores the diff below the scissors line', () => {
    const message = [
      'fix: x',
      '',
      '# ------------------------ >8 ------------------------',
      '# Do not modify or remove the line above.',
      'diff --git a/x b/x',
      'Co-authored-by: Bot <b@x>',
    ].join('\n');

    expect(checkCommitMessage(message)).toBeNull();
  });

  it('accepts a message with Windows line endings', () => {
    expect(checkCommitMessage('fix: x\r\n\r\nBody line\r\n')).toBeNull();
  });
});

describe('formatProblem', () => {
  it('prints the rule and an example subject on one line', () => {
    expect(formatProblem('the commit message is empty')).toBe(
      'commit-msg: the commit message is empty. Example subject: fix(ui): align icon',
    );
  });
});
