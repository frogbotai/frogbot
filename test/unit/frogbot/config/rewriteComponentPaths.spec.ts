import type { SanitizedConfig } from 'payload';
import { describe, expect, it } from 'vitest';

import { rewriteComponentPaths } from '../../../../packages/frogbot/src/config/rewriteComponentPaths.js';

function makeConfig(admin: Record<string, unknown>): SanitizedConfig {
  return { admin } as unknown as SanitizedConfig;
}

describe('rewriteComponentPaths', () => {
  it('rewrites the CollectionCards dashboard widget to @frogbotai/next', () => {
    const config = makeConfig({
      dashboard: {
        widgets: [
          {
            slug: 'collections',
            Component: '@payloadcms/next/rsc#CollectionCards',
            minWidth: 'full',
          },
        ],
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

  it('rewrites navigation item, section, and entity component paths', () => {
    const config = {
      admin: {
        components: {
          afterBottomRail: ['@payloadcms/next/rsc#AfterBottom'],
          beforeBottomRail: ['./components/BeforeBottom#BeforeBottom'],
          beforeSidebarClose: ['@payloadcms/next/client#BeforeClose'],
          navItems: [{ icon: '@payloadcms/next/client#ItemIcon' }],
          navSections: ['@payloadcms/next/rsc#Section', './components/Section#Section'],
        },
      },
      collections: [{ admin: { icon: '@payloadcms/next/rsc#CollectionIcon' }, fields: [] }],
      globals: [{ admin: { icon: '@payloadcms/next/rsc#GlobalIcon' }, fields: [] }],
    } as unknown as SanitizedConfig;

    rewriteComponentPaths(config);

    expect(
      (config.admin.components as never as { navItems: { icon: string }[] }).navItems[0]?.icon,
    ).toBe('@frogbotai/next/client#ItemIcon');
    expect((config.admin.components as never as { navSections: string[] }).navSections).toEqual([
      '@frogbotai/next/rsc#Section',
      './components/Section#Section',
    ]);
    expect(config.admin.components.afterBottomRail).toEqual(['@frogbotai/next/rsc#AfterBottom']);
    expect(config.admin.components.beforeBottomRail).toEqual([
      './components/BeforeBottom#BeforeBottom',
    ]);
    expect(config.admin.components.beforeSidebarClose).toEqual([
      '@frogbotai/next/client#BeforeClose',
    ]);
    expect((config.collections[0]?.admin as never as { icon: string }).icon).toBe(
      '@frogbotai/next/rsc#CollectionIcon',
    );
    expect((config.globals[0]?.admin as never as { icon: string }).icon).toBe(
      '@frogbotai/next/rsc#GlobalIcon',
    );
  });

  it('rewrites settings component and icon paths', () => {
    const config = makeConfig({
      settings: [
        {
          label: 'Usage',
          path: 'usage',
          Component: '@payloadcms/next/rsc#Usage',
          icon: '@payloadcms/next/client#UsageIcon',
        },
      ],
    });

    rewriteComponentPaths(config);

    expect((config.admin as never as { settings: unknown[] }).settings).toEqual([
      {
        label: 'Usage',
        path: 'usage',
        Component: '@frogbotai/next/rsc#Usage',
        icon: '@frogbotai/next/client#UsageIcon',
      },
    ]);
  });

  it('rewrites Payload folder field components', () => {
    const config = {
      collections: [
        {
          fields: [
            {
              name: 'folder',
              type: 'relationship',
              admin: {
                components: {
                  Cell: '@payloadcms/next/rsc#FolderTableCell',
                  Field: '@payloadcms/next/rsc#FolderField',
                },
              },
            },
          ],
        },
      ],
    } as unknown as SanitizedConfig;

    rewriteComponentPaths(config);

    expect(config.collections[0]?.fields[0]?.admin?.components).toEqual({
      Cell: '@frogbotai/next/rsc#FolderTableCell',
      Field: '@frogbotai/next/rsc#FolderField',
    });
  });

  it('does not traverse arbitrary circular custom data', () => {
    const custom: Record<string, unknown> = { component: '@payloadcms/next/rsc#FolderField' };
    custom.self = custom;
    const config = makeConfig({ custom });

    expect(() => rewriteComponentPaths(config)).not.toThrow();
    expect(custom.component).toBe('@payloadcms/next/rsc#FolderField');
  });
});
