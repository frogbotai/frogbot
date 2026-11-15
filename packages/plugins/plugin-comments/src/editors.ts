import {
  BoldFeature,
  InlineCodeFeature,
  ItalicFeature,
  lexicalEditor,
  LinkFeature,
  MentionFeature,
  OrderedListFeature,
  ParagraphFeature,
  StrikethroughFeature,
  UnorderedListFeature,
} from '@frogbotai/richtext-lexical';

import type { CommentsEditor } from './types.js';

type LexicalArgs = NonNullable<Parameters<typeof lexicalEditor>[0]>;

/** A list of rich text features, as `lexicalEditor({ features })` takes. */
export type CommentFeatures = Extract<NonNullable<LexicalArgs['features']>, unknown[]>;

type LexicalAdapter = {
  editorConfig?: { lexical?: LexicalArgs['lexical'] };
  features?: { key: string }[];
  FieldComponent?: { serverProps?: Pick<LexicalArgs, 'admin' | 'views'> };
};

/**
 * The compact comment toolbar: bold, italic, strikethrough, inline code, links, lists and
 * mentions. For an `editor` line, for example `lexicalEditor({ features: [...commentFeatures(), UploadFeature()] })`.
 */
export function commentFeatures(): CommentFeatures {
  return [
    ParagraphFeature(),
    BoldFeature(),
    ItalicFeature(),
    StrikethroughFeature(),
    InlineCodeFeature(),
    LinkFeature(),
    UnorderedListFeature(),
    OrderedListFeature(),
    MentionFeature(),
  ];
}

/** `editor` with `MentionFeature()` added when it doesn't have it, since mentions drive notifications. */
export function withMentions(editor: CommentsEditor): CommentsEditor {
  return (args) => {
    const adapter = editor(args);
    const { editorConfig, features, FieldComponent } = adapter as LexicalAdapter;

    if (!features || features.some((feature) => feature.key === 'mention')) return adapter;

    return lexicalEditor({
      admin: FieldComponent?.serverProps?.admin,
      features: [...(features as CommentFeatures), MentionFeature()],
      lexical: editorConfig?.lexical,
      views: FieldComponent?.serverProps?.views,
    })(args);
  };
}
