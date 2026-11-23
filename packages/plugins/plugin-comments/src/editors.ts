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

const commentAdmin = {
  hideAddBlockButton: true,
  hideDraggableBlockElement: true,
  hideGutter: true,
  hideInsertParagraphAtEnd: true,
  placeholder: 'Add a comment or @mention someone',
};

function withCommentAdmin<T>(adapter: T): T {
  const { FieldComponent } = adapter as LexicalAdapter;
  const serverProps = FieldComponent?.serverProps;

  if (!FieldComponent || typeof FieldComponent !== 'object') return adapter;

  return {
    ...adapter,
    FieldComponent: {
      ...FieldComponent,
      serverProps: { ...serverProps, admin: { ...commentAdmin, ...serverProps?.admin } },
    },
  };
}

/**
 * `editor` for comments: `MentionFeature()` is added when it's missing, since mentions drive
 * notifications. The box says "Add a comment or @mention someone" and has no block gutter, add
 * block button, drag handle or insert-paragraph bar, unless the editor's `admin` sets its own.
 */
export function withMentions(editor: CommentsEditor): CommentsEditor {
  return (args) => {
    const adapter = editor(args);
    const { editorConfig, features, FieldComponent } = adapter as LexicalAdapter;

    if (!features || features.some((feature) => feature.key === 'mention')) {
      return withCommentAdmin(adapter);
    }

    return withCommentAdmin(
      lexicalEditor({
        admin: FieldComponent?.serverProps?.admin,
        features: [...(features as CommentFeatures), MentionFeature()],
        lexical: editorConfig?.lexical,
        views: FieldComponent?.serverProps?.views,
      })(args),
    );
  };
}
