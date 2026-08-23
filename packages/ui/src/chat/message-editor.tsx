'use client';

import { type FormEvent, useState } from 'react';

export interface MessageEditorProps {
  initialValue: string;
  onCancel?: () => void;
  onSubmit: (value: string) => void | Promise<void>;
}

export function MessageEditor({ initialValue, onCancel, onSubmit }: MessageEditorProps) {
  const [value, setValue] = useState(initialValue);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) void onSubmit(value);
  };
  return (
    <form onSubmit={submit} className="fb-message-editor">
      <textarea
        aria-label="Edit message"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="fb-message-editor__textarea"
      />
      <div className="fb-message-editor__actions">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="fb-message-editor__cancel"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!value.trim()}
          className="fb-message-editor__submit"
        >
          Send
        </button>
      </div>
    </form>
  );
}
