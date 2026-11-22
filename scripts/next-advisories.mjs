#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { checkNextAdvisories } from '../packages/frogbot/src/bin/nextAdvisories.ts';
import { catalogVersion } from './lib/workspace.mjs';

export async function nextAdvisories({ fetch, version = catalogVersion('next') } = {}) {
  const report = await checkNextAdvisories({ fetch, version });

  if (!report) {
    return {
      code: 1,
      lines: [`✖ Couldn't ask npm about next ${version}: the registry failed or timed out.`],
    };
  }

  if (report.advisories.length === 0) {
    return { code: 0, lines: [`✔ next ${version} in the catalog has no npm security advisories.`] };
  }

  const fix = report.fix
    ? `Bump the catalog and templates to next ${report.fix}; apps can take it now, inside ${report.peerRange}.`
    : `No version inside ${report.peerRange} fixes it, so @frogbotai/next's peer range has to move.`;

  return {
    code: 1,
    lines: [
      `✖ next ${version} in the catalog has ${report.advisories.length} npm security advisories:`,
      ...report.advisories.map(
        (advisory) =>
          `  ${advisory.severity} · ${advisory.title} (${advisory.vulnerableVersions}) ${advisory.url}`,
      ),
      fix,
    ],
  };
}

async function main() {
  const { code, lines } = await nextAdvisories();

  for (const line of lines) (code ? console.error : console.log)(line);

  process.exitCode = code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
