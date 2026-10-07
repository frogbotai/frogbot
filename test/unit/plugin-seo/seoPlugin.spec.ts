import type { CollectionConfig, Field, FrogBotConfig } from 'frogbot';
import { describe, expect, it } from 'vitest';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '../../../packages/plugins/plugin-seo/src/fields.js';
import { seoPlugin } from '../../../packages/plugins/plugin-seo/src/index.js';
import type { SEOPluginOptions } from '../../../packages/plugins/plugin-seo/src/types.js';

const slugs = { posts: 'posts', pages: 'pages', media: 'media', users: 'users' } as const;

type SEOTestField = {
  name?: string;
  fields?: SEOTestField[];
  tabs?: { name?: string; fields: SEOTestField[]; label?: unknown }[];
};

function countMeta(fields: SEOTestField[]): number {
  return fields.reduce(
    (count, field) =>
      count +
      Number(field.name === 'meta') +
      countMeta(field.fields ?? []) +
      (field.tabs?.reduce(
        (total, tab) => total + Number(tab.name === 'meta') + countMeta(tab.fields),
        0,
      ) ?? 0),
    0,
  );
}

function metaTab(fields: Field[] = [MetaTitleField({})]): Field[] {
  return [
    {
      type: 'tabs',
      tabs: [
        { label: 'Content', fields: [{ name: 'title', type: 'text' }] },
        { name: 'meta', label: 'Search', fields },
      ],
    },
  ];
}

async function applySEO({
  fields,
  options = { collections: [slugs.pages] },
}: {
  fields: Field[];
  options?: SEOPluginOptions;
}) {
  const collection: CollectionConfig = { slug: slugs.pages, fields };
  const config: FrogBotConfig = {
    secret: 'test-secret',
    db: {} as FrogBotConfig['db'],
    collections: [collection],
  };

  const result = await seoPlugin(options)(config);

  return { collection, result, updated: result.collections[0] };
}

