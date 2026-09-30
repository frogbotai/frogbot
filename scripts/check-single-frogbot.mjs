#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishablePackages, readJSON } from './lib/workspace.mjs';

const CORE = 'frogbot';

const INSTALLED_FIELDS = ['dependencies', 'optionalDependencies'];

const FRAMEWORK_PEERS = ['next', 'react', 'react-dom'];

export function checkSingleFrogBot({ packages = publishablePackages() } = {}) {
  const problems = [];

  for (const pkg of packages) {
    const manifest = readJSON(path.join(pkg.dir, 'package.json'));

    if (pkg.name === CORE) {
      const peers = manifest.peerDependencies ?? {};

      for (const peer of FRAMEWORK_PEERS) {
        if (Object.hasOwn(peers, peer)) {
          problems.push({ name: pkg.name, field: `peerDependencies.${peer}` });
        }
      }

      continue;
    }

    for (const field of INSTALLED_FIELDS) {
      if (Object.hasOwn(manifest[field] ?? {}, CORE)) {
        problems.push({ name: pkg.name, field: `${field}.${CORE}` });
      }
    }
  }

  return problems;
}

function main() {
  const packages = publishablePackages();
  const problems = checkSingleFrogBot({ packages });

  if (problems.length === 0) {
    console.log(`✔ None of ${packages.length} packages can install a second copy of frogbot.`);

    return;
  }

  console.error('✖ These manifest entries can install a second copy of frogbot:\n');

  for (const { name, field } of problems) {
    console.error(`  ${name} → ${field}`);
  }

  console.error(
    `\n${problems.length} ${problems.length === 1 ? 'entry' : 'entries'} to fix. Packages list frogbot under peerDependencies (plus devDependencies for local builds), and frogbot itself has no framework peers.`,
  );

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
