#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TYPES = [
  'feat',
  'fix',
  'refactor',
  'chore',
  'docs',
  'test',
  'perf',
  'build',
  'ci',
  'style',
];

const SUBJECT = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9-]+\\))?!?: \\S`);

const SCISSORS = /^# -+ >8 -+$/;

/**
 * Lines that credit a tool or an AI. Commits are the owner's alone: `--strip` removes them (the
 * commit-msg hook), and the check refuses them (`pnpm ticket land` and CI).
 */
export const ATTRIBUTION = [
  /^\s*Co-authored-by:/i,
  /^\s*Claude-Session:/i,
  /^\s*(🤖\s*)?_?Generated (with|by)\b/i,
  /^\s*(written|contributed|authored|co-authored) (by|with) claude\b/i,
  /claude\.ai\/code/i,
];

export function isAttribution(line) {
  return ATTRIBUTION.some((pattern) => pattern.test(line));
}

export function stripAttribution(text) {
  const lines = text.split(/\r?\n/);
  const scissors = lines.findIndex((line) => SCISSORS.test(line));
  const end = scissors === -1 ? lines.length : scissors;
  const kept = lines.slice(0, end).filter((line) => !isAttribution(line));

  while (kept.length > 1 && kept.at(-1).trim() === '' && kept.at(-2).trim() === '') kept.pop();

  return [...kept, ...lines.slice(end)].join('\n');
}

const EXAMPLE = 'fix(ui): align icon';

export function checkCommitMessage(text) {
  const lines = [];

  for (const line of text.split(/\r?\n/)) {
    if (SCISSORS.test(line)) break;

    if (!line.startsWith('#')) lines.push(line);
  }

  const subject = lines.find((line) => line.trim() !== '') ?? '';

  if (subject.startsWith('Merge ')) return null;

  if (!SUBJECT.test(subject)) {
    return subject
      ? `subject "${subject}" is not a Conventional Commit (type(scope): message, type one of ${TYPES.join(', ')})`
      : 'the commit message is empty';
  }

  const attribution = lines.find(isAttribution);

  if (attribution) {
    return `"${attribution}" is an attribution line; commits carry no Co-authored-by, Claude-Session, "Generated with" or claude.ai lines`;
  }

  return null;
}

export function formatProblem(problem) {
  return `commit-msg: ${problem}. Example subject: ${EXAMPLE}`;
}

function main() {
  const strip = process.argv[2] === '--strip';
  const file = process.argv[strip ? 3 : 2];

  if (!file) {
    console.error('Usage: node scripts/commit-msg.mjs [--strip] <commit-message-file>');
    process.exit(1);
  }

  if (strip) {
    const text = readFileSync(file, 'utf8');
    const cleaned = stripAttribution(text);

    if (cleaned !== text) writeFileSync(file, cleaned);

    return;
  }

  const problem = checkCommitMessage(readFileSync(file, 'utf8'));

  if (!problem) return;

  console.error(formatProblem(problem));
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
