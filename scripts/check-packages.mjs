#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

const WORKSPACE_FILE = 'pnpm-workspace.yaml';

const LIST_ITEM = /^\s+-\s+(['"]?)(.+?)\1\s*$/;

const GLOB_CHARS = /[*?[\]{}!]/;

export function workspacePatterns(yaml) {
  const patterns = [];
  let inPackages = false;

  for (const line of yaml.split('\n')) {
    if (/^\S/.test(line)) {
      inPackages = /^packages:\s*$/.test(line);
      continue;
    }

    const item = inPackages && LIST_ITEM.exec(line);

    if (item) patterns.push(item[2]);
  }

  return patterns;
}

function expand(segments, listDirs) {
  let matched = [''];

  for (const segment of segments) {
    matched = matched.flatMap((dir) => {
      if (segment !== '*') return [dir ? `${dir}/${segment}` : segment];

      return listDirs(dir)
        .filter((name) => !name.startsWith('.') && name !== 'node_modules')
        .map((name) => (dir ? `${dir}/${name}` : name));
    });
  }

  return matched;
}

export function checkPackages({ patterns, listDirs, tracked }) {
  const problems = [];
  const include = [];
  const exclude = new Set();

  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');
    const segments = (negated ? pattern.slice(1) : pattern).replace(/\/+$/, '').split('/');
    const unsupported = segments.find((segment) => segment !== '*' && GLOB_CHARS.test(segment));

    if (unsupported) {
      problems.push({ folder: pattern, reason: 'unsupported workspace glob' });
      continue;
    }

    const folders = expand(segments, listDirs);

    if (negated) {
      for (const folder of folders) exclude.add(folder);
    } else {
      include.push(...folders);
    }
  }

  const groups = new Set(
    patterns.flatMap((pattern) => {
      const parts = pattern.replace(/^!/, '').split('/');

      return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join('/'));
    }),
  );

  const literal = new Set(patterns.filter((pattern) => !GLOB_CHARS.test(pattern)));

  for (const folder of [...new Set(include)].sort()) {
    if (exclude.has(folder)) continue;
    if (groups.has(folder) && !literal.has(folder)) continue;
    if (tracked.has(`${folder}/package.json`)) continue;

    problems.push({ folder, reason: 'no tracked package.json' });
  }

  return problems;
}

function listDirs(dir) {
  try {
    return readdirSync(path.join(ROOT, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function trackedFiles() {
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });

  if (listed.status !== 0) {
    console.error(`packages: git ls-files failed: ${listed.stderr.trim()}`);
    process.exit(2);
  }

  return new Set(listed.stdout.split('\0').filter(Boolean));
}

function main() {
  const patterns = workspacePatterns(readFileSync(path.join(ROOT, WORKSPACE_FILE), 'utf8'));
  const problems = checkPackages({ patterns, listDirs, tracked: trackedFiles() });

  if (problems.length === 0) {
    console.log(`✔ Every folder matched by ${WORKSPACE_FILE} has a tracked package.json.`);

    return;
  }

  for (const { folder, reason } of problems) console.error(`${folder}: ${reason}`);

  console.error(
    `\n${problems.length} ${problems.length === 1 ? 'folder' : 'folders'} to fix. Delete leftover folders, or commit the package.json.`,
  );

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
