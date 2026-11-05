#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

const SKILL_DIR = 'skills/frogbot';

const COPY_DIR = 'test/types/skill/scaffolds';

const PATH_COMMENT = /^\/\/ ((?![./])[\w./-]+\.tsx?)$/;

function walk(dir, pattern) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(dir, entry.name);

      if (entry.isDirectory()) return walk(file, pattern);

      return entry.isFile() && pattern.test(entry.name) ? [file] : [];
    })
    .sort();
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function stemOf(markdown) {
  return path.basename(markdown, '.md').toLowerCase();
}

function markdownOf(stem) {
  return stem === 'skill'
    ? `${SKILL_DIR}/SKILL.md`
    : `${SKILL_DIR}/reference/${stem.toUpperCase()}.md`;
}

function copyPath(stem, scaffold) {
  return `${COPY_DIR}/${stem}/${scaffold}`;
}

export function scaffoldFences({ root = ROOT } = {}) {
  const fences = [];

  for (const file of walk(path.join(root, SKILL_DIR), /\.md$/)) {
    const markdown = relative(root, file);
    const lines = readFileSync(file, 'utf8').split('\n');
    let open;

    lines.forEach((line, index) => {
      const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);

      if (!open) {
        if (match) {
          open = {
            char: match[1][0],
            length: match[1].length,
            language: match[2].trim().split(/\s+/, 1)[0],
            line: index + 1,
            body: [],
          };
        }

        return;
      }

      if (
        match &&
        match[1][0] === open.char &&
        match[1].length >= open.length &&
        match[2].trim() === ''
      ) {
        const scaffold = open.body[0]?.match(PATH_COMMENT)?.[1];

        if (['ts', 'tsx', 'typescript'].includes(open.language) && scaffold) {
          fences.push({
            file: markdown,
            line: open.line,
            key: copyPath(stemOf(markdown), scaffold),
            scaffold,
            body: `${open.body.join('\n')}\n`,
          });
        }

        open = undefined;

        return;
      }

      open.body.push(line);
    });
  }

  return fences;
}

export function scaffoldCopies({ root = ROOT } = {}) {
  return walk(path.join(root, COPY_DIR), /\.tsx?$/)
    .map((file) => {
      const copy = relative(root, file);
      const body = readFileSync(file, 'utf8');
      const declared = body.split('\n', 1)[0].match(PATH_COMMENT)?.[1];

      return { file: copy, declared, body };
    })
    .filter(({ declared }) => declared);
}

function firstDifference(left, right) {
  const a = left.split('\n');
  const b = right.split('\n');
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index++) {
    if (a[index] !== b[index]) return index + 1;
  }

  return length;
}

export function checkScaffolds({ fences, copies }) {
  const problems = [];
  const byKey = new Map();

  for (const fence of fences) {
    const first = byKey.get(fence.key);

    if (first) {
      problems.push(
        `${fence.file}:${fence.line} scaffold ${fence.scaffold} repeats ${first.file}:${first.line} (both map to ${fence.key})`,
      );
    } else {
      byKey.set(fence.key, fence);
    }
  }

  for (const copy of copies) {
    const [stem, ...rest] = copy.file.slice(COPY_DIR.length + 1).split('/');
    const sits = rest.join('/');

    if (copy.declared !== sits) {
      problems.push(`${copy.file} says // ${copy.declared} but sits at ${sits}`);

      continue;
    }

    const fence = byKey.get(copy.file);

    if (!fence) {
      problems.push(
        `${copy.file} has no scaffold fence (expected a fence starting "// ${sits}" in ${markdownOf(stem)})`,
      );

      continue;
    }

    if (fence.body !== copy.body) {
      problems.push(
        `${fence.file}:${fence.line} scaffold ${fence.scaffold} differs from ${copy.file} (first difference at line ${firstDifference(fence.body, copy.body)})`,
      );
    }
  }

  for (const [key, fence] of byKey) {
    if (!copies.some(({ file }) => file === key)) {
      problems.push(
        `${fence.file}:${fence.line} scaffold ${fence.scaffold} has no copy (expected ${key})`,
      );
    }
  }

  return problems;
}

function main() {
  const fences = scaffoldFences();
  const problems = checkScaffolds({ fences, copies: scaffoldCopies() });

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);

    console.error(`\n[check-skill-scaffolds] FAIL - ${problems.length} problem(s).`);
    process.exit(1);
  }

  console.log(`[check-skill-scaffolds] OK - ${fences.length} scaffolds matched.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
