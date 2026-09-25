import type { FrogBotConfig } from '../../config/types.js';

type FieldRecord = Record<string, unknown>;

function visitFields(
  fields: unknown[],
  scope: string,
  parentPath: string[],
  hasRootEditor: boolean,
  visited: WeakSet<object>,
): void {
  for (const field of fields) {
    if (!field || typeof field !== 'object') continue;

    const value = field as FieldRecord;

    if (visited.has(value)) continue;

    visited.add(value);

    const name = typeof value.name === 'string' ? value.name : undefined;
    const path = name ? [...parentPath, name] : parentPath;

    if (value.type === 'richText' && !value.editor && !hasRootEditor) {
      const fieldPath = path.length > 0 ? path.join('.') : '(unnamed field)';

      throw new Error(
        `[frogbot] Rich text field '${fieldPath}' in ${scope} requires a Lexical editor. Install @frogbotai/richtext-lexical and configure editor: lexicalEditor({}) at the config root or on this field.`,
      );
    }

    if (Array.isArray(value.fields)) {
      visitFields(value.fields, scope, path, hasRootEditor, visited);
    }

    if (Array.isArray(value.tabs)) {
      for (const tab of value.tabs) {
        if (!tab || typeof tab !== 'object') continue;

        const tabFields = (tab as FieldRecord).fields;

        if (Array.isArray(tabFields)) {
          visitFields(tabFields, scope, path, hasRootEditor, visited);
        }
      }
    }

    const blocks = Array.isArray(value.blockReferences) ? value.blockReferences : value.blocks;

    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue;

        const blockFields = (block as FieldRecord).fields;

        if (Array.isArray(blockFields)) {
          visitFields(blockFields, scope, path, hasRootEditor, visited);
        }
      }
    }
  }
}

export function assertRichTextEditor(
  config: Pick<FrogBotConfig, 'admin' | 'collections' | 'editor'>,
): void {
  const hasRootEditor = Boolean(config.editor);
  const visited = new WeakSet<object>();

  for (const collection of config.collections) {
    visitFields(collection.fields, `collection '${collection.slug}'`, [], hasRootEditor, visited);
  }

  const widgets = (
    config.admin as
      { dashboard?: { widgets?: { fields?: unknown[]; slug?: string }[] } } | undefined
  )?.dashboard?.widgets;

  for (const widget of widgets ?? []) {
    if (!Array.isArray(widget.fields)) continue;

    visitFields(
      widget.fields,
      `admin dashboard widget '${widget.slug ?? '(unnamed widget)'}'`,
      [],
      hasRootEditor,
      visited,
    );
  }
}
