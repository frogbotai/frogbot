#!/usr/bin/env node
// `pnpm check peer-variants` reads the importers of `pnpm-lock.yaml` and fails when a package that
// several workspace folders depend on resolves, at one version, to more than one peer variant:
// two `.pnpm` copies of the same package, so `vi.mock` or `instanceof` in one folder misses the
// copy another folder loads. ALLOWED lists the variants kept on purpose, each with its reason.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

export const LOCKFILE = 'pnpm-lock.yaml';

export const ALLOWED = [
  {
    name: 'next',
    importer: 'packages/frogbot',
    reason: "frogbot imports only Next's `Metadata` type, so no code loads its copy at runtime",
  },
];

const IMPORTER = /^ {2}(\S.*):$/;

const DEPENDENCY = /^ {6}(\S.*):$/;

const VERSION = /^ {8}version: (.+)$/;

// `{ name: { version: [importer] } }` for every installed direct dependency of each importer.
export function importerVersions(lockfile) {
  const versions = {};
  let inImporters = false;
  let importer;
  let name;

  for (const line of lockfile.split('\n')) {
    if (line === 'importers:') {
      inImporters = true;
      continue;
    }

    if (!inImporters) continue;

    if (/^\S/.test(line)) break;

    const version = VERSION.exec(line)?.[1];
    const dependency = DEPENDENCY.exec(line)?.[1];
    const folder = IMPORTER.exec(line)?.[1];

    if (version && !version.startsWith('link:')) {
      versions[name] ??= {};
      (versions[name][version] ??= []).push(importer);
    } else if (dependency) {
      name = unquote(dependency);
    } else if (folder) {
      importer = unquote(folder);
    }
  }

  return versions;
}

function unquote(key) {
  return key.replace(/^'(.*)'$/, '$1');
}

function baseVersion(version) {
  return version.replace(/\(.*$/, '');
}

function allowed(name, importer, allow) {
  return allow.some((entry) => entry.name === name && entry.importer === importer);
}

// One problem per package and version installed as several peer variants, listing each variant
// with its importers; an allowed importer's variant doesn't count.
export function peerVariants({ lockfile, allow = ALLOWED }) {
  const problems = [];

  for (const [name, versions] of Object.entries(importerVersions(lockfile))) {
    const byBase = {};

    for (const [version, importers] of Object.entries(versions)) {
      const kept = importers.filter((importer) => !allowed(name, importer, allow));

      if (kept.length > 0) (byBase[baseVersion(version)] ??= []).push({ version, importers: kept });
    }

    for (const [version, variants] of Object.entries(byBase)) {
      if (variants.length > 1) problems.push({ name, version, variants });
    }
  }

  return problems.sort((a, b) => a.name.localeCompare(b.name));
}

// The ALLOWED entries whose importer no longer has a variant of its own.
export function unusedAllowances({ lockfile, allow = ALLOWED }) {
  const problems = peerVariants({ lockfile, allow: [] });

  return allow.filter(
    ({ name, importer }) =>
      !problems.some(
        (problem) =>
          problem.name === name &&
          problem.variants.some(({ importers }) => importers.includes(importer)),
      ),
  );
}

function main() {
  const lockfile = readFileSync(path.join(ROOT, LOCKFILE), 'utf8');
  const problems = peerVariants({ lockfile });
  const unused = unusedAllowances({ lockfile });

  if (problems.length === 0 && unused.length === 0) {
    console.log(`✔ No workspace dependency in ${LOCKFILE} installs as two peer variants.`);

    return;
  }

  for (const { name, version, variants } of problems) {
    console.error(`✖ ${name}@${version} installs as ${variants.length} peer variants:`);

    for (const variant of variants) {
      console.error(`  ${variant.version}\n    ${variant.importers.join(', ')}`);
    }
  }

  for (const { name, importer } of unused) {
    console.error(`✖ ALLOWED lists ${name} in ${importer}, which no longer installs a variant`);
  }

  console.error(
    '\nAlign the peer sets (the same peers installed in each folder), or add an ALLOWED entry with its reason.',
  );

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
