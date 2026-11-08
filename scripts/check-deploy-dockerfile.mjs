#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

export const TEMPLATE = 'templates/blank/Dockerfile';

export const BUNDLED = 'packages/frogbot/src/bin/deploy/dockerfile.ts';

const CONSTANT = /export const dockerfile = `([\s\S]*)`;\s*$/;

export function bundledDockerfile(source) {
  const match = CONSTANT.exec(source);

  if (!match) return undefined;

  return match[1].replace(/\\(\\|`|\$\{)/g, '$1');
}

export function dockerfileProblem({ template, source }) {
  const bundled = bundledDockerfile(source);

  if (bundled === undefined) {
    return `${BUNDLED} has no \`export const dockerfile\` template literal`;
  }

  if (bundled === template) return undefined;

  return `${BUNDLED} differs from ${TEMPLATE}`;
}

function main() {
  const problem = dockerfileProblem({
    template: readFileSync(path.join(ROOT, TEMPLATE), 'utf8'),
    source: readFileSync(path.join(ROOT, BUNDLED), 'utf8'),
  });

  if (!problem) {
    console.log(`✔ deploy's bundled Dockerfile matches ${TEMPLATE}.`);

    return;
  }

  console.error(`✖ ${problem}`);
  console.error(`\nCopy ${TEMPLATE} into the \`dockerfile\` constant, escaping \\, \` and \${.`);

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
