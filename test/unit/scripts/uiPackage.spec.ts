import { describe, expect, it } from 'vitest';

import {
  declarationProblems,
  OPTIONAL_PEERS,
  storeProblems,
  uiManifestProblems,
} from '../../../scripts/lib/uiPackage.mjs';

const MANIFEST = {
  name: '@frogbotai/ui',
  dependencies: { '@frogbotai/protocol': '1.0.0', '@radix-ui/react-dialog': '^1.1.23' },
  peerDependencies: {
    ...Object.fromEntries(OPTIONAL_PEERS.map((name) => [name, '1.0.0'])),
    react: '^19.0.1',
  },
  peerDependenciesMeta: Object.fromEntries(
    OPTIONAL_PEERS.map((name) => [name, { optional: true }]),
  ),
  devDependencies: Object.fromEntries(OPTIONAL_PEERS.map((name) => [name, '1.0.0'])),
};

describe('uiManifestProblems', () => {
  it('accepts Payload and frogbot as optional peers and dev dependencies', () => {
    expect(uiManifestProblems(MANIFEST)).toEqual([]);
  });

  it('rejects @payloadcms/ui in dependencies', () => {
    const manifest = {
      ...MANIFEST,
      dependencies: { ...MANIFEST.dependencies, '@payloadcms/ui': '1.0.0' },
    };

    expect(uiManifestProblems(manifest)).toEqual(['dependencies.@payloadcms/ui']);
  });

  it('rejects a payload peer without optional: true', () => {
    const manifest = {
      ...MANIFEST,
      peerDependenciesMeta: { ...MANIFEST.peerDependenciesMeta, payload: { optional: false } },
    };

    expect(uiManifestProblems(manifest)).toEqual(['peerDependenciesMeta.payload.optional']);
  });

  it('rejects any other Payload package outside optional peers', () => {
    const manifest = {
      ...MANIFEST,
      optionalDependencies: { '@payloadcms/richtext-lexical': '1.0.0' },
      peerDependencies: { ...MANIFEST.peerDependencies, '@payloadcms/db-sqlite': '1.0.0' },
    };

    expect(uiManifestProblems(manifest)).toEqual([
      'optionalDependencies.@payloadcms/richtext-lexical',
      'peerDependenciesMeta.@payloadcms/db-sqlite.optional',
    ]);
  });

  it('rejects a missing optional peer', () => {
    const peerDependencies = Object.fromEntries(
      Object.entries(MANIFEST.peerDependencies).filter(([name]) => name !== 'frogbot'),
    );

    expect(uiManifestProblems({ ...MANIFEST, peerDependencies })).toEqual([
      'peerDependencies.frogbot',
    ]);
  });

  it('rejects next in any field', () => {
    const manifest = {
      ...MANIFEST,
      devDependencies: { ...MANIFEST.devDependencies, next: '15.0.0' },
      peerDependenciesMeta: { ...MANIFEST.peerDependenciesMeta, '@payloadcms/next': {} },
    };

    expect(uiManifestProblems(manifest)).toEqual([
      'devDependencies.next',
      'peerDependenciesMeta.@payloadcms/next',
    ]);
  });
});

describe('storeProblems', () => {
  it('lists frogbot, Payload and Next store entries', () => {
    expect(
      storeProblems([
        '@frogbotai+ui@0.32.0',
        '@payloadcms+ui@3.90.1',
        'frogbot@0.32.0',
        'next@16.4.0',
        'next-themes@0.4.0',
        'payload@3.90.1',
        'react@19.2.6',
      ]),
    ).toEqual(['@payloadcms+ui@3.90.1', 'frogbot@0.32.0', 'next@16.4.0', 'payload@3.90.1']);
  });
});

describe('declarationProblems', () => {
  const FROGBOT = "import type { FrogBotChat } from 'frogbot';\n";

  it('lets admin and chat/rest declarations import frogbot', () => {
    expect(
      declarationProblems([
        { file: 'dist/admin/exports/client.d.ts', text: FROGBOT },
        { file: 'dist/chat/rest/adapter.d.ts', text: FROGBOT },
        { file: 'dist/exports/chat-rest.d.ts', text: FROGBOT },
        { file: 'dist/chat/view.js', text: FROGBOT },
      ]),
    ).toEqual([]);
  });

  it('lists other declarations that import frogbot or @frogbotai/sdk', () => {
    expect(
      declarationProblems([
        { file: 'dist/chat/view.d.ts', text: FROGBOT },
        { file: 'dist/index.d.ts', text: "export * from '@frogbotai/sdk/client';\n" },
        { file: 'dist/theme/provider.d.ts', text: "import type { Theme } from './types.js';\n" },
      ]),
    ).toEqual(['dist/chat/view.d.ts', 'dist/index.d.ts']);
  });
});
