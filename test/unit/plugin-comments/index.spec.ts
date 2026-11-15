import { activityField } from '@frogbotai/plugin-audit-log';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import type { CollectionConfig, Field, FrogBotConfig } from 'frogbot';
import type { SanitizedConfig } from 'payload';
import { describe, expect, it } from 'vitest';

import {
  commentFeatures,
  type CommentsConfig,
  commentsField,
  commentsPlugin,
} from '../../../packages/plugins/plugin-comments/src/index.js';

const root = lexicalEditor();
const compact = lexicalEditor({ features: commentFeatures() });
const plain = lexicalEditor({ features: ({ defaultFeatures }) => defaultFeatures.slice(0, 3) });

function config(collections: CollectionConfig[], editor = root): FrogBotConfig {
  return {
    secret: 'test',
    db: {} as FrogBotConfig['db'],
    editor,
    collections: [{ slug: 'users', auth: true, fields: [] }, ...collections],
  };
}

async function apply(base: FrogBotConfig, options: Parameters<typeof commentsPlugin>[0] = {}) {
  const result = await commentsPlugin(options)(base);
  const comments = result.collections.find((collection) => collection.slug === 'comments');
  const custom = result.custom?.['plugin-comments'] as CommentsConfig;

  return { comments, custom, result };
}

function bodyField(comments: CollectionConfig | undefined, name: string) {
  return comments?.fields.find((field) => 'name' in field && field.name === name) as
    Extract<Field, { type: 'richText' }> | undefined;
}

function featureKeys(field: Extract<Field, { type: 'richText' }> | undefined) {
  const editor = field?.editor;

  if (typeof editor !== 'function') throw new Error('Expected an editor provider.');

  const adapter = editor({
    config: {
      collections: [{ slug: 'users', auth: {}, admin: {} }],
      i18n: { translations: {} },
    } as unknown as SanitizedConfig,
    parentIsLocalized: false,
  }) as unknown as { features: { key: string }[] };

  return adapter.features.map((feature) => feature.key);
}

const deals = (fields: Field[] = []): CollectionConfig => ({ slug: 'deals', fields });
const tasks = (fields: Field[] = []): CollectionConfig => ({ slug: 'tasks', fields });

describe('commentsPlugin', () => {
  it('adds a comments field to listed collections and uses the root editor plus mentions', async () => {
    const { comments, custom, result } = await apply(config([deals(), tasks()]), {
      collections: ['deals'],
    });

    const fields = result.collections.find((collection) => collection.slug === 'deals')?.fields;

    expect(fields?.at(-1)).toMatchObject({ name: 'comments', type: 'ui' });
    expect(result.collections.find((collection) => collection.slug === 'tasks')?.fields).toEqual(
      [],
    );
    expect(custom).toEqual({
      bodies: { deals: 'body_0' },
      commentsSlug: 'comments',
      userSlug: 'users',
    });
    expect(featureKeys(bodyField(comments, 'body_0'))).toContain('mention');
    expect(featureKeys(bodyField(comments, 'body_0'))).toContain('heading');
  });

  it('finds commentsField() placed in a tab next to activityField(), without adding another', async () => {
    const placed = deals([
      {
        type: 'tabs',
        tabs: [
          { label: 'Comments', fields: [commentsField()] },
          { label: 'Activity', fields: [activityField()] },
        ],
      },
    ]);

    const { custom, result } = await apply(config([placed]), { collections: ['deals'] });

    expect(custom.bodies).toEqual({ deals: 'body_0' });
    expect(
      result.collections.find((collection) => collection.slug === 'deals')?.fields,
    ).toHaveLength(1);
  });

  it('follows root, then plugin, then field, and shares a body field between equal editors', async () => {
    const { comments, custom } = await apply(
      config([deals([commentsField({ editor: plain })]), tasks(), { slug: 'notes', fields: [] }]),
      { collections: ['tasks', 'notes'], editor: compact },
    );

    expect(custom.bodies).toEqual({ deals: 'body_0', notes: 'body_1', tasks: 'body_1' });
    expect(featureKeys(bodyField(comments, 'body_0'))).toEqual([
      'bold',
      'italic',
      'underline',
      'mention',
    ]);
    expect(featureKeys(bodyField(comments, 'body_0'))).not.toContain('heading');
    expect(featureKeys(bodyField(comments, 'body_1'))).toContain('strikethrough');
    expect(
      featureKeys(bodyField(comments, 'body_1')).filter((key) => key === 'mention'),
    ).toHaveLength(1);
  });

  it('takes a per-collection editor when the plugin adds the field', async () => {
    const { custom } = await apply(config([deals(), tasks()]), {
      collections: { deals: { editor: compact }, tasks: true },
    });

    expect(custom.bodies).toEqual({ deals: 'body_0', tasks: 'body_1' });
  });

  it('keeps the body fields hidden and the record keys immutable', async () => {
    const { comments } = await apply(config([deals()]), { collections: ['deals'] });
    const named = (name: string) =>
      comments?.fields.find((field) => 'name' in field && field.name === name);

    expect(bodyField(comments, 'body_0')?.admin?.hidden).toBe(true);
    expect(named('body')).toMatchObject({ type: 'json', virtual: true });

    for (const name of ['collection', 'documentId', 'author']) {
      expect((named(name) as { access?: { update?: () => boolean } }).access?.update?.()).toBe(
        false,
      );
    }

    expect(comments?.versions).toBe(false);
  });

  it('rejects two comments fields with different editors in one collection', async () => {
    const base = config([
      deals([commentsField({ editor: plain }), commentsField({ name: 'more', editor: compact })]),
    ]);

    await expect(apply(base)).rejects.toThrow("Collection 'deals' has comments fields");
  });

  it('rejects a taken slug', async () => {
    await expect(apply(config([{ slug: 'comments', fields: [] }]))).rejects.toThrow(
      "Collection slug 'comments' already exists",
    );
  });

  it('takes overrides', async () => {
    const { comments, custom } = await apply(config([deals()]), {
      collections: ['deals'],
      overrides: { slug: 'notes-on-records', admin: { group: 'Team' } },
    });

    expect(comments).toBeUndefined();
    expect(custom.commentsSlug).toBe('notes-on-records');
  });
});
