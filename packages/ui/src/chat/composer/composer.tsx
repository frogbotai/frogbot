'use client';

import { $getRoot, type LexicalEditor } from 'lexical';
import { type DragEvent, type FormEvent, type ReactNode, useRef, useState } from 'react';

import ArrowUpIcon from '../../icons/icons/ArrowUpIcon.js';
import SquareIcon from '../../icons/icons/SquareIcon.js';
import type { ChatPlatformAdapter } from '../adapter.js';
import { acceptFor } from '../attachment-kind.js';
import {
  AttachmentControl,
  AttachmentList,
  type ComposerAttachment,
  type ComposerModelInput,
  useAttachments,
} from '../attachments.js';
import { AudioWaveform } from '../audio-waveform.js';
import { MicControl } from '../mic-control.js';
import { useChatProvider } from '../provider.js';
import type { ComposerCommand, ComposerEditorContextValue } from './context.js';
import { ComposerEditor } from './editor.js';
import { defaultComposerFeatures } from './features.js';
import { createComposerHistory, localStorageHistory } from './history.js';
import { $readPrompt, $writePrompt, type ComposerPrompt, emptyPrompt } from './prompt.js';
import { matchCommand } from './slash-menu.js';

/** A prompt about to be sent, with the attachments that go with it. */
export type ComposerSubmission = ComposerPrompt & { attachments: readonly ComposerAttachment[] };

