#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PATH_RULES = [
  { test: (file) => file.startsWith('.idea/'), reason: '.idea/ is private; unstage it' },
  {
    test: (file) => path.posix.basename(file).startsWith('CHANGELOG'),
    reason: 'changelogs are not committed; unstage it',
  },
  { test: (file) => file.startsWith('.changeset/'), reason: 'changesets are not used; unstage it' },
  {
    test: (file) => file.split('/').slice(0, -1).includes('patches'),
    reason: 'dependency patches need owner approval; unstage it',
  },
];

const MANIFESTS = ['package.json', 'pnpm-workspace.yaml'];

export function findPathViolations(files) {
  const violations = [];

  for (const file of files) {
    const rule = PATH_RULES.find(({ test }) => test(file));

    if (rule) violations.push({ path: file, reason: rule.reason });
  }

  return violations;
}

function isManifest(file) {
  return MANIFESTS.includes(path.posix.basename(file));
}

function jsonPatchedDependencies(text) {
  try {
    return Object.keys(JSON.parse(text)?.pnpm?.patchedDependencies ?? {});
  } catch {
    return [];
  }
}

function unquote(key) {
  return key.trim().replace(/^(['"])(.*)\1$/, '$2');
}

function yamlPatchedDependencies(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^patchedDependencies:/.test(line));

  if (start === -1) return [];

  const inline = lines[start].replace(/^patchedDependencies:/, '').trim();

  if (inline.startsWith('{')) {
    return inline
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((entry) => unquote(entry.slice(0, entry.lastIndexOf(':'))))
      .filter(Boolean);
  }

  const keys = [];

  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    if (!/^\s/.test(line)) break;

    const match = /^\s+(.+?):(\s|$)/.exec(line);

    if (match) keys.push(unquote(match[1]));
  }

  return keys;
}

function patchedDependencies({ path: file, text }) {
  if (text == null) return [];

  return file.endsWith('.json') ? jsonPatchedDependencies(text) : yamlPatchedDependencies(text);
}

export function findPatchedDependencyViolation({ path: file, staged, head }) {
  const before = new Set(patchedDependencies({ path: file, text: head }));
  const added = patchedDependencies({ path: file, text: staged }).filter((key) => !before.has(key));

  if (added.length === 0) return null;

  return {
    path: file,
    reason: `adds patchedDependencies ${added.map((key) => `"${key}"`).join(', ')}; dependency patches need owner approval`,
  };
}

export function formatViolation({ path: file, reason }) {
  return `precommit-guard: ${file} — ${reason}`;
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  return result.status === 0 ? result.stdout : null;
}

function main() {
  const list = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);

  if (list == null) {
    console.error('precommit-guard: could not read the staged files (git diff --cached failed)');
    process.exit(1);
  }

  const files = list.split('\0').filter(Boolean);
  const violations = findPathViolations(files);

  for (const file of files.filter(isManifest)) {
    const violation = findPatchedDependencyViolation({
      path: file,
      staged: git(['show', `:${file}`]),
      head: git(['show', `HEAD:${file}`]),
    });

    if (violation) violations.push(violation);
  }

  if (violations.length === 0) return;

  for (const violation of violations) {
    console.error(formatViolation(violation));
  }

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
