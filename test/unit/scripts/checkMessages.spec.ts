import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkMessages, missingDocs, upstreamStrings } from '../../../scripts/check-messages.mjs';

let directory: string | undefined;

afterEach(() => {
  if (directory) rmSync(directory, { force: true, recursive: true });

  directory = undefined;
});

function workspace(files: Record<string, string>) {
  directory = mkdtempSync(path.join(os.tmpdir(), 'check-messages-'));

  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), content);
  }

  return directory;
}

const upstreamDocs = {
  'packages/frogbot/src/errors/upstreamMessages.ts':
    "export const UPSTREAM_DOCS: Record<string, string> = {\n  'upload/transformers': 'upload/overview#image-sizes',\n};\n",
  'docs/upload/overview.mdx': '# Uploads\n\n## Image Sizes\n',
};

describe('upstreamStrings', () => {
  it('finds Payload in string and template literals, not in comments or identifiers', () => {
    const source = [
      '/** Wraps Payload. */',
      'const payloadConfig = 1;',
      "throw new Error('Payload broke');",
      'warn(`see https://payloadcms.com/docs/${page} now`);',
      "const status = 'Payload Too Large';",
      "import { x } from '@payloadcms/ui';",
    ].join('\n');

    expect(upstreamStrings('a.ts', source)).toEqual([
      { line: 3, text: 'Payload broke' },
      { line: 4, text: 'see https://payloadcms.com/docs/' },
    ]);
  });
});

describe('checkMessages', () => {
  it('fails on a new message in a package source and ignores tests', () => {
    const root = workspace({
      ...upstreamDocs,
      'packages/plugins/plugin-x/src/index.ts': "throw new Error('[plugin-x] Payload says no.');\n",
      'packages/plugins/plugin-x/src/index.spec.ts': "expect('Payload').toBe('Payload');\n",
    });

    expect(checkMessages({ root })).toEqual([
      'packages/plugins/plugin-x/src/index.ts:1: "[plugin-x] Payload says no."',
    ]);
  });

  it('passes a FrogBot message', () => {
    const root = workspace({
      ...upstreamDocs,
      'packages/frogbot/src/a.ts': "throw new Error('[frogbot] See https://docs.frogbot.ai.');\n",
    });

    expect(checkMessages({ root })).toEqual([]);
  });
});

describe('missingDocs', () => {
  it('reports a FrogBot page or anchor that the docs lack', () => {
    const root = workspace(upstreamDocs);

    expect(
      missingDocs({
        pages: ['upload/overview#image-sizes', 'upload/overview#gone', 'email/overview'],
        root,
      }),
    ).toEqual(['upload/overview#gone', 'email/overview']);
  });
});
