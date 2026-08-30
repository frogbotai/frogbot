'use client';

import { type ChangeEvent, type FormEvent, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '../components/button';

export interface MessageEditorProps {
  initialValue: string;
  onCancel?: () => void;
  onSubmit: (value: string) => void | Promise<void>;
}

export function MessageEditor({ initialValue, onCancel, onSubmit }: MessageEditorProps) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  };

  useLayoutEffect(() => {
    adjustHeight();
  }, []);

  const change = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
    adjustHeight();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(value);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="fb-message-editor">
      <textarea
        ref={textareaRef}
        aria-label="Edit message"
        value={value}
        onChange={change}
        className="fb-message-editor__textarea"
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
          disabled={!value.trim() || submitting}
          className="fb-message-editor__submit fb-slide-up-1"
        >
          {submitting ? 'Sending...' : 'Send'}
        </Button>
      </div>
    </form>
  );
}
