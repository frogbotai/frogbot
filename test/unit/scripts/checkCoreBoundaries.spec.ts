import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkCoreBoundaries,
  coreBoundaryPatterns,
  coreFiles,
} from '../../../scripts/check-core-boundaries.mjs';

let directory: string | undefined;

afterEach(() => {
  if (directory) rmSync(directory, { force: true, recursive: true });

  directory = undefined;
});

function workspace(plugins: string[], files: Record<string, string> = {}) {
  directory = mkdtempSync(path.join(os.tmpdir(), 'check-core-boundaries-'));

  for (const name of plugins) {
    mkdirSync(path.join(directory, 'packages/plugins', name), { recursive: true });
  }

  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), content);
  }

  return directory;
}

const patterns = coreBoundaryPatterns({
  root: workspace(['plugin-api-keys', 'plugin-roles', 'plugin-seo']),
});

const logout = {
  file: 'packages/frogbot/src/bin/logout.ts',
  content: 'const id = user.apiKeyId;\nawait fetch(`/api/api-keys/${id}/revoke`);\n',
};

const baseline = [
  { file: logout.file, match: 'api-keys/', ticket: '362' },
  { file: logout.file, match: 'apiKeyId', ticket: '362' },
];

describe('checkCoreBoundaries', () => {
  it('passes when every hit is baselined', () => {
    expect(checkCoreBoundaries({ files: [logout], patterns, baseline })).toEqual([]);
  });

  it('fails on a new file that names apiKeyId, with its line', () => {
    const files = [
      logout,
      {
        file: 'packages/frogbot/src/bin/whoami.ts',
        content: 'export {};\nprint(user.apiKeyId);\n',
      },
    ];

    expect(checkCoreBoundaries({ files, patterns, baseline })).toEqual([
      'packages/frogbot/src/bin/whoami.ts:2: core names "apiKeyId"; move it into a plugin (CONTRIBUTING.md#core-or-plugin)',
    ]);
  });

  it('tells you to delete an entry whose match is gone', () => {
    const files = [{ file: logout.file, content: 'await fetch(`/api/api-keys/${id}/revoke`);\n' }];

    expect(checkCoreBoundaries({ files, patterns, baseline })).toEqual([
      'scripts/core-boundaries-baseline.json: packages/frogbot/src/bin/logout.ts no longer contains "apiKeyId" (ticket 362); delete this entry',
    ]);
  });

  it('counts a hit inside a comment', () => {
    const files = [
      logout,
      { file: 'packages/frogbot/src/config/types.ts', content: '// Set by plugin-roles.\n' },
    ];

    expect(checkCoreBoundaries({ files, patterns, baseline })).toEqual([
      'packages/frogbot/src/config/types.ts:1: core names "plugin-roles"; move it into a plugin (CONTRIBUTING.md#core-or-plugin)',
    ]);
  });

  it('counts a scoped specifier, but not a longer name or user_roles', () => {
    const files = [
      logout,
      {
        file: 'packages/frogbot/src/config/paths.ts',
        content: [
          "'@payloadcms/plugin-seo/client'",
          "'plugin-seo-extra'",
          'const user_roles = [];',
          'config._roles = [];',
        ].join('\n'),
      },
    ];

    expect(checkCoreBoundaries({ files, patterns, baseline })).toEqual([
      'packages/frogbot/src/config/paths.ts:1: core names "plugin-seo"; move it into a plugin (CONTRIBUTING.md#core-or-plugin)',
      'packages/frogbot/src/config/paths.ts:4: core names "_roles"; move it into a plugin (CONTRIBUTING.md#core-or-plugin)',
    ]);
  });

  it('makes a new packages/plugins folder a pattern', () => {
    const root = workspace(['plugin-foo']);
    const files = [{ file: 'packages/frogbot/src/index.ts', content: "import 'plugin-foo';\n" }];

    expect(checkCoreBoundaries({ files, patterns, baseline: [] })).toEqual([]);
    expect(
      checkCoreBoundaries({ files, patterns: coreBoundaryPatterns({ root }), baseline: [] }),
    ).toEqual([
      'packages/frogbot/src/index.ts:1: core names "plugin-foo"; move it into a plugin (CONTRIBUTING.md#core-or-plugin)',
    ]);
  });

  it('skips spec and type-test files', () => {
    const root = workspace([], {
      'packages/frogbot/src/bin/logout.spec.ts': 'user.apiKeyId',
      'packages/frogbot/src/types/roles.test-d.ts': 'config._roles',
      'packages/frogbot/src/bin/logout.ts': 'user.apiKeyId',
    });

    expect(coreFiles({ root })).toEqual([
      { file: 'packages/frogbot/src/bin/logout.ts', content: 'user.apiKeyId' },
    ]);
  });

  it.each([
    [{ file: logout.file, match: 'apiKeyId', ticket: 362 }],
    [{ file: logout.file, match: 'apiKeyId', issue: 362 }],
    [{ file: logout.file, match: 'apiKeyId', ticket: '#362' }],
  ])('rejects an entry without a ticket key: %j', (entry) => {
    expect(checkCoreBoundaries({ files: [logout], patterns, baseline: [entry] })).toEqual([
      'scripts/core-boundaries-baseline.json: entry 0 must be { file, match, ticket } with a ticket key such as "361"',
    ]);
  });

  it('rejects a duplicate entry', () => {
    expect(
      checkCoreBoundaries({ files: [logout], patterns, baseline: [...baseline, baseline[0]] }),
    ).toEqual([
      'scripts/core-boundaries-baseline.json: duplicate entry packages/frogbot/src/bin/logout.ts "api-keys/"',
    ]);
  });
});
