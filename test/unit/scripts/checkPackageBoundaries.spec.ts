import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkPackageBoundaries } from '../../../scripts/check-package-boundaries.mjs';

type Problem = { file: string; rule: string; specifier?: string; field?: string };

const OPTIONAL = ['@payloadcms/translations', '@payloadcms/ui', 'frogbot', 'payload'];

const MANIFEST = {
  name: '@frogbotai/ui',
  peerDependencies: Object.fromEntries(OPTIONAL.map((name) => [name, '1.0.0'])),
  peerDependenciesMeta: Object.fromEntries(OPTIONAL.map((name) => [name, { optional: true }])),
  devDependencies: Object.fromEntries(OPTIONAL.map((name) => [name, '1.0.0'])),
};

let dir: string;

function write(file: string, text: string) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
}

function check(manifest: Record<string, unknown> = MANIFEST) {
  write('packages/ui/package.json', JSON.stringify(manifest));

  return (checkPackageBoundaries({ root: dir }) as Problem[]).map(
    ({ file, rule, specifier, field }) => ({ file, rule, ...(field ? { field } : { specifier }) }),
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'check-package-boundaries-'));
});

afterEach(() => {
  rmSync(dir, { force: true, recursive: true });
});

describe('checkPackageBoundaries', () => {
  it('passes on this repository', () => {
    expect(checkPackageBoundaries()).toEqual([]);
  });

  it('passes admin code that imports Payload and shared code that imports neither', () => {
    write(
      'packages/ui/src/admin/exports/client.ts',
      "export { useConfig } from '@payloadcms/ui';\nexport { shallowRouteState } from '../utilities/shallowRoute.js';\n",
    );

    write('packages/ui/src/admin/views/Board/index.tsx', "import type { Where } from 'payload';\n");
    write('packages/ui/src/chat/rest/adapter.ts', "import type { FrogBotChat } from 'frogbot';\n");
    write('packages/ui/src/index.ts', "export { Button } from './components/button.js';\n");

    expect(check()).toEqual([]);
  });

  it.each([
    [
      '@payloadcms/ui in chat',
      'packages/ui/src/chat/use-chat.ts',
      "import { useConfig } from '@payloadcms/ui';",
      'ui-shared',
    ],
    [
      'an admin import in the root',
      'packages/ui/src/index.ts',
      "export * from './admin/exports/client.js';",
      'ui-shared',
    ],
    [
      'the admin entry outside admin',
      'packages/ui/src/chat/view.tsx',
      "import { useConfig } from '@frogbotai/ui/admin';",
      'ui-shared',
    ],
    [
      'payload types outside admin',
      'packages/ui/src/chat/view.tsx',
      "import type { Where } from 'payload';",
      'ui-shared',
    ],
    [
      'next outside admin',
      'packages/ui/src/theme/provider.tsx',
      "const { usePathname } = await import('next/navigation');",
      'ui-shared',
    ],
    [
      'next/navigation in an admin view',
      'packages/ui/src/admin/views/Board/index.tsx',
      "import { notFound } from 'next/navigation';",
      'ui-admin-next',
    ],
    [
      '@frogbotai/next in admin',
      'packages/ui/src/admin/elements/Nav/index.tsx',
      "import { RootLayout } from '@frogbotai/next/layouts';",
      'ui-admin-next',
    ],
    [
      'a frogbot value import in chat/rest',
      'packages/ui/src/chat/rest/adapter.ts',
      "import { buildConfig } from 'frogbot';",
      'ui-frogbot',
    ],
    [
      'frogbot types outside chat/rest',
      'packages/ui/src/chat/view.tsx',
      "import type { FrogBotChat } from 'frogbot';",
      'ui-frogbot',
    ],
    [
      '@payloadcms/ui in a plugin',
      'packages/plugins/plugin-api-keys/src/client/ApiKeysManager.tsx',
      "import { Button } from '@payloadcms/ui';",
      'payload-ui',
    ],
  ])('rejects %s', (_name, file, code, rule) => {
    write(file, `${code}\n`);

    expect(check()).toEqual([{ file, rule, specifier: expect.any(String) }]);
  });

  it.each([
    [
      'next in the manifest',
      { ...MANIFEST, peerDependencies: { ...MANIFEST.peerDependencies, next: '15.0.0' } },
      'peerDependencies.next',
    ],
    [
      '@payloadcms/next as a dev dependency',
      {
        ...MANIFEST,
        devDependencies: { ...MANIFEST.devDependencies, '@payloadcms/next': '1.0.0' },
      },
      'devDependencies.@payloadcms/next',
    ],
    [
      '@payloadcms/ui in dependencies',
      { ...MANIFEST, dependencies: { '@payloadcms/ui': '1.0.0' } },
      'dependencies.@payloadcms/ui',
    ],
    [
      'a payload peer without optional: true',
      { ...MANIFEST, peerDependenciesMeta: { ...MANIFEST.peerDependenciesMeta, payload: {} } },
      'peerDependenciesMeta.payload.optional',
    ],
  ])('rejects %s', (_name, manifest, field) => {
    expect(check(manifest)).toEqual([
      { file: 'packages/ui/package.json', rule: 'manifest', field },
    ]);
  });
});
