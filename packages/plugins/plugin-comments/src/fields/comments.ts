import type { UIField } from 'frogbot';

import type { CommentsEditor } from '../types.js';

/** Where `commentsField()` keeps its editor, and the plugin its config, under `custom`. */
export const commentsCustomKey = 'plugin-comments';

/** Options for `commentsField()`: normal `ui` field options, plus this collection's editor. */
export type CommentsFieldOptions = Partial<Omit<UIField, 'type'>> & {
  /** The editor for this collection's comments. Overrides the plugin's `editor` and the app's. */
  editor?: CommentsEditor;
};

/**
 * A `ui` field that lists the open record's comments, oldest first, with a box to add one. Put
 * it anywhere in a collection's `fields`, alone or in a tab next to `activityField()`.
 */
export function commentsField({ editor, ...overrides }: CommentsFieldOptions = {}): UIField {
  return {
    name: 'comments',
    label: 'Comments',
    ...overrides,
    type: 'ui',
    custom: { ...overrides.custom, [commentsCustomKey]: { editor } },
    admin: {
      ...overrides.admin,
      components: {
        Field: '@frogbotai/plugin-comments/rsc#CommentsField',
        ...overrides.admin?.components,
      },
    },
  };
}

/** The editor a `commentsField()` sets, or `null` when `field` isn't one. */
export function commentsFieldEditor(field: unknown): CommentsEditor | null | undefined {
  const custom = (field as { custom?: Record<string, unknown>; type?: string }).custom;
  const options = custom?.[commentsCustomKey] as { editor?: CommentsEditor } | undefined;

  if ((field as { type?: string }).type !== 'ui' || !options) return null;

  return options.editor;
}