describe('seoPlugin', () => {
  it.each([false, true])('injects exactly one meta group with tabbedUI=%s', async (tabbedUI) => {
    const { updated } = await applySEO({
      fields: [{ name: 'title', type: 'text' }],
      options: { collections: [slugs.pages], tabbedUI },
    });

    expect(countMeta(updated.fields)).toBe(1);
  });

  it('adds an SEO tab when tabbedUI is enabled', async () => {
    const { updated } = await applySEO({
      fields: [{ name: 'title', type: 'text' }],
      options: { collections: [slugs.pages], tabbedUI: true },
    });

    expect(updated.fields).toMatchObject([
      { type: 'tabs', tabs: [{ label: 'Content' }, { label: 'SEO' }] },
    ]);
  });

  it.each([false, true])('preserves a hand-placed meta tab with tabbedUI=%s', async (tabbedUI) => {
    const fields = metaTab();
    const originalFields = structuredClone(fields);

    const { collection, updated } = await applySEO({
      fields,
      options: { collections: [slugs.pages], tabbedUI },
    });

    expect(updated).toBe(collection);
    expect(updated.fields).toEqual(originalFields);
    expect(countMeta(updated.fields)).toBe(1);
  });

  it('leaves an unlisted hand-placed collection untouched', async () => {
    const fields = metaTab();

    const { collection, updated } = await applySEO({
      fields,
      options: { collections: [slugs.posts] },
    });

    expect(updated).toBe(collection);
    expect(updated.fields).toEqual(fields);
  });

  it('injects when a factory override replaces the SEO component path', async () => {
    const fields = metaTab([
      MetaTitleField({
        overrides: { admin: { components: { Field: 'custom/fields#Title' } } },
      }),
    ]);

    const { updated } = await applySEO({ fields });

    expect(countMeta(updated.fields)).toBe(2);
    expect(updated.fields.at(-1)).toMatchObject({ name: 'meta', type: 'group' });
  });

  it('detects all five FrogBot factories in a hand-placed group', async () => {
    const fields: Field[] = [
      {
        name: 'meta',
        type: 'group',
        fields: [
          OverviewField({}),
          MetaTitleField({ hasGenerateFn: true }),
          MetaDescriptionField({ hasGenerateFn: true }),
          MetaImageField({ relationTo: slugs.media }),
          PreviewField({ hasGenerateFn: true }),
        ],
      },
    ];

    const { collection, updated } = await applySEO({ fields });

    expect(updated).toBe(collection);
    expect(updated.fields).toEqual(fields);
    expect(countMeta(updated.fields)).toBe(1);
  });

  it('detects SEO fields nested in a row, collapsible, and group', async () => {
    const fields: Field[] = [
      {
        type: 'row',
        fields: [
          {
            type: 'collapsible',
            label: 'Search',
            fields: [{ name: 'meta', type: 'group', fields: [MetaTitleField({})] }],
          },
        ],
      },
    ];

    const { collection, updated } = await applySEO({ fields });

    expect(updated).toBe(collection);
    expect(countMeta(updated.fields)).toBe(1);
  });

  it('skips injection for a single MetaTitleField', async () => {
    const fields = [MetaTitleField({})];

    const { collection, updated } = await applySEO({ fields });

    expect(updated).toBe(collection);
    expect(updated.fields).toEqual(fields);
    expect(countMeta(updated.fields)).toBe(0);
  });

  it.each([false, true])(
    'preserves SEO fields in the first tab with tabbedUI=%s',
    async (tabbedUI) => {
      const fields: Field[] = [
        {
          type: 'tabs',
          tabs: [
            { name: 'meta', label: 'Search', fields: [MetaTitleField({})] },
            { label: 'Content', fields: [{ name: 'title', type: 'text' }] },
          ],
        },
      ];

      const { collection, updated } = await applySEO({
        fields,
        options: { collections: [slugs.pages], tabbedUI },
      });

      expect(updated).toBe(collection);
      expect(countMeta(updated.fields)).toBe(1);
    },
  );

  it('strips empty globals reintroduced by a later plugin', async () => {
    const config = await buildConfig({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [{ slug: slugs.users, auth: true, fields: [] }],
      plugins: [seoPlugin({ collections: [] }), (current) => ({ ...current, globals: [] })],
    });

    expect(config).not.toHaveProperty('globals');
  });

  it.each(['Overview', 'MetaTitle', 'MetaDescription', 'MetaImage', 'Preview'])(
    'detects the string path for %sComponent',
    async (component) => {
      const fields: Field[] = [
        {
          name: 'customSEO',
          type: 'ui',
          admin: { components: { Field: `@payloadcms/plugin-seo/client#${component}Component` } },
        },
      ];

      const { collection, updated } = await applySEO({ fields });

      expect(updated).toBe(collection);
    },
  );

  it.each([
    OverviewField({}),
    MetaTitleField({}),
    MetaDescriptionField({}),
    MetaImageField({ relationTo: slugs.media }),
    PreviewField({}),
  ])('detects the object path for the $name factory', async (field) => {
    const { collection, updated } = await applySEO({ fields: [field] });

    expect(updated).toBe(collection);
  });

  it('does not treat SEO fields inside blocks as collection SEO fields', async () => {
    const { updated } = await applySEO({
      fields: [
        {
          name: 'layout',
          type: 'blocks',
          blocks: [{ slug: 'search', fields: [MetaTitleField({})] }],
        },
      ],
    });

    expect(updated.fields.at(-1)).toMatchObject({ name: 'meta', type: 'group' });
  });

  it('injects for ordinary fields named meta without SEO components', async () => {
    const { updated } = await applySEO({
      fields: [{ name: 'meta', type: 'group', fields: [{ name: 'title', type: 'text' }] }],
    });

    expect(countMeta(updated.fields)).toBe(2);
  });

  it('passes the field override and existing endpoints through upstream', async () => {
    const config: FrogBotConfig = {
      secret: 'test-secret',
      db: {} as FrogBotConfig['db'],
      collections: [{ slug: slugs.posts, fields: [] }],
      endpoints: [{ path: '/existing', method: 'get', handler: () => new Response('ok') }],
    };

    const result = await seoPlugin({
      collections: [slugs.posts],
      fields: ({ defaultFields }) => [...defaultFields, { name: 'keywords', type: 'text' }],
      interfaceName: 'PostSEO',
    })(config);

    expect(result.collections[0].fields).toMatchObject([
      {
        name: 'meta',
        interfaceName: 'PostSEO',
        fields: expect.arrayContaining([{ name: 'keywords', type: 'text' }]),
      },
    ]);
    expect(result.endpoints).toContain(config.endpoints![0]);
  });

  it.each([false, true])(
    'builds mixed layouts with one meta each with tabbedUI=%s',
    async (tabbedUI) => {
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [
          { slug: slugs.users, auth: true, fields: [] },
          { slug: slugs.posts, fields: [{ name: 'title', type: 'text' }] },
          { slug: slugs.pages, fields: metaTab() },
        ],
        plugins: [seoPlugin({ collections: [slugs.posts, slugs.pages], tabbedUI })],
      });

      const payloadConfig = await config._internal.payloadConfig;
      const posts = payloadConfig.collections.find(({ slug }) => slug === slugs.posts)!;
      const pages = payloadConfig.collections.find(({ slug }) => slug === slugs.pages)!;

      expect(countMeta(posts.fields)).toBe(1);
      expect(countMeta(pages.fields)).toBe(1);
    },
  );

  it('registers all four generation endpoints in the built config', async () => {
    const config = await buildConfig({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [{ slug: slugs.users, auth: true, fields: [] }],
      plugins: [seoPlugin({ collections: [] })],
    });

    const payloadConfig = await config._internal.payloadConfig;

    expect(payloadConfig.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'post', path: '/plugin-seo/generate-title' }),
        expect.objectContaining({ method: 'post', path: '/plugin-seo/generate-description' }),
        expect.objectContaining({ method: 'post', path: '/plugin-seo/generate-url' }),
        expect.objectContaining({ method: 'post', path: '/plugin-seo/generate-image' }),
      ]),
    );
  });
});
