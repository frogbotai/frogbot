import { describe, expect, it } from 'vitest';

import type { CollectionConfig } from '../../../../packages/frogbot/src/collections/config/types.js';
import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { sanitizeSearchIndexes } from '../../../../packages/frogbot/src/search/sanitize.js';

function articles(overrides: Partial<CollectionConfig> = {}): CollectionConfig {
  return {
    slug: 'articles',
    versions: { drafts: true },
    trash: true,
    fields: [
      { name: 'title', type: 'text' },
      { name: 'body', type: 'textarea' },
      { name: 'category', type: 'select', options: ['guide', 'reference'] },
      { name: 'embedding', type: 'vector', dimensions: 3 },
    ],
    search: {
      content: {
        lexical: { fields: ['title', 'body'] },
        vector: { field: 'embedding' },
      },
      titles: { lexical: { fields: ['title'] } },
    },
    ...overrides,
  };
}

function index(value: unknown, fields?: CollectionConfig['fields']): CollectionConfig {
  return articles({
    ...(fields ? { fields } : {}),
    search: { content: value } as CollectionConfig['search'],
  });
}

describe('collection search configuration', () => {
  it('normalizes named lexical, vector and hybrid modes from the authored field shape', () => {
    const descriptors = sanitizeSearchIndexes(articles());

    expect(descriptors?.content).toMatchObject({
      name: 'content',
      lexical: {
        fields: [
          { path: 'title', localized: false },
          { path: 'body', localized: false },
        ],
      },
      vector: { path: 'embedding', localized: false, dimensions: 3, metric: 'cosine' },
      hybrid: { fusion: 'rrf', weights: { lexical: 1, vector: 1 } },
    });

    expect(descriptors?.titles).toMatchObject({
      name: 'titles',
      lexical: { fields: [{ path: 'title', localized: false }] },
    });
    expect(descriptors?.titles.vector).toBeUndefined();
    expect(descriptors?.titles.hybrid).toBeUndefined();
    expect(descriptors?.content.filterFields).toMatchObject({
      id: { path: 'id', type: 'id', many: false },
      _status: { path: '_status', type: 'string', many: false },
      deletedAt: { path: 'deletedAt', type: 'date', many: false },
      title: { path: 'title', type: 'string', many: false },
      body: { path: 'body', type: 'string', many: false },
      category: { path: 'category', type: 'string', many: false },
    });
    expect(descriptors?.content.filterFields).not.toHaveProperty('embedding');
  });

  it('strips public search before runtime config and retains only normalized private metadata', async () => {
    const collection = articles({
      custom: {
        application: 'original',
        frogbot: { feature: 'keep', search: { forged: true }, signIn: ['forged'] },
      },
    });
    const config: FrogBotConfig = {
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as FrogBotConfig['db'],
      collections: [collection],
    };

    const sanitized = sanitize(config);
    const payload = await sanitized._internal.payloadConfig;
    const runtime = payload.collections.find(({ slug }) => slug === 'articles');
    const meta = sanitized.collections.find(({ slug }) => slug === 'articles');

    expect(runtime).toBeDefined();
    expect(runtime).not.toHaveProperty('search');
    expect(runtime?.custom).toMatchObject({
      application: 'original',
      frogbot: { feature: 'keep', search: { content: { name: 'content' } } },
    });
    expect(runtime?.custom?.frogbot?.search).not.toHaveProperty('forged');
    expect(runtime?.custom?.frogbot).not.toHaveProperty('signIn');
    expect(runtime?.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'embedding', type: 'json' })]),
    );
    expect(meta?.search?.content).toMatchObject({
      vector: { path: 'embedding', dimensions: 3 },
    });
    expect(runtime?.custom?.frogbot?.search).toEqual(meta?.search);
    expect(Object.keys(meta?.search ?? {})).toEqual(['content', 'titles']);
    expect(collection.search?.content.vector?.field).toBe('embedding');
  });

  it('drops forged search metadata when no public search is declared', async () => {
    const config: FrogBotConfig = {
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as FrogBotConfig['db'],
      collections: [
        articles({ search: undefined, custom: { frogbot: { feature: 'keep', search: {} } } }),
      ],
    };

    const runtime = (await sanitize(config)._internal.payloadConfig).collections.find(
      ({ slug }) => slug === 'articles',
    );

    expect(runtime?.custom?.frogbot).toMatchObject({ feature: 'keep' });
    expect(runtime?.custom?.frogbot).not.toHaveProperty('search');
  });

  it('resolves single-valued named groups, tabs, and inherited localized paths', () => {
    const descriptors = sanitizeSearchIndexes(
      articles({
        fields: [
          {
            name: 'details',
            type: 'group',
            localized: true,
            fields: [
              { name: 'embedding', type: 'vector', dimensions: 4 },
              {
                type: 'tabs',
                tabs: [
                  {
                    name: 'copy',
                    label: 'Copy',
                    fields: [{ name: 'title', type: 'text' }],
                  },
                  {
                    label: 'Other',
                    fields: [{ name: 'summary', type: 'textarea' }],
                  },
                ],
              },
            ],
          },
        ],
        search: {
          localized: {
            lexical: { fields: ['details.copy.title', 'details.summary'] },
            vector: { field: 'details.embedding' },
          },
        },
      }),
    );

    expect(descriptors?.localized.lexical?.fields).toEqual([
      { path: 'details.copy.title', localized: true },
      { path: 'details.summary', localized: true },
    ]);
    expect(descriptors?.localized.vector).toEqual({
      path: 'details.embedding',
      dimensions: 4,
      localized: true,
      metric: 'cosine',
    });
    expect(descriptors?.localized.filterFields['details.copy.title']).toMatchObject({
      localized: true,
    });
    expect(descriptors?.localized.filterFields).toHaveProperty('_status');
  });

  it('includes stored scalar arrays and monomorphic relationship IDs but excludes unknown trees and credentials', () => {
    const descriptors = sanitizeSearchIndexes(
      articles({
        auth: true,
        fields: [
          { name: 'title', type: 'text', hasMany: false },
          { name: 'tags', type: 'text', hasMany: true },
          { name: 'scores', type: 'number', hasMany: true },
          { name: 'active', type: 'checkbox' },
          { name: 'publishedAt', type: 'date' },
          { name: 'asset', type: 'upload', relationTo: 'uploads' },
          { name: 'authors', type: 'relationship', relationTo: 'users', hasMany: true },
          { name: 'mixed', type: 'relationship', relationTo: ['users', 'teams'] },
          { name: 'blob', type: 'json' },
          { name: 'content', type: 'richText' },
          { name: 'computed', type: 'text', virtual: true },
          { name: 'secret', type: 'text' },
          { name: 'password', type: 'text' },
          { name: 'hash', type: 'text' },
          { name: 'apiKey', type: 'text' },
          { name: 'credentials', type: 'text' },
          { name: 'embedding', type: 'vector', dimensions: 3 },
          { name: 'rows', type: 'array', fields: [{ name: 'tag', type: 'text' }] },
        ],
        search: { content: { lexical: { fields: ['title'] }, vector: { field: 'embedding' } } },
      }),
    );

    const filters = descriptors?.content.filterFields;

    expect(filters?.tags).toMatchObject({ type: 'string', many: true });
    expect(filters?.scores).toMatchObject({ type: 'number', many: true });
    expect(filters?.active).toMatchObject({ type: 'boolean', many: false });
    expect(filters?.publishedAt).toMatchObject({ type: 'date', many: false });
    expect(filters?.asset).toMatchObject({ type: 'id', many: false });
    expect(filters?.authors).toMatchObject({ type: 'id', many: true });

    for (const path of [
      'mixed',
      'blob',
      'content',
      'computed',
      'secret',
      'password',
      'hash',
      'apiKey',
      'credentials',
      'embedding',
      'rows.tag',
    ]) {
      expect(filters).not.toHaveProperty(path);
    }
  });

  it('omits read-guarded fields and descendants from automatic filter eligibility', () => {
    const collection = articles({
      fields: [
        { name: 'title', type: 'text', access: { read: () => false } },
        { name: 'embedding', type: 'vector', dimensions: 3, access: { read: () => false } },
        { name: 'createdOnly', type: 'text', access: { create: () => true } },
        {
          name: 'restricted',
          type: 'group',
          access: { read: () => false },
          fields: [{ name: 'category', type: 'select', options: ['guide'] }],
        },
        {
          type: 'tabs',
          tabs: [
            {
              name: 'private',
              label: 'Private',
              access: { read: () => false },
              fields: [{ name: 'notes', type: 'textarea' }],
            },
          ],
        },
      ],
      search: {
        content: {
          lexical: { fields: ['title'] },
          vector: { field: 'embedding' },
        },
      },
    });

    const descriptor = sanitizeSearchIndexes(collection)?.content;

    expect(descriptor?.lexical?.fields).toEqual([{ path: 'title', localized: false }]);
    expect(descriptor?.vector?.path).toBe('embedding');
    expect(descriptor?.filterFields.createdOnly).toMatchObject({ type: 'string' });

    for (const path of ['title', 'embedding', 'restricted.category', 'private.notes']) {
      expect(descriptor?.filterFields).not.toHaveProperty(path);
    }

    expect(() =>
      sanitizeSearchIndexes({
        ...collection,
        search: { content: { lexical: { fields: ['title'] }, filters: { fields: ['title'] } } },
      }),
    ).toThrow("filter field 'title' is not eligible stored metadata");
  });

  it('narrows filter metadata per index without losing required identity and visibility paths', () => {
    const configured = articles({
      search: {
        narrow: {
          lexical: { fields: ['body'] },
          filters: { fields: ['category'] },
        },
        exclude: {
          lexical: { fields: ['body'] },
          filters: { exclude: ['body'] },
        },
      },
    });
    const descriptors = sanitizeSearchIndexes(configured);

    expect(Object.keys(descriptors?.narrow.filterFields ?? {})).toEqual([
      'id',
      'deletedAt',
      '_status',
      'category',
    ]);
    expect(descriptors?.exclude.lexical?.fields).toEqual([{ path: 'body', localized: false }]);
    expect(descriptors?.exclude.filterFields).not.toHaveProperty('body');
  });

  it('omits status, trash and timestamp filters when those storage features are disabled', () => {
    const descriptors = sanitizeSearchIndexes(
      articles({ versions: false, trash: false, timestamps: false }),
    );

    expect(Object.keys(descriptors?.content.filterFields ?? {})).toEqual([
      'id',
      'title',
      'body',
      'category',
    ]);
  });

  it('marks draft status localized only when localizeStatus is enabled for the runtime', () => {
    const collection = articles({ versions: { drafts: { localizeStatus: true } } });

    expect(sanitizeSearchIndexes(collection)?.content.filterFields._status.localized).toBe(false);
    expect(
      sanitizeSearchIndexes(collection, { localizeStatus: true })?.content.filterFields._status
        .localized,
    ).toBe(true);
  });

  it.each([
    [{}, 'at least one named index'],
    [{ 'Bad name': { lexical: { fields: ['title'] } } }, 'lowercase search index slug'],
    [{ content: {} }, 'configure lexical and/or vector'],
    [{ content: { hybrid: true } }, 'configure lexical and/or vector'],
  ])('rejects invalid search definitions %j', (search, reason) => {
    expect(() => sanitizeSearchIndexes(articles({ search } as Partial<CollectionConfig>))).toThrow(
      reason,
    );
  });

  it.each([
    [{ lexical: { fields: [] } }, 'lexical.fields'],
    [{ lexical: { fields: ['title', 'title'] } }, 'distinct'],
    [{ lexical: { fields: ['missing'] } }, 'does not exist'],
    [{ lexical: { fields: ['embedding'] } }, 'unsupported field type'],
    [{ lexical: { fields: ['title..body'] } }, 'valid field paths'],
    [{ lexical: { fields: ['title'], language: '' } }, 'lexical.language'],
    [{ vector: { field: 'body' } }, 'unsupported field type'],
    [{ vector: { field: 'absent' } }, 'does not exist'],
    [{ vector: { field: 'embedding', dimensions: 4 } }, "does not support 'dimensions'"],
    [{ vector: { field: 'embedding', metric: 'manhattan' } }, 'vector.metric'],
    [{ vector: { field: 'embedding', metric: null } }, 'vector.metric'],
    [{ lexical: { fields: ['title'] }, hybrid: {} }, 'hybrid requires both'],
    [
      { lexical: { fields: ['title'] }, vector: { field: 'embedding' }, hybrid: { fusion: 'sum' } },
      'hybrid.fusion',
    ],
    [
      {
        lexical: { fields: ['title'] },
        vector: { field: 'embedding' },
        hybrid: { weights: { lexical: 0, vector: 1 } },
      },
      'positive finite',
    ],
    [
      {
        lexical: { fields: ['title'] },
        vector: { field: 'embedding' },
        hybrid: { weights: { lexical: Infinity, vector: 1 } },
      },
      'positive finite',
    ],
    [
      { lexical: { fields: ['title'] }, filters: { fields: ['category'], exclude: ['body'] } },
      'exactly one',
    ],
    [{ lexical: { fields: ['title'] }, filters: { exclude: ['id'] } }, 'required for visibility'],
    [{ lexical: { fields: ['title'] }, filters: { fields: ['embedding'] } }, 'not eligible'],
    [{ lexical: { fields: ['title'] }, filters: { fields: ['missing'] } }, 'not eligible'],
    [{ lexical: { fields: ['title'] }, filters: { fields: ['title', 'title'] } }, 'distinct'],
    [{ lexical: { fields: ['title'] }, filters: {} }, 'exactly one'],
  ])('rejects invalid index options %j', (definition, reason) => {
    expect(() => sanitizeSearchIndexes(index(definition))).toThrow(reason);
  });

  const repeatedVectors: [CollectionConfig['fields'][number], string][] = [
    [
      {
        name: 'rows',
        type: 'array',
        fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }],
      },
      'rows.embedding',
    ],
    [
      {
        name: 'content',
        type: 'blocks',
        blocks: [{ slug: 'text', fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }] }],
      },
      'content.embedding',
    ],
  ];

  it.each(repeatedVectors)('rejects repeated vector paths under %s', (field, path) => {
    expect(() => sanitizeSearchIndexes(index({ vector: { field: path } }, [field]))).toThrow(
      'single-valued',
    );
  });

  it('rejects ambiguous paths in unnamed tabs instead of silently choosing a field', () => {
    expect(() =>
      sanitizeSearchIndexes(
        index({ lexical: { fields: ['title'] } }, [
          {
            type: 'tabs',
            tabs: [
              { label: 'First', fields: [{ name: 'title', type: 'text' }] },
              { label: 'Second', fields: [{ name: 'title', type: 'text' }] },
            ],
          },
        ]),
      ),
    ).toThrow('ambiguous');
  });

  it('rejects repeated lexical values rather than treating a scalar array as text', () => {
    expect(() =>
      sanitizeSearchIndexes(
        index({ lexical: { fields: ['tags'] } }, [{ name: 'tags', type: 'text', hasMany: true }]),
      ),
    ).toThrow('single-valued');
  });

  it('rejects paths inside virtual or hidden parent groups', () => {
    for (const parent of [{ virtual: true }, { hidden: true }]) {
      expect(() =>
        sanitizeSearchIndexes(
          index({ vector: { field: 'details.embedding' } }, [
            {
              name: 'details',
              type: 'group',
              fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }],
              ...parent,
            },
          ]),
        ),
      ).toThrow('stored and readable');
    }
  });

  it('allows multiple named indexes to use the same vector with different metrics', () => {
    const descriptors = sanitizeSearchIndexes(
      articles({
        search: {
          first: { vector: { field: 'embedding' } },
          second: { vector: { field: 'embedding', metric: 'dotProduct' } },
        },
      }),
    );

    expect(descriptors?.first.vector?.dimensions).toBe(3);
    expect(descriptors?.second.vector?.dimensions).toBe(3);
    expect(descriptors?.second.vector?.metric).toBe('dotProduct');
  });
});
