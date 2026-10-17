import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  lexicalProblems,
  payloadLexicalVersion,
  snapshotKeys,
} from '../../../scripts/check-lexical.mjs';

const root = path.resolve(import.meta.dirname, '../../..');

const react = (peers: string) => `'@lexical/react@0.50.0(react@19.2.6)${peers}':`;

function lockfile({ payload = '0.50.0', reactKeys = [react('(yjs@13.6.32)')] } = {}) {
  return [
    "lockfileVersion: '9.0'",
    '',
    'packages:',
    '',
    "  '@payloadcms/richtext-lexical@3.90.2':",
    '    resolution: {}',
    '',
    'snapshots:',
    '',
    ...reactKeys.flatMap((key) => [`  ${key}`, '    dependencies:', '      lexical: 0.50.0', '']),
    "  '@payloadcms/richtext-lexical@3.90.2(react@19.2.6)(yjs@13.6.32)':",
    '    dependencies:',
    `      '@lexical/react': 0.50.0(react@19.2.6)(yjs@13.6.32)`,
    `      lexical: ${payload}(typescript@6.0.3)`,
    '',
    '  lexical@0.50.0(typescript@6.0.3):',
    '    optionalDependencies:',
    '      typescript: 6.0.3',
    '',
  ].join('\n');
}

const pinned = {
  dependencies: { '@lexical/react': '0.50.0', '@lexical/utils': '0.50.0', lexical: '0.50.0' },
};

describe('check-lexical', () => {
  it("reads the lexical version Payload's snapshot resolves", () => {
    expect(payloadLexicalVersion(lockfile({ payload: '0.52.0' }))).toBe('0.52.0');
  });

  it('passes when every Lexical pin matches Payload and each package installs once', () => {
    expect(snapshotKeys(lockfile())).toEqual({
      lexical: ['lexical@0.50.0(typescript@6.0.3)'],
      '@lexical/react': ['@lexical/react@0.50.0(react@19.2.6)(yjs@13.6.32)'],
    });
    expect(lexicalProblems({ lockfile: lockfile(), manifest: pinned })).toEqual([]);
  });

  it('fails with packages/ui one patch off Payload', () => {
    const manifest = { dependencies: { ...pinned.dependencies, lexical: '0.50.1' } };

    expect(lexicalProblems({ lockfile: lockfile(), manifest })).toEqual([
      'packages/ui/package.json pins lexical to 0.50.1; @payloadcms/richtext-lexical resolves lexical 0.50.0',
    ]);
  });

  it('fails with two @lexical/react snapshot keys', () => {
    const problems = lexicalProblems({
      lockfile: lockfile({ reactKeys: [react('(yjs@13.6.32)'), react('')] }),
      manifest: pinned,
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^pnpm-lock\.yaml installs @lexical\/react as 2 copies:/);
  });

  it('fails when the lockfile names no Payload Lexical', () => {
    expect(
      lexicalProblems({ lockfile: "lockfileVersion: '9.0'\n\nsnapshots:\n", manifest: pinned }),
    ).toEqual(['pnpm-lock.yaml has no @payloadcms/richtext-lexical snapshot naming lexical']);
  });

  it('passes on the repo', () => {
    expect(
      lexicalProblems({
        lockfile: readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8'),
        manifest: JSON.parse(readFileSync(path.join(root, 'packages/ui/package.json'), 'utf8')),
      }),
    ).toEqual([]);
  });
});
