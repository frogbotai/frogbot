#!/usr/bin/env node
import { readFileSync } from 'node:fs';
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

const ATTRIBUTION = [/^Co-authored-by:/i, /^(🤖 )?Generated with/];

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

  const attribution = lines.find((line) => ATTRIBUTION.some((pattern) => pattern.test(line)));

  if (attribution) {
    return `"${attribution}" is an attribution line; commits carry no Co-authored-by or "Generated with" lines`;
  }

  return null;
}

export function formatProblem(problem) {
  return `commit-msg: ${problem}. Example subject: ${EXAMPLE}`;
}

function main() {
  const file = process.argv[2];

  if (!file) {
    console.error('Usage: node scripts/commit-msg.mjs <commit-message-file>');
    process.exit(1);
  }

  const problem = checkCommitMessage(readFileSync(file, 'utf8'));

  if (!problem) return;

  console.error(formatProblem(problem));
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
