'use client';

import type { DefaultTypedEditorState } from '@frogbotai/richtext-lexical';
import { RenderLexical } from '@frogbotai/richtext-lexical/client';
import { Button } from '@frogbotai/ui/admin';
import { ArrowUpIcon } from '@frogbotai/ui/icons';
import { type ComponentProps, useRef, useState } from 'react';

import { hasContent } from '../shared.js';

type SetValue = NonNullable<ComponentProps<typeof RenderLexical>['setValue']>;

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 600 });
    } else {
      setTimeout(resolve, 600);
    }
  });
}

/** Props for `CommentEditor`. */
export type CommentEditorProps = {
  /** One compact box with an icon send button inside it, for writing a new comment. */
  compact?: boolean;
  /** The body to start from, when editing a comment. */
  initial?: unknown;
  onCancel?: () => void;
  /** Saves the body; resolves `true` when it was saved, which clears a new comment's box. */
  onSubmit: (body: DefaultTypedEditorState) => Promise<boolean>;
  /** The comments collection's body field, `collection.comments.body_0`. */
  schemaPath: string;
  /** The send button's label, or its accessible name when `compact`. */
  submitLabel: string;
};

/**
 * A rich text editor for a comment's body, with its own value, so typing in it never marks the
 * record's form as changed. Saving first waits for the browser to be idle, since the
 * field reports changes only then.
 */
export function CommentEditor({
  compact = false,
  initial,
  onCancel,
  onSubmit,
  schemaPath,
  submitLabel,
}: CommentEditorProps) {
  const [value, setValue] = useState(initial as DefaultTypedEditorState | undefined);
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const latest = useRef(value);

  const update: SetValue = (next) => {
    if (next === undefined || (typeof next === 'object' && next !== null)) {
      latest.current = next as DefaultTypedEditorState | undefined;
      setValue(latest.current);
    }
  };

  const submit = async () => {
    setSaving(true);
    await idle();

    const body = latest.current;

    if (!body || !hasContent(body)) {
      setSaving(false);

      return;
    }

    const saved = await onSubmit(body);

    setSaving(false);

    if (saved && initial === undefined) {
      latest.current = undefined;
      setValue(undefined);
      setVersion((current) => current + 1);
    }
  };

  const editor = (
    <RenderLexical
      key={version}
      label={false}
      name="body"
      schemaPath={schemaPath}
      setValue={update}
      value={value}
    />
  );

  if (compact) {
    return (
      <div className="fb-comments__editor fb-comments__editor--compact">
        {editor}
        <button
          aria-label={submitLabel}
          className="fb-comments__send"
          disabled={saving || !hasContent(value)}
          onClick={() => void submit()}
          title={submitLabel}
          type="button"
        >
          <ArrowUpIcon aria-hidden size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="fb-comments__editor">
      {editor}
      <div className="fb-comments__actions">
        {onCancel ? (
          <Button buttonStyle="secondary" onClick={onCancel} size="medium">
            Cancel
          </Button>
        ) : null}
        <Button
          buttonStyle="primary"
          disabled={saving || !hasContent(value)}
          onClick={() => void submit()}
          size="medium"
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
