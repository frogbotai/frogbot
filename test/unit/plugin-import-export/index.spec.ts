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

type ImportBeforeArgs = {
  data: Record<string, unknown>[];
  originalData: Record<string, unknown>[];
  importDoc: Record<string, unknown>;
};

function importBefore(collection: CollectionConfig | undefined) {
  const custom = collection?.custom?.['plugin-import-export'] as {
    importHooks: { before: (args: Record<string, unknown>) => Promise<unknown> };
  };

  return (args: ImportBeforeArgs) =>
    custom.importHooks.before({
      ...args,
      batchNumber: 1,
      format: 'csv',
      req: { payload: { collections: { posts: { config: { flattenedFields: postFields } } } } },
      totalBatches: 1,
    });
}

const postFields = [{ name: 'title', type: 'text' }];

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

  it.each(setups)(
    'the import collection on $name keeps 2 afterChange hooks and gains the column fields',
    async ({ options, slugs }) => {
      const collections = await buildCollections(options);
      const imports = collections.find(({ slug }) => slug === slugs[0]);
      const names = imports?.fields.map((field) => ('name' in field ? field.name : undefined));

      expect(imports?.hooks?.afterChange).toHaveLength(2);
      expect(names).toEqual(expect.arrayContaining(['columnMap', 'headerKey']));
      expect(names?.indexOf('columnMap')).toBe(names!.indexOf('preview') - 2);
    },
  );

  it.each([
    { ai: undefined, expected: false },
    { ai: { defaultModel: 'openai/gpt-5' }, expected: true },
    { ai: { smallModel: 'openai/gpt-5-mini' }, expected: true },
  ])('the Columns field gets the client component with ai $expected', async ({ ai, expected }) => {
    const config = await importExportPlugin({ collections: [] })({
      secret: 'test',
      db: {},
      ...(ai && { ai }),
      collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
    } as unknown as FrogBotConfig);

    const imports = config.collections?.find(({ slug }) => slug === 'imports');
    const columnMap = imports?.fields.find(
      (field) => 'name' in field && field.name === 'columnMap',
    );

    expect(columnMap?.admin?.components).toEqual({
      Field: {
        path: '@frogbotai/plugin-import-export/client#ImportColumnsField',
        clientProps: { ai: expected },
      },
    });
  });

  it('the all-collections default rewrites rows on every collection', async () => {
    const collections = await buildCollections({ collections: [] });
    const posts = collections.find(({ slug }) => slug === 'posts');

    const rows = await importBefore(posts)({
      data: [{ 'Post Title': 'Hello' }],
      originalData: [{ 'Post Title': 'Hello' }],
      importDoc: {
        columnMap: { headers: ['Post Title'], columns: [{ header: 'Post Title', field: 'title' }] },
      },
    });

    expect(rows).toEqual([{ title: 'Hello' }]);
    expect(posts?.hooks?.beforeOperation).toHaveLength(1);
  });

  it("the app's hooks.before runs after the rewrite and sees FrogBot keys", async () => {
    const appBefore = vi.fn(({ data }: { data: unknown[] }) => [...data, { title: 'Added' }]);

    const collections = await buildCollections({
      collections: [{ slug: 'posts', import: { hooks: { before: appBefore as never } } }],
    });

    const posts = collections.find(({ slug }) => slug === 'posts');

    const rows = await importBefore(posts)({
      data: [{ Headline: 'Hello' }],
      originalData: [{ Headline: 'Hello' }],
      importDoc: {
        columnMap: { headers: ['Headline'], columns: [{ header: 'Headline', field: 'title' }] },
      },
    });

    expect(appBefore.mock.calls[0][0].data).toEqual([{ title: 'Hello' }]);
    expect(rows).toEqual([{ title: 'Hello' }, { title: 'Added' }]);
  });

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
