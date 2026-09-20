import {
  editorConfigFactory as upstreamEditorConfigFactory,
  type lexicalEditor as upstreamLexicalEditor,
  type LexicalRichTextAdapter,
  type SanitizedServerEditorConfig,
} from '@payloadcms/richtext-lexical';
import type { EditorConfig } from '@payloadcms/richtext-lexical/lexical';
import type { Field } from 'frogbot';

import { type ConfigInput, resolveConfig } from './resolveConfig.js';

type FeaturesInput = NonNullable<
  Parameters<typeof upstreamEditorConfigFactory.fromFeatures>[0]['features']
>;
type LexicalRichTextAdapterProvider = ReturnType<typeof upstreamLexicalEditor>;
type RichTextEditorField = Pick<Extract<Field, { type: 'richText' }>, 'editor' | 'type'>;
type UpstreamRichTextField = Parameters<
  typeof upstreamEditorConfigFactory.fromUnsanitizedField
>[0]['field'];

function isSanitizedLexicalEditor(editor: unknown): editor is LexicalRichTextAdapter {
  if (!editor || typeof editor !== 'object' || !('editorConfig' in editor)) {
    return false;
  }

  const editorConfig = editor.editorConfig;

  return (
    !!editorConfig &&
    typeof editorConfig === 'object' &&
    'features' in editorConfig &&
    Array.isArray(editorConfig.features) &&
    'resolvedFeatureMap' in editorConfig &&
    editorConfig.resolvedFeatureMap instanceof Map
  );
}

function sanitizedEditor(field: RichTextEditorField): SanitizedServerEditorConfig {
  const editor = field.editor;

  if (!isSanitizedLexicalEditor(editor)) {
    throw new Error(
      'FrogBot rich text requires a sanitized Lexical editor; use editorConfigFactory.fromUnsanitizedField for editor providers.',
    );
  }

  return editor.editorConfig;
}

export const editorConfigFactory = {
  default: async (args: { config: ConfigInput; parentIsLocalized?: boolean }) =>
    upstreamEditorConfigFactory.default({
      config: await resolveConfig(args.config),
      parentIsLocalized: args.parentIsLocalized,
    }),
  fromEditor: async (args: {
    config: ConfigInput;
    editor: LexicalRichTextAdapterProvider;
    isRoot?: boolean;
    lexical?: EditorConfig;
    parentIsLocalized?: boolean;
  }) =>
    upstreamEditorConfigFactory.fromEditor({
      ...args,
      config: await resolveConfig(args.config),
    }),
  fromFeatures: async (args: {
    config: ConfigInput;
    features?: FeaturesInput;
    isRoot?: boolean;
    lexical?: EditorConfig;
    parentIsLocalized?: boolean;
  }) =>
    upstreamEditorConfigFactory.fromFeatures({
      ...args,
      config: await resolveConfig(args.config),
    }),
  fromField: ({ field }: { field: RichTextEditorField }): SanitizedServerEditorConfig =>
    sanitizedEditor(field),
  fromUnsanitizedField: async (args: {
    config: ConfigInput;
    field: RichTextEditorField;
    isRoot?: boolean;
    parentIsLocalized?: boolean;
  }) => {
    if (typeof args.field.editor !== 'function') {
      throw new Error('FrogBot rich text requires a Lexical editor provider.');
    }

    const editor = args.field.editor as UpstreamRichTextField['editor'];
    const name =
      'name' in args.field && typeof args.field.name === 'string'
        ? args.field.name
        : '_frogbotRichText';

    return upstreamEditorConfigFactory.fromUnsanitizedField({
      config: await resolveConfig(args.config),
      field: {
        ...args.field,
        editor,
        name,
      },
      isRoot: args.isRoot,
      parentIsLocalized: args.parentIsLocalized,
    });
  },
};