export interface ComposerProps {
  adapter?: ChatPlatformAdapter;
  'aria-label'?: string;
  autoFocus?: boolean;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  endSlot?: ReactNode;
  hidden?: boolean;
  modelInputs?: readonly ComposerModelInput[];
  modelName?: string;
  onBeforeSubmit?: (prompt: ComposerSubmission) => boolean | Promise<boolean>;
  onError?: (error: Error) => void;
  onStop?: () => void;
  onSubmit: (prompt: ComposerPrompt, attachments: ComposerAttachment[]) => void | Promise<void>;
  pending?: boolean;
  placeholder?: string;
  startSlot?: ReactNode;
  stopContent: ReactNode;
  submitContent: ReactNode;
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export function Composer({
  adapter,
  'aria-label': ariaLabel = 'Message',
  autoFocus,
  className,
  defaultValue = '',
  disabled,
  endSlot,
  hidden,
  modelInputs,
  modelName,
  onBeforeSubmit,
  onError,
  onStop,
  onSubmit,
  pending = false,
  placeholder,
  startSlot,
  stopContent,
  submitContent,
}: ComposerProps) {
  const provider = useChatProvider();
  const editorRef = useRef<LexicalEditor>(null);
  const [initialValue] = useState<ComposerPrompt>(() => ({ text: defaultValue, mentions: [] }));
  const [prompt, setPrompt] = useState(initialValue);
  const [history] = useState(() =>
    createComposerHistory(provider?.composerHistory ?? localStorageHistory),
  );

  const [dragging, setDragging] = useState(false);
  const [audioData, setAudioData] = useState<Float32Array | null>();
  const submitting = useRef(false);
  const attachments = useAttachments({ adapter, modelInputs, modelName });
  const sendable = Boolean(prompt.text.trim()) || attachments.toSend.length > 0;
  const state = useRef({ attachments, pending });

  state.current = { attachments, pending };

  const clearText = () => editorRef.current?.update(() => $writePrompt(emptyPrompt));

  const fail = (error: unknown) => onError?.(toError(error));

  const runCommand = (command: ComposerCommand, input: string) =>
    void Promise.resolve()
      .then(() => command.execute(input))
      .catch(fail);

  const send = (next: ComposerPrompt) => {
    const current = state.current;
    const sent = current.attachments.items.map(({ key }) => key);
    const filled = Boolean(next.text.trim()) || current.attachments.toSend.length > 0;

    if (!filled || current.pending || current.attachments.uploading) return;

    submitting.current = true;
    history.add(next);
    clearText();
    current.attachments.hold(sent);

    void new Promise<void>((resolve) => resolve(onSubmit(next, current.attachments.toSend)))
      .then(
        () => state.current.attachments.clear(sent),
        (error: unknown) => {
          fail(error);
          restore(next, sent);
        },
      )
      .finally(() => {
        submitting.current = false;
      });
  };

  const restore = (next: ComposerPrompt, sent: number[]) => {
    const { attachments } = state.current;
    const typed = editorRef.current?.getEditorState().read($readPrompt) ?? emptyPrompt;
    const touched =
      Boolean(typed.text.trim()) ||
      typed.mentions.length > 0 ||
      attachments.items.some(({ key }) => !sent.includes(key));

    if (touched) {
      attachments.clear(sent);

      return;
    }

    attachments.release(sent);
    editorRef.current?.update(() => $writePrompt(next));
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();

    const editor = editorRef.current;

    if (!editor || disabled || submitting.current) return;

    const next = editor.getEditorState().read($readPrompt);
    const command = matchCommand(next.text, provider?.commands);

    if (command) {
      clearText();
      runCommand(command.command, command.input);

      return;
    }

    if (!onBeforeSubmit) {
      send(next);

      return;
    }

    submitting.current = true;

    void Promise.resolve()
      .then(() => onBeforeSubmit({ ...next, attachments: state.current.attachments.toSend }))
      .then(
        (handled) => {
          submitting.current = false;

          if (handled) clearText();
          else send(next);
        },
        (error: unknown) => {
          submitting.current = false;
          fail(error);
        },
      );
  };

  const context: ComposerEditorContextValue = {
    submit,
    commands: provider?.commands,
    runCommand,
    mentionSources: provider?.mentionSources,
    escape: () => {
      if (!state.current.pending || !onStop) return false;

      onStop();

      return true;
    },
    history,
    attachments: {
      add: (files) => void attachments.add(files),
      addPaste: attachments.addPaste,
      storage: attachments.storage,
    },
  };

  const handleDrag = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disabled) setDragging(event.type === 'dragenter' || event.type === 'dragover');
  };

  const appendText = (text: string) =>
    editorRef.current?.update(() => {
      $getRoot().selectEnd().insertRawText(text);
    });

  return (
    <form
      className={['fb-composer', disabled && 'fb-composer--disabled', className]
        .filter(Boolean)
        .join(' ')}
      hidden={hidden}
      onSubmit={submit}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled && !pending) void attachments.add(Array.from(event.dataTransfer.files));
      }}
    >
      <AttachmentList
        items={attachments.items}
        remove={attachments.remove}
        retry={attachments.retry}
        status={attachments.status}
      />
      <div
        className={[
          'fb-composer__gradient fb-glow',
          dragging && 'fb-composer__gradient--dragging fb-glow--active',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="fb-composer__gradient-container fb-glow__ring">
          <div className="fb-composer__panel">
            {audioData !== undefined && <AudioWaveform audioData={audioData} />}
            <ComposerEditor
              ariaLabel={ariaLabel}
              autoFocus={autoFocus}
              className="fb-composer__input"
              context={context}
              disabled={disabled}
              editorRef={editorRef}
              features={provider?.composerFeatures ?? defaultComposerFeatures}
              initialValue={initialValue.text ? initialValue : undefined}
              onChange={setPrompt}
              placeholder={placeholder}
            />
            <div className="fb-composer__controls">
              <div className="fb-composer__start">
                {attachments.storage && (
                  <AttachmentControl
                    accept={acceptFor(modelInputs)}
                    add={(files) => void attachments.add(files)}
                    disabled={disabled || pending}
                  />
                )}
                {startSlot}
              </div>
              <div className="fb-composer__end">
                {endSlot}
                {!disabled && !pending && (
                  <MicControl onWaveformChange={setAudioData} onText={appendText} />
                )}
                {!disabled &&
                  (pending ? (
                    <button
                      type="button"
                      onClick={onStop}
                      className="fb-composer__action fb-composer__stop"
                      aria-label={typeof stopContent === 'string' ? stopContent : 'Stop response'}
                    >
                      <SquareIcon className="fb-composer__action-icon fb-composer__stop-icon" />
                      <span className="fb-composer__sr-only">{stopContent}</span>
                    </button>
                  ) : (
                    sendable &&
                    !attachments.uploading && (
                      <button
                        type="submit"
                        className="fb-composer__action fb-composer__submit"
                        aria-label={typeof submitContent === 'string' ? submitContent : 'Submit'}
                      >
                        <ArrowUpIcon className="fb-composer__action-icon" />
                        <span className="fb-composer__sr-only">{submitContent}</span>
                      </button>
                    )
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
