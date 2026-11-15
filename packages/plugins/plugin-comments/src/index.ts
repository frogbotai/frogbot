import { lexicalEditor } from '@frogbotai/richtext-lexical';
import {
  type CollectionConfig,
  definePlugin,
  type Field,
  type FrogBotConfig,
  type Plugin,
} from 'frogbot';

import { createCommentsCollection, defaultCommentsSlug } from './collection.js';
import { withMentions } from './editors.js';
import { commentsCustomKey, commentsField, commentsFieldEditor } from './fields/comments.js';
import type {
  CommentsCollectionOptions,
  CommentsConfig,
  CommentsEditor,
  CommentsPluginOptions,
} from './types.js';

export { type CommentFeatures, commentFeatures } from './editors.js';
export { commentsField, type CommentsFieldOptions } from './fields/comments.js';
export type {
  CommentsCollectionOptions,
  CommentsCollectionOverrides,
  CommentsConfig,
  CommentsEditor,
  CommentsPluginOptions,
} from './types.js';

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-comments': CommentsPluginOptions;
  }
}

type Placed = (CommentsEditor | undefined)[];

function userSlug(config: FrogBotConfig): string {
  const authSlugs = config.collections
    .filter((collection) => collection.auth !== undefined && collection.auth !== false)
    .map((collection) => collection.slug);

  if (authSlugs.length === 0) return 'users';
  if (authSlugs.length === 1) return authSlugs[0];
  if (config.admin?.user && authSlugs.includes(config.admin.user)) return config.admin.user;
  throw new Error('[plugin-comments] Set admin.user when multiple auth collections exist.');
}

function placedEditors(fields: readonly Field[]): Placed {
  return fields.flatMap((field): Placed => {
    const editor = commentsFieldEditor(field);

    if (editor !== null) return [editor];
    if (field.type === 'tabs') return field.tabs.flatMap((tab) => placedEditors(tab.fields));

    return 'fields' in field ? placedEditors(field.fields) : [];
  });
}

function listed(options: CommentsPluginOptions): Map<string, CommentsCollectionOptions> {
  const { collections = [] } = options;

  if (Array.isArray(collections)) return new Map(collections.map((slug) => [slug, {}]));

  return new Map(
    Object.entries(collections).map(([slug, value]) => [slug, value === true ? {} : value]),
  );
}

function resolveEditors(config: FrogBotConfig, options: CommentsPluginOptions) {
  const fallback = options.editor ?? config.editor ?? lexicalEditor();
  const wrapped = new Map<CommentsEditor, string>();
  const editors = new Map<string, CommentsEditor>();
  const bodies: Record<string, string> = {};
  const extra = listed(options);

  const bodyFor = (editor: CommentsEditor) => {
    const known = wrapped.get(editor);

    if (known) return known;

    const name = `body_${wrapped.size}`;

    wrapped.set(editor, name);
    editors.set(name, withMentions(editor));

    return name;
  };

  const collections = config.collections.map((collection): CollectionConfig => {
    const placed = placedEditors(collection.fields);
    const own = extra.get(collection.slug);

    if (!placed.length && !own) return collection;

    const chosen = [...new Set(placed.map((editor) => editor ?? own?.editor ?? fallback))];

    if (chosen.length > 1) {
      throw new Error(
        `[plugin-comments] Collection '${collection.slug}' has comments fields with different editors.`,
      );
    }

    bodies[collection.slug] = bodyFor(chosen[0] ?? own?.editor ?? fallback);

    return placed.length
      ? collection
      : { ...collection, fields: [...collection.fields, commentsField({ editor: own?.editor })] };
  });

  return { bodies, collections, editors };
}

const comments = definePlugin<CommentsPluginOptions>({
  slug: 'plugin-comments',
  order: 95,
  plugin: ({ config, options }) => {
    const commentsSlug = options.overrides?.slug ?? defaultCommentsSlug;

    if (config.collections.some((collection) => collection.slug === commentsSlug)) {
      throw new Error(`[plugin-comments] Collection slug '${commentsSlug}' already exists.`);
    }

    const { bodies, collections, editors } = resolveEditors(config, options);
    const users = userSlug(config);
    const custom: CommentsConfig = { bodies, commentsSlug, userSlug: users };

    return {
      ...config,
      collections: [
        ...collections,
        createCommentsCollection({
          bodies,
          editors,
          overrides: options.overrides ?? {},
          userSlug: users,
        }),
      ],
      custom: { ...config.custom, [commentsCustomKey]: custom },
    };
  },
});

/**
 * Comments with @mentions on records. Adds a `comments` collection and a comments field to each
 * listed collection; a collection can also place `commentsField()` itself, anywhere in `fields`.
 */
export function commentsPlugin(options: CommentsPluginOptions = {}): Plugin {
  if (options.overrides?.slug === '') {
    throw new Error('[plugin-comments] overrides.slug cannot be empty.');
  }

  return comments(options);
}
