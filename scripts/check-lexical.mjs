#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

export const LOCKFILE = 'pnpm-lock.yaml';

export const UI_MANIFEST = 'packages/ui/package.json';

const PAYLOAD_LEXICAL = /^ {2}'@payloadcms\/richtext-lexical@[^']+':$/;

const SNAPSHOT_KEY = /^ {2}'?(lexical|@lexical\/react)@([^(':]+)/;

const LEXICAL_DEPENDENCY = /^ {6}lexical: ([^(\s]+)/;

const LEXICAL_PACKAGE = /^(?:lexical|@lexical\/.+)$/;

function snapshots(lockfile) {
  const lines = lockfile.split('\n');
  const start = lines.indexOf('snapshots:');

  return start === -1 ? [] : lines.slice(start + 1);
}

export function payloadLexicalVersion(lockfile) {
  let inPayload = false;

  for (const line of snapshots(lockfile)) {
    if (/^ {2}\S/.test(line)) inPayload = PAYLOAD_LEXICAL.test(line);
    else if (inPayload) {
      const version = LEXICAL_DEPENDENCY.exec(line)?.[1];

      if (version) return version;
    }
  }

  return undefined;
}

export function snapshotKeys(lockfile) {
  const keys = { lexical: [], '@lexical/react': [] };

  for (const line of snapshots(lockfile)) {
    const match = SNAPSHOT_KEY.exec(line);

    if (match) keys[match[1]].push(line.trim().replace(/^'|':$|:$/g, ''));
  }

  return keys;
}

export function lexicalProblems({ lockfile, manifest }) {
  const problems = [];
  const version = payloadLexicalVersion(lockfile);

  if (!version) {
    problems.push(`${LOCKFILE} has no @payloadcms/richtext-lexical snapshot naming lexical`);
  } else {
    for (const [name, pin] of Object.entries(manifest.dependencies ?? {})) {
      if (LEXICAL_PACKAGE.test(name) && pin !== version) {
        problems.push(
          `${UI_MANIFEST} pins ${name} to ${pin}; @payloadcms/richtext-lexical resolves lexical ${version}`,
        );
      }
    }
  }

  for (const [name, keys] of Object.entries(snapshotKeys(lockfile))) {
    if (keys.length > 1) {
      problems.push(
        `${LOCKFILE} installs ${name} as ${keys.length} copies:\n    ${keys.join('\n    ')}`,
      );
    }
  }

  return problems;
}

function main() {
  const problems = lexicalProblems({
    lockfile: readFileSync(path.join(ROOT, LOCKFILE), 'utf8'),
    manifest: JSON.parse(readFileSync(path.join(ROOT, UI_MANIFEST), 'utf8')),
  });

  if (problems.length === 0) {
    console.log("✔ @frogbotai/ui's Lexical matches Payload's, installed once.");

    return;
  }

  for (const problem of problems) console.error(`✖ ${problem}`);

  console.error(
    '\nPin lexical and @lexical/* in packages/ui exactly to the version @payloadcms/richtext-lexical resolves, then align the peers so each installs once.',
  );

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
