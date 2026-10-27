'use client';

import { $getRoot, type LexicalEditor } from 'lexical';
import {
  type DragEvent,
  type FormEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

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

/**
 * A send held back while a turn runs. A message's `keys` name the attachment cards the composer
 * keeps, hidden, until the entry is sent, edited back or removed.
 */
export type ComposerQueued =
  | {
      kind: 'message';
      prompt: ComposerPrompt;
      attachments: ComposerAttachment[];
      keys: number[];
    }
  | { kind: 'command'; command: ComposerCommand; input: string; text: string };

export interface ComposerHandle {
  /** Writes a queued entry back into an empty composer; `false`, doing nothing, if it has content. */
  edit: (entry: ComposerQueued) => boolean;
  /** Drops a queued entry's held attachment cards. */
  discard: (entry: ComposerQueued) => void;
}

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
  /** Called when a send, `onBeforeSubmit` or a command fails; `source` is `'message'` for a send. */
  onError?: (error: Error, source: 'command' | 'message') => void;
  onFilledChange?: (filled: boolean) => void;
  /** Takes sends and `queue` commands while `queueing`; without it they wait as before. */
  onQueue?: (entry: ComposerQueued) => void;
  onStop?: () => void;
  onSubmit: (prompt: ComposerPrompt, attachments: ComposerAttachment[]) => void | Promise<void>;
  pending?: boolean;
  placeholder?: string;
  /** Whether a send goes to `onQueue`; defaults to `pending`. */
  queueing?: boolean;
  ref?: Ref<ComposerHandle>;
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
  onFilledChange,
  onQueue,
  onStop,
  onSubmit,
  pending = false,
  placeholder,
  queueing = pending,
  ref,
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
  const state = useRef({ attachments, pending, queue: queueing ? onQueue : undefined });

  state.current = { attachments, pending, queue: queueing ? onQueue : undefined };

  const filledChange = useRef(onFilledChange);

  filledChange.current = onFilledChange;

  useEffect(() => {
    filledChange.current?.(sendable);
  }, [sendable]);

  useImperativeHandle(ref, () => ({
    edit: (entry) => {
      const editor = editorRef.current;
      const typed = editor?.getEditorState().read($readPrompt) ?? emptyPrompt;

      if (
        !editor ||
        typed.text.trim() ||
        typed.mentions.length > 0 ||
        state.current.attachments.items.length > 0
      ) {
        return false;
      }

      if (entry.kind === 'message') state.current.attachments.release(entry.keys);

      editor.update(() =>
        $writePrompt(entry.kind === 'message' ? entry.prompt : { text: entry.text, mentions: [] }),
      );

      return true;
    },
    discard: (entry) => {
      if (entry.kind === 'message') state.current.attachments.clear(entry.keys);
    },
  }));

  const clearText = () => editorRef.current?.update(() => $writePrompt(emptyPrompt));

  const fail = (source: 'command' | 'message') => (error: unknown) =>
    onError?.(toError(error), source);

  const runCommand = (command: ComposerCommand, input: string) => {
    const { queue } = state.current;

    if (command.queue && queue) {
      queue({
        kind: 'command',
        command,
        input,
        text: input ? `/${command.id} ${input}` : `/${command.id}`,
      });

      return;
    }

    void Promise.resolve()
      .then(() => command.execute(input))
      .catch(fail('command'));
  };

  const enqueue = (next: ComposerPrompt) => {
    const { attachments, queue } = state.current;

    if (!queue) return false;

    const filled = Boolean(next.text.trim()) || attachments.toSend.length > 0;

    if (!filled || attachments.uploading) return true;

    const keys = attachments.items.map(({ key }) => key);

    attachments.hold(keys);
    history.add(next);
    clearText();
    queue({ kind: 'message', prompt: next, attachments: attachments.toSend, keys });

    return true;
  };

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
          fail('message')(error);
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

    if (!editor || disabled) return;

    const next = editor.getEditorState().read($readPrompt);
    const command = matchCommand(next.text, provider?.commands);

    if (command) {
      clearText();
      runCommand(command.command, command.input);

      return;
    }

    if (enqueue(next) || submitting.current) return;

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
          fail('command')(error);
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
        if (!disabled) void attachments.add(Array.from(event.dataTransfer.files));
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
                    disabled={disabled}
                  />
                )}
                {startSlot}
              </div>
              <div className="fb-composer__end">
                {endSlot}
                {!disabled && <MicControl onWaveformChange={setAudioData} onText={appendText} />}
                {!disabled && queueing && onQueue && sendable && !attachments.uploading && (
                  <button
                    key="queue"
                    type="button"
                    onClick={() => submit()}
                    className="fb-composer__action fb-composer__queue"
                    aria-label="Queue message"
                  >
                    <ArrowUpIcon className="fb-composer__action-icon" />
                  </button>
                )}
                {!disabled &&
                  (pending ? (
                    <button
                      key="stop"
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        onStop?.();
                      }}
                      className="fb-composer__action fb-composer__stop"
                      aria-label={typeof stopContent === 'string' ? stopContent : 'Stop response'}
                    >
                      <SquareIcon className="fb-composer__action-icon fb-composer__stop-icon" />
                      <span className="fb-composer__sr-only">{stopContent}</span>
                    </button>
                  ) : (
                    sendable &&
                    !attachments.uploading &&
                    !(queueing && onQueue) && (
                      <button
                        key="submit"
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
