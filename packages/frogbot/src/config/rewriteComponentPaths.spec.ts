import { describe, expect, it } from 'vitest';

import { rewriteComponentPaths } from './rewriteComponentPaths.js';
import type { SanitizedConfig } from 'payload';

function makeConfig(admin: Record<string, unknown>): SanitizedConfig {
  return { admin } as unknown as SanitizedConfig;
}

describe('rewriteComponentPaths', () => {
  it('rewrites the CollectionCards dashboard widget to @frogbotai/next', () => {
    const config = makeConfig({
      dashboard: {
        widgets: [{ slug: 'collections', Component: '@payloadcms/next/rsc#CollectionCards', minWidth: 'full' }],
      },
    });

    rewriteComponentPaths(config);

    expect(config.admin.dashboard?.widgets).toEqual([
      { slug: 'collections', Component: '@frogbotai/next/rsc#CollectionCards', minWidth: 'full' },
    ]);
  });

  it('rewrites @payloadcms/next/client component strings', () => {
    const config = makeConfig({
      dashboard: {
        widgets: [{ slug: 'slugs', Component: '@payloadcms/next/client#SlugField' }],
      },
    });

    rewriteComponentPaths(config);

    expect(config.admin.dashboard?.widgets?.[0].Component).toBe('@frogbotai/next/client#SlugField');
  });

  it('rewrites storage adapter admin.dependencies keys and paths', () => {
    const config = makeConfig({
      dependencies: {
        '@payloadcms/storage-s3/client#S3ClientUploadHandler': {
          type: 'function',
          path: '@payloadcms/storage-s3/client#S3ClientUploadHandler',
        },
      },
    });

    rewriteComponentPaths(config);

    expect(config.admin.dependencies).toEqual({
      '@frogbotai/storage-s3/client#S3ClientUploadHandler': {
        type: 'function',
        path: '@frogbotai/storage-s3/client#S3ClientUploadHandler',
      },
    });
  });

  it('rewrites storage adapter provider component paths', () => {
    const config = makeConfig({
      components: {
        providers: [
          {
            path: '@payloadcms/storage-vercel-blob/client#VercelBlobClientUploadHandler',
            clientProps: { collectionSlug: 'media' },
          },
          './components/MyProvider#MyProvider',
        ],
      },
    });

    rewriteComponentPaths(config);

    expect(config.admin.components?.providers).toEqual([
      {
        path: '@frogbotai/storage-vercel-blob/client#VercelBlobClientUploadHandler',
        clientProps: { collectionSlug: 'media' },
      },
      './components/MyProvider#MyProvider',
    ]);
  });

  it('leaves user component paths untouched', () => {
    const config = makeConfig({
      dashboard: {
        widgets: [
          { slug: 'custom', Component: './widgets/Custom#CustomWidget' },
          { slug: 'pkg', Component: 'my-plugin/rsc#Widget' },
        ],
      },
    });

    rewriteComponentPaths(config);

    expect(config.admin.dashboard?.widgets?.map((w) => w.Component)).toEqual([
      './widgets/Custom#CustomWidget',
      'my-plugin/rsc#Widget',
    ]);
  });

  it('handles configs without admin blocks', () => {
    const config = {} as SanitizedConfig;
    expect(() => rewriteComponentPaths(config)).not.toThrow();
  });
});
