import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ALLOWED,
  importerVersions,
  peerVariants,
  unusedAllowances,
} from '../../../scripts/check-peer-variants.mjs';

const root = path.resolve(import.meta.dirname, '../../..');

const lexical = (peers: string) => `3.90.1(${peers})(payload@3.90.1)`;

function lockfile(importers: Record<string, Record<string, string>>) {
  return [
    "lockfileVersion: '9.0'",
    '',
    'importers:',
    ...Object.entries(importers).flatMap(([importer, dependencies]) => [
      `  ${importer}:`,
      '    devDependencies:',
      ...Object.entries(dependencies).flatMap(([name, version]) => [
        `      '${name}':`,
        '        specifier: ^1.0.0',
        `        version: ${version}`,
      ]),
    ]),
    '',
    'packages:',
    '',
    "  '@payloadcms/richtext-lexical@3.90.1':",
    '    resolution: {}',
  ].join('\n');
}

const split = lockfile({
  'packages/richtext-lexical': { '@payloadcms/richtext-lexical': lexical('react@19.2.6') },
  test: {
    '@payloadcms/richtext-lexical': lexical('@types/react@19.2.2)(react@19.2.6'),
    frogbot: 'link:../packages/frogbot',
  },
});

describe('importerVersions', () => {
  it('maps each dependency version to its importers, skipping workspace links', () => {
    expect(importerVersions(split)).toEqual({
      '@payloadcms/richtext-lexical': {
        [lexical('react@19.2.6')]: ['packages/richtext-lexical'],
        [lexical('@types/react@19.2.2)(react@19.2.6')]: ['test'],
      },
    });
  });
});

describe('peerVariants', () => {
  it('reports one version installed as two peer variants', () => {
    expect(peerVariants({ lockfile: split, allow: [] })).toEqual([
      {
        name: '@payloadcms/richtext-lexical',
        version: '3.90.1',
        variants: [
          { version: lexical('react@19.2.6'), importers: ['packages/richtext-lexical'] },
          { version: lexical('@types/react@19.2.2)(react@19.2.6'), importers: ['test'] },
        ],
      },
    ]);
  });

  it('passes the same variant in every importer, and different versions', () => {
    const shared = lockfile({
      'packages/ui': { react: '19.2.6', sharp: '0.35.2' },
      'templates/blank': { react: '19.2.6', sharp: '0.34.5' },
    });

    expect(peerVariants({ lockfile: shared, allow: [] })).toEqual([]);
  });

  it('skips an allowed importer, and flags the allowance once it is unused', () => {
    const allow = [{ name: '@payloadcms/richtext-lexical', importer: 'test', reason: 'types' }];
    const aligned = lockfile({
      'packages/richtext-lexical': { '@payloadcms/richtext-lexical': lexical('react@19.2.6') },
      test: { '@payloadcms/richtext-lexical': lexical('react@19.2.6') },
    });

    expect(peerVariants({ lockfile: split, allow })).toEqual([]);
    expect(unusedAllowances({ lockfile: split, allow })).toEqual([]);
    expect(unusedAllowances({ lockfile: aligned, allow })).toEqual(allow);
  });

  it('passes the repo lockfile, every allowance with a reason', () => {
    const repo = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');

    expect(peerVariants({ lockfile: repo })).toEqual([]);
    expect(unusedAllowances({ lockfile: repo })).toEqual([]);
    expect(ALLOWED.filter(({ reason }) => !reason)).toEqual([]);
  });
});
