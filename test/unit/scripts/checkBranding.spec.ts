import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { brandingFiles, checkBranding } from '../../../scripts/check-branding.mjs';

const allowlist = [
  {
    file: 'skills/frogbot/reference/PLUGIN-DEVELOPMENT.md',
    heading: '## Wrapping Payload field factories',
    reason: 'plugin authors wrap upstream field factories',
  },
];

let directory: string | undefined;

afterEach(() => {
  if (directory) rmSync(directory, { force: true, recursive: true });

  directory = undefined;
});

function workspace(files: Record<string, string>) {
  directory = mkdtempSync(path.join(os.tmpdir(), 'check-branding-'));

  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), content);
  }

  return directory;
}

function check(files: Record<string, string>) {
  return checkBranding({ files: brandingFiles({ root: workspace(files) }), allowlist });
}

const allowed = {
  'skills/frogbot/reference/PLUGIN-DEVELOPMENT.md':
    '# Plugins\n\n## Wrapping Payload field factories\n\nPayload-authored fields need a cast.\n',
};

describe('checkBranding', () => {
  it('rejects the Payload CMS line from 322bd1bf skills/frogbot/SKILL.md', () => {
    const problems = check({
      ...allowed,
      'skills/frogbot/SKILL.md':
        "# FrogBot Application Development\n\nFrogBot's collections, fields, hooks, access control and Local API behave like Payload CMS; FrogBot names apply.\n",
    });

    expect(problems).toEqual([
      {
        file: 'skills/frogbot/SKILL.md',
        line: 3,
        text: "FrogBot's collections, fields, hooks, access control and Local API behave like Payload CMS; FrogBot names apply.",
      },
    ]);
  });

  it.each([
    ['docs/a.mdx', 'Use the Payload Local API.'],
    ['docs/a.mdx', 'Install `@payloadcms/plugin-mcp`.'],
    ['README.md', "Built on Payload's admin."],
    ['packages/plugins/plugin-x/README.md', 'Delegates to Payload.'],
    ['templates/blank/src/frogbot.config.ts', 'type PayloadRequest = unknown'],
    ['examples/demo/README.md', 'See PayloadCMS.'],
  ])('rejects %s: %s', (file, line) => {
    const problems = check({ ...allowed, [file]: `${line}\n` });

    expect(problems).toEqual([{ file, line: 1, text: line }]);
  });

  it.each([
    ['docs/upload/storage-adapters.mdx', '| `disablePayloadAccessControl` | `true` |'],
    ['docs/a.mdx', 'The request payload is JSON.'],
    ['packages/plugins/plugin-mcp/README.md', 'A dormant `payload-mcp-api-keys` collection.'],
    ['packages/frogbot/dist/README.md', 'Payload'],
    ['docs/node_modules/x/README.md', 'Payload'],
  ])('accepts %s: %s', (file, line) => {
    const problems = check({ ...allowed, [file]: `${line}\n` });

    expect(problems).toEqual([]);
  });

  it('allows Payload only inside the allowlisted section', () => {
    const problems = check({
      'skills/frogbot/reference/PLUGIN-DEVELOPMENT.md':
        '# Plugins\n\n## Wrapping Payload field factories\n\n### Payload callbacks\n\nPayload-authored fields.\n\n## Next\n\nPayload again.\n',
    });

    expect(problems).toEqual([
      { file: 'skills/frogbot/reference/PLUGIN-DEVELOPMENT.md', line: 11, text: 'Payload again.' },
    ]);
  });

  it('reports an allowlist entry whose section is gone or clean', () => {
    const problems = check({
      'skills/frogbot/reference/PLUGIN-DEVELOPMENT.md':
        '# Plugins\n\n## Wrapping field factories\n',
    });

    expect(problems).toEqual([
      {
        file: 'scripts/check-branding.mjs',
        line: 1,
        text: 'stale allowlist entry skills/frogbot/reference/PLUGIN-DEVELOPMENT.md "## Wrapping Payload field factories": plugin authors wrap upstream field factories',
      },
    ]);
  });
});
