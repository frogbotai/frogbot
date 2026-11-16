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

const placeholder = 'Add a comment or @mention someone';

function withPlaceholder<T>(adapter: T): T {
  const { FieldComponent } = adapter as LexicalAdapter;
  const serverProps = FieldComponent?.serverProps;

  if (!FieldComponent || typeof FieldComponent !== 'object' || serverProps?.admin?.placeholder) {
    return adapter;
  }

  return {
    ...adapter,
    FieldComponent: {
      ...FieldComponent,
      serverProps: { ...serverProps, admin: { ...serverProps?.admin, placeholder } },
    },
  };
}

/**
 * `editor` for comments: `MentionFeature()` is added when it's missing, since mentions drive
 * notifications, and the box says "Add a comment or @mention someone" unless the editor sets
 * its own `admin.placeholder`.
 */
export function withMentions(editor: CommentsEditor): CommentsEditor {
  return (args) => {
    const adapter = editor(args);
    const { editorConfig, features, FieldComponent } = adapter as LexicalAdapter;

    if (!features || features.some((feature) => feature.key === 'mention')) {
      return withPlaceholder(adapter);
    }

    return withPlaceholder(
      lexicalEditor({
        admin: FieldComponent?.serverProps?.admin,
        features: [...(features as CommentFeatures), MentionFeature()],
        lexical: editorConfig?.lexical,
        views: FieldComponent?.serverProps?.views,
      })(args),
    );
  };
}
