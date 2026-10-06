import type { CollectionConfig, FrogBotConfig } from 'frogbot';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ImportExportPluginOptions } from '../../../packages/plugins/plugin-import-export/src/index.js';
import { importExportPlugin } from '../../../packages/plugins/plugin-import-export/src/index.js';

type Hook = (args: Record<string, unknown>) => unknown;
type CollectionOverride = NonNullable<ImportExportPluginOptions['overrideImportCollection']>;

function rename(slug: string): CollectionOverride {
  return ({ collection }) => ({ ...collection, slug });
}

const setups: { name: string; options: ImportExportPluginOptions; slugs: [string, string] }[] = [
  { name: 'the default collections', options: { collections: [] }, slugs: ['imports', 'exports'] },
  {
    name: 'renamed collections',
    options: {
      collections: [],
      overrideImportCollection: rename('csv-imports'),
      overrideExportCollection: rename('csv-exports'),
    },
    slugs: ['csv-imports', 'csv-exports'],
  },
  {
    name: 'per-collection collections',
    options: {
      collections: [
        {
          slug: 'posts',
          import: { overrideCollection: rename('post-imports') },
          export: { overrideCollection: rename('post-exports') },
        },
      ],
    },
    slugs: ['post-imports', 'post-exports'],
  },
];

async function buildCollections(options: ImportExportPluginOptions) {
  const config = await importExportPlugin(options)({
    secret: 'test',
    db: {},
    collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  } as unknown as FrogBotConfig);

  return config.collections ?? [];
}

function createRequest() {
  const queue = vi.fn();

  const req = {
    payload: {
      collections: { posts: { config: { custom: {} } } },
      jobs: { queue },
      logger: { error: vi.fn(), info: vi.fn() },
    },
    transactionID: 7,
    user: { collection: 'users', id: 1 },
  };

  return { queue, req };
}

async function runAfterChange(collection: CollectionConfig | undefined, doc: object) {
  const { queue, req } = createRequest();

  for (const hook of (collection?.hooks?.afterChange ?? []) as Hook[]) {
    await hook({ collection, doc, operation: 'create', previousDoc: {}, req });
  }

  return { queue, req };
}

describe('importExportPlugin', () => {
  afterEach(() => {
    vi.doUnmock('@payloadcms/plugin-import-export');
    vi.resetModules();
  });

  it.each(setups)(
    'an import create on $name queues its job with the create request',
    async ({ options, slugs }) => {
      const collections = await buildCollections(options);
      const imports = collections.find(({ slug }) => slug === slugs[0]);

      const { queue, req } = await runAfterChange(imports, {
        id: 1,
        collectionSlug: 'posts',
        status: 'pending',
      });

      expect(queue).toHaveBeenCalledOnce();
      expect(queue.mock.calls[0][0]).toMatchObject({ task: 'createCollectionImport', req });
      expect(queue.mock.calls[0][0].req).toBe(req);
    },
  );

  it.each(setups)(
    'an export create on $name queues its job with the create request',
    async ({ options, slugs }) => {
      const collections = await buildCollections(options);
      const exports = collections.find(({ slug }) => slug === slugs[1]);

      const { queue, req } = await runAfterChange(exports, {
        id: 1,
        name: 'posts.csv',
        collectionSlug: 'posts',
        format: 'csv',
      });

      expect(queue).toHaveBeenCalledOnce();
      expect(queue.mock.calls[0][0]).toMatchObject({ task: 'createCollectionExport', req });
      expect(queue.mock.calls[0][0].req).toBe(req);
    },
  );

  it.each([
    { kind: 'import', option: 'overrideImportCollection', expected: 2 },
    { kind: 'export', option: 'overrideExportCollection', expected: 1 },
  ] as const)(
    'a Payload $kind collection with a different afterChange hook count fails the build',
    async ({ kind, option, expected }) => {
      vi.doMock('@payloadcms/plugin-import-export', () => ({
        importExportPlugin: (options: ImportExportPluginOptions) => async (config: unknown) => {
          await options[option]!({
            collection: { slug: `${kind}s`, fields: [], hooks: { afterChange: [] } },
          });

          return config;
        },
      }));

      const { importExportPlugin: mockedPlugin } =
        await import('../../../packages/plugins/plugin-import-export/src/index.js');

      await expect(mockedPlugin({ collections: [] })({} as FrogBotConfig)).rejects.toThrow(
        `[plugin-import-export] Expected ${expected} afterChange hooks on Payload's ${kind} collection '${kind}s', found 0.`,
      );
    },
  );
});
