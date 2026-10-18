'use client';

import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { EditorRefPlugin } from '@lexical/react/LexicalEditorRefPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import type { LexicalEditor } from 'lexical';
import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';

import { ComposerEditorContext, type ComposerEditorContextValue } from './context.js';
import { type ComposerFeature, resolveFeatures } from './features.js';
import { $readPrompt, $writePrompt, type ComposerPrompt } from './prompt.js';

export interface ComposerEditorProps {
  ariaLabel: string;
  autoFocus?: boolean;
  className: string;
  context: ComposerEditorContextValue;
  disabled?: boolean;
  editorRef: RefObject<LexicalEditor | null>;
  features: readonly ComposerFeature[];
  initialValue?: ComposerPrompt;
  onChange?: (prompt: ComposerPrompt) => void;
  placeholder?: string;
}

function EditorState({ disabled, onChange }: Pick<ComposerEditorProps, 'disabled' | 'onChange'>) {
  const [editor] = useLexicalComposerContext();
  const change = useRef(onChange);

  change.current = onChange;

  useEffect(() => editor.setEditable(!disabled), [disabled, editor]);

  useLayoutEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        change.current?.(editorState.read($readPrompt));
      }),
    [editor],
  );

  return null;
}

export function ComposerEditor({
  ariaLabel,
  autoFocus,
  className,
  context,
  disabled,
  editorRef,
  features,
  initialValue,
  onChange,
  placeholder,
}: ComposerEditorProps) {
  const resolved = resolveFeatures(features);
  const contextRef = useRef(context);

  contextRef.current = context;

  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'FrogBotComposer',
        nodes: resolved.flatMap(({ nodes = [] }) => nodes),
        editable: !disabled,
        editorState: initialValue ? () => $writePrompt(initialValue, false) : undefined,
        theme: { paragraph: 'fb-composer-editor__paragraph' },
        onError: (error) => {
          throw error;
        },
      }}
    >
      <ComposerEditorContext value={contextRef}>
        <div className="fb-composer-editor">
          <PlainTextPlugin
            ErrorBoundary={LexicalErrorBoundary}
            contentEditable={
              placeholder ? (
                <ContentEditable
                  ariaLabel={ariaLabel}
                  ariaMultiline
                  className={className}
                  aria-placeholder={placeholder}
                  placeholder={<div className="fb-composer-editor__placeholder">{placeholder}</div>}
                />
              ) : (
                <ContentEditable ariaLabel={ariaLabel} ariaMultiline className={className} />
              )
            }
          />
        </div>
        <HistoryPlugin />
        <EditorRefPlugin editorRef={editorRef} />
        <EditorState disabled={disabled} onChange={onChange} />
        {autoFocus && <AutoFocusPlugin defaultSelection="rootEnd" />}
        {resolved.map(({ key, plugin: Plugin }) => Plugin && <Plugin key={key} />)}
      </ComposerEditorContext>
    </LexicalComposer>
  );
}
