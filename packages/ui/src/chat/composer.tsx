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
import {
  AttachmentControl,
  AttachmentPreviews,
  type ComposerAttachment,
  PastePreviews,
  useAttachments,
} from './attachments.js';
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
  filesSlug?: string;
};

export function Composer({
  className,
  defaultValue = '',
  disabled,
  endSlot,
  filesSlug,
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
  const [pastes, setPastes] = useState<Extract<ComposerAttachment, { type: 'paste' }>[]>([]);
  const currentValue = value ?? internalValue;
  const attachments = useAttachments({ filesSlug, sdk });

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [currentValue]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const next = value ?? internalValue;
    if (
      (!next.trim() && !attachments.references.length && !pastes.length) ||
      pending ||
      disabled ||
      attachments.uploading
    ) {
      return;
    }
    void Promise.resolve(onSubmit(next, [...attachments.references, ...pastes])).then(() => {
      attachments.clear();
      setPastes([]);
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
    setPastes((current) => [
      ...current,
      { type: 'paste', text, filename: `pasted-${Date.now()}.txt` },
    ]);
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
        if (!disabled && !pending) attachments.add(Array.from(event.dataTransfer.files));
      }}
    >
      <AttachmentPreviews
        items={attachments.items}
        remove={attachments.remove}
        retry={attachments.retry}
      />
      <PastePreviews
        items={pastes}
        remove={(index) =>
          setPastes((current) => current.filter((_, currentIndex) => currentIndex !== index))
        }
      />
      <div
        className={['fb-composer__gradient', dragging && 'fb-composer__gradient--dragging']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="fb-composer__gradient-container">
          <div className="fb-composer__panel">
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
                {sdk && filesSlug && (
                  <AttachmentControl add={attachments.add} disabled={disabled || pending} />
                )}
                {startSlot}
              </div>
              <div className="fb-composer__end">
                {endSlot}
                {!disabled && !pending && (
                  <MicControl
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
                    (currentValue.trim() ||
                      attachments.references.length > 0 ||
                      pastes.length > 0) &&
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
