'use client';

import type { LexicalEditor } from 'lexical';
import { type FormEvent, useRef, useState } from 'react';

import { Button } from '../components/button.js';
import type { ComposerEditorContextValue } from './composer/context.js';
import { ComposerEditor } from './composer/editor.js';
import { defaultComposerFeatures } from './composer/features.js';
import { $readPrompt, type ComposerPrompt } from './composer/prompt.js';
import { useChatProvider } from './provider.js';

const EDITOR_FEATURES = new Set(['mentions', 'keybindings']);

export interface MessageEditorProps {
  initialValue: ComposerPrompt;
  onCancel?: () => void;
  onSubmit: (prompt: ComposerPrompt) => void | Promise<void>;
}

export function MessageEditor({ initialValue, onCancel, onSubmit }: MessageEditorProps) {
  const provider = useChatProvider();
  const editorRef = useRef<LexicalEditor>(null);
  const [text, setText] = useState(initialValue.text);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  const features = (provider?.composerFeatures ?? defaultComposerFeatures).filter(({ key }) =>
    EDITOR_FEATURES.has(key),
  );

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();

    const prompt = editorRef.current?.getEditorState().read($readPrompt);

    if (!prompt?.text.trim() || busy.current) return;

    busy.current = true;
    setSubmitting(true);

    try {
      await onSubmit(prompt);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  const context: ComposerEditorContextValue = {
    submit: () => void submit(),
    escape: () => {
      if (!onCancel) return false;

      onCancel();

      return true;
    },
    mentionSources: provider?.mentionSources,
  };

  return (
    <form onSubmit={submit} className="fb-message-editor">
      <ComposerEditor
        ariaLabel="Edit message"
        className="fb-message-editor__input"
        context={context}
        editorRef={editorRef}
        features={features}
        initialValue={initialValue}
        onChange={(prompt) => setText(prompt.text)}
      />
      <div className="fb-message-editor__actions">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            className="fb-message-editor__cancel fb-slide-up-1"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={!text.trim() || submitting}
          className="fb-message-editor__submit fb-slide-up-1"
        >
          {submitting ? 'Sending...' : 'Send'}
        </Button>
      </div>
    </form>
  );
}
