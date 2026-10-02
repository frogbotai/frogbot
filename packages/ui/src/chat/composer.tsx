'use client';

import type { FrogBotSDK } from '@frogbotai/sdk';
import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import ArrowUpIcon from '../icons/icons/ArrowUpIcon.js';
import SquareIcon from '../icons/icons/SquareIcon.js';
import { acceptFor } from './attachment-kind.js';
import {
  AttachmentControl,
  AttachmentList,
  type ComposerAttachment,
  type ComposerModelInput,
  useAttachments,
} from './attachments.js';
import { AudioWaveform } from './audio-waveform.js';
import { MicControl } from './mic-control.js';

export type ComposerProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onSubmit' | 'value' | 'defaultValue'
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onSubmit: (value: string, attachments: ComposerAttachment[]) => void | Promise<void>;
  onStop?: () => void;
  pending?: boolean;
  startSlot?: ReactNode;
  endSlot?: ReactNode;
  submitContent: ReactNode;
  stopContent: ReactNode;
  sdk?: FrogBotSDK;
  assetsSlug?: string;
  modelInputs?: readonly ComposerModelInput[];
  modelName?: string;
};

export function Composer({
  className,
  defaultValue = '',
  disabled,
  endSlot,
  assetsSlug,
  modelInputs,
  modelName,
  onKeyDown,
  onPaste,
  onStop,
  onSubmit,
  onValueChange,
  pending = false,
  sdk,
  startSlot,
  stopContent,
  submitContent,
  value,
  ...props
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [dragging, setDragging] = useState(false);
  const [audioData, setAudioData] = useState<Float32Array | null>();
  const submitting = useRef(false);
  const currentValue = value ?? internalValue;
  const attachments = useAttachments({ assetsSlug, modelInputs, modelName, sdk });
  const sendable = Boolean(currentValue.trim()) || attachments.toSend.length > 0;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [currentValue]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const next = value ?? internalValue;

    if (!sendable || pending || disabled || attachments.uploading || submitting.current) return;

    const sent = attachments.items.map(({ key }) => key);

    submitting.current = true;

    void Promise.resolve(onSubmit(next, attachments.toSend))
      .then(() => attachments.clear(sent))
      .finally(() => {
        submitting.current = false;
      });

    if (value === undefined) setInternalValue('');
    onValueChange?.('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    submit();
  };

  const handleDrag = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disabled) setDragging(event.type === 'dragenter' || event.type === 'dragover');
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    onPaste?.(event);
    if (event.defaultPrevented) return;
    const text = event.clipboardData.getData('text');
    if (text.length <= 650) return;
    event.preventDefault();
    attachments.addPaste(text);
  };

  return (
    <form
      className={['fb-composer', disabled && 'fb-composer--disabled', className]
        .filter(Boolean)
        .join(' ')}
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
        className={['fb-composer__gradient', dragging && 'fb-composer__gradient--dragging']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="fb-composer__gradient-container">
          <div className="fb-composer__panel">
            {audioData !== undefined && <AudioWaveform audioData={audioData} />}
            <textarea
              {...props}
              ref={textareaRef}
              disabled={disabled}
              rows={1}
              value={currentValue}
              onChange={(event) => {
                if (value === undefined) setInternalValue(event.target.value);
                onValueChange?.(event.target.value);
              }}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              className="fb-composer__textarea"
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
                  <MicControl
                    onWaveformChange={setAudioData}
                    onText={(text) => {
                      const next = `${currentValue}${text}`;
                      if (value === undefined) setInternalValue(next);
                      onValueChange?.(next);
                    }}
                  />
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
