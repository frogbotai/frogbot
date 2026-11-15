'use client';

import type { DefaultTypedEditorState } from '@frogbotai/richtext-lexical';
import { RenderLexical } from '@frogbotai/richtext-lexical/client';
import { Button, toast, useConfig } from '@frogbotai/ui/admin';
import { type ComponentProps, useState } from 'react';

import { type CommentsTarget, hasContent } from '../shared.js';

type SetValue = NonNullable<ComponentProps<typeof RenderLexical>['setValue']>;

/** Props for `CommentBox`. */
export type CommentBoxProps = {
  /** Called after a comment is saved. */
  onPosted?: () => void;
  /** The comments collection's body field for this record's collection, `collection.comments.body_0`. */
  schemaPath: string;
  target: CommentsTarget;
};

/**
 * A rich text box that adds a comment to a record through the comments API. It keeps its own
 * value, so typing in it never marks the record's form as changed.
 */
export function CommentBox({ onPosted, schemaPath, target }: CommentBoxProps) {
  const { config } = useConfig();
  const [value, setValue] = useState<DefaultTypedEditorState | undefined>();
  const [version, setVersion] = useState(0);
  const [posting, setPosting] = useState(false);

  const update: SetValue = (next) => {
    if (next === undefined || (typeof next === 'object' && next !== null)) {
      setValue(next as DefaultTypedEditorState | undefined);
    }
  };

  const post = async () => {
    setPosting(true);

    const response = await fetch(`${config.routes.api}/${target.commentsSlug}`, {
      body: JSON.stringify({
        body: value,
        collection: target.collection,
        documentId: String(target.documentId),
      }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }).catch(() => null);

    setPosting(false);

    if (!response?.ok) {
      const result = (await response?.json().catch(() => null)) as {
        errors?: { message?: string }[];
      } | null;

      toast.error(result?.errors?.[0]?.message ?? 'The comment could not be saved.');

      return;
    }

    setValue(undefined);
    setVersion((current) => current + 1);
    onPosted?.();
  };

  return (
    <div className="fb-comments__box">
      <RenderLexical
        key={version}
        label={false}
        name="body"
        schemaPath={schemaPath}
        setValue={update}
        value={value}
      />
      <div className="fb-comments__actions">
        <Button
          buttonStyle="primary"
          disabled={posting || !hasContent(value)}
          onClick={() => void post()}
          size="medium"
        >
          Comment
        </Button>
      </div>
    </div>
  );
}
