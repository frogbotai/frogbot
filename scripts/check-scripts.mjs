#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageDirs, ROOT } from './lib/workspace.mjs';

export const PACKAGE_SCRIPTS = ['build', 'clean', 'typecheck'];

export const HOOK_SCRIPTS = ['lint-staged', 'prepare'];

const PNPM_COMMANDS = new Set(['add', 'dlx', 'exec', 'install', 'pack', 'publish', 'run']);

const COMMANDS_HEADING = '## Commands';

const PNPM_SCRIPT = /\bpnpm ([a-z][\w:-]*)/g;

const CELL = /(?<!\\)\|/;

function scriptLines(source) {
  const found = new Map();
  const lines = source.split('\n');
  const start = lines.findIndex((text) => /^\s*"scripts":/.test(text));

  for (let index = start + 1; start !== -1 && index < lines.length; index++) {
    if (/^\s*}/.test(lines[index])) break;

    const name = /^\s*"([^"]+)":/.exec(lines[index])?.[1];

    if (name) found.set(name, index + 1);
  }

  return found;
}

export function tableScripts(contributing) {
  const found = new Map();
  const lines = contributing.split('\n');
  const start = lines.indexOf(COMMANDS_HEADING);

  if (start === -1) return found;

  for (let index = start + 1; index < lines.length && !lines[index].startsWith('## '); index++) {
    const command = lines[index].startsWith('|') ? lines[index].split(CELL)[2] : undefined;

    for (const [, name] of command?.matchAll(PNPM_SCRIPT) ?? []) {
      if (!PNPM_COMMANDS.has(name) && !found.has(name)) found.set(name, index + 1);
    }
  }

  return found;
}

export function checkScripts({ root, contributing, packages }) {
  const problems = [];
  const scripts = Object.keys(JSON.parse(root.source).scripts ?? {});
  const lines = scriptLines(root.source);
  const table = tableScripts(contributing.source);

  for (const name of scripts) {
    if (HOOK_SCRIPTS.includes(name) || table.has(name)) continue;

    problems.push(
      `${root.file}:${lines.get(name)} script "${name}" has no row in ${contributing.file}'s command table`,
    );
  }

  for (const [name, line] of table) {
    if (scripts.includes(name)) continue;

    problems.push(`${contributing.file}:${line} \`pnpm ${name}\` is not a root script`);
  }

  for (const { file, source } of packages) {
    const names = Object.keys(JSON.parse(source).scripts ?? {});
    const extra = names.filter((name) => !PACKAGE_SCRIPTS.includes(name));
    const found = scriptLines(source);

    for (const name of extra) {
      problems.push(
        `${file}:${found.get(name)} script "${name}" is not allowed (packages have only ${PACKAGE_SCRIPTS.join(', ')})`,
      );
    }
  }

  return problems;
}

function read(file) {
  return { file, source: readFileSync(path.join(ROOT, file), 'utf8') };
}

function main() {
  const problems = checkScripts({
    root: read('package.json'),
    contributing: read('CONTRIBUTING.md'),
    packages: packageDirs().map((dir) => read(path.relative(ROOT, path.join(dir, 'package.json')))),
  });

  if (problems.length === 0) {
    console.log(
      '✔ Every root script is documented and packages have only build, clean, typecheck.',
    );

    return;
  }

  for (const problem of problems) console.error(problem);

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
