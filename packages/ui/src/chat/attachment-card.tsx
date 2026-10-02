'use client';

import { type ReactNode, useId } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/tooltip.js';
import CloseIcon from '../icons/icons/CloseIcon.js';
import FileIcon from '../icons/icons/FileIcon.js';
import InfoCircleIcon from '../icons/icons/InfoCircleIcon.js';
import LoadingIcon from '../icons/icons/LoadingIcon.js';
import RefreshIcon from '../icons/icons/RefreshIcon.js';
import { AttachmentViewer } from './attachment-viewer.js';

export type AttachmentCardState =
  'uploading' | 'ready' | 'text' | 'refused' | 'failed' | 'too-large';

export type AttachmentCardProps = {
  name: string;
  state: AttachmentCardState;
  typeLabel?: string;
  preview?: ReactNode;
  text?: string;
  size?: number;
  reason?: string;
  onRemove?: () => void;
  onRetry?: () => void;
};

const LARGE_FILE_BYTES = 10_000_000;

const PREVIEW_CHARACTERS = 500;

const STATE_WORDS: Record<AttachmentCardState, string> = {
  uploading: 'uploading',
  ready: 'ready',
  text: 'ready',
  refused: "won't be sent",
  failed: 'upload failed',
  'too-large': 'too large to upload',
};

const PROBLEMS: Partial<Record<AttachmentCardState, { heading: string; reason: string }>> = {
  refused: { heading: "Won't be sent.", reason: "This file type isn't supported." },
  failed: { heading: 'Upload failed.', reason: 'Check your connection and try again.' },
  'too-large': {
    heading: 'Too large to upload.',
    reason: 'This file is larger than this app allows.',
  },
};

function formatFileSize(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function largeFileHint(bytes: number): string {
  return `Large file (${formatFileSize(bytes)}). In long chats, older files may be left out to keep requests small.`;
}

function Spinner({ name }: { name: string }) {
  return (
    <LoadingIcon
      role="img"
      aria-label={`Uploading ${name}`}
      className="fb-attachment-card__spinner"
    />
  );
}

function UploadOverlay({ name }: { name: string }) {
  return (
    <span className="fb-attachment-card__overlay">
      <Spinner name={name} />
    </span>
  );
}

function TextPreview({
  name,
  state,
  text,
}: {
  name: string;
  state: AttachmentCardState;
  text?: string;
}) {
  const snippet = (
    <span className="fb-attachment-card__snippet">{text?.slice(0, PREVIEW_CHARACTERS)}</span>
  );

  if (state !== 'text' || text === undefined) {
    return (
      <div className="fb-attachment-card__body">
        {snippet}
        {state === 'uploading' && <UploadOverlay name={name} />}
      </div>
    );
  }

  return (
    <AttachmentViewer name={name} text={text}>
      <button
        type="button"
        aria-label={`Open ${name}`}
        className="fb-attachment-card__body fb-attachment-card__open"
      >
        {snippet}
      </button>
    </AttachmentViewer>
  );
}

function MediaPreview({
  name,
  preview,
  state,
}: {
  name: string;
  preview?: ReactNode;
  state: AttachmentCardState;
}) {
  const uploading = state === 'uploading';

  if (preview) {
    return (
      <div className="fb-attachment-card__preview">
        {preview}
        {uploading && <UploadOverlay name={name} />}
      </div>
    );
  }

  return (
    <div className="fb-attachment-card__body fb-attachment-card__file">
      {uploading ? <Spinner name={name} /> : <FileIcon className="fb-attachment-card__file-icon" />}
      <span className="fb-attachment-card__name">{name}</span>
    </div>
  );
}

function LargeFileTag({ hint }: { hint: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="fb-attachment-card__hint">Large file</span>
        </TooltipTrigger>
        <TooltipContent side="top">{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function isLargeFile(size?: number): size is number {
  return size !== undefined && size > LARGE_FILE_BYTES;
}

export function LargeFileHint({ size }: { size: number }) {
  const hint = largeFileHint(size);

  return (
    <>
      <LargeFileTag hint={hint} />
      <span className="fb-attachment-card__sr-only">{hint}</span>
    </>
  );
}

export function AttachmentCard({
  name,
  state,
  typeLabel,
  preview,
  text,
  size,
  reason,
  onRemove,
  onRetry,
}: AttachmentCardProps) {
  const id = useId();
  const headingId = `${id}-heading`;
  const reasonId = `${id}-reason`;
  const hintId = `${id}-hint`;

  const problem = PROBLEMS[state];
  const large = !problem && isLargeFile(size);
  const hint = large ? largeFileHint(size) : undefined;

  const label = [name, typeLabel, STATE_WORDS[state]].filter(Boolean).join(', ');
  const describedBy = problem ? `${headingId} ${reasonId}` : hint ? hintId : undefined;

  const classes = [
    'fb-attachment-card',
    `fb-attachment-card--${state}`,
    hint ? 'fb-attachment-card--large' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      aria-busy={state === 'uploading' || undefined}
      data-testid="attachment-card"
      data-state={state}
      className={classes}
    >
      {problem ? (
        <div className="fb-attachment-card__body fb-attachment-card__problem">
          <span className="fb-attachment-card__name">{name}</span>
          <span className="fb-attachment-card__status">
            <InfoCircleIcon className="fb-attachment-card__icon" />
            <span id={headingId}>{problem.heading}</span>
          </span>
          <span id={reasonId} className="fb-attachment-card__reason">
            {reason ?? problem.reason}
          </span>
          {state === 'failed' && onRetry && (
            <button
              type="button"
              aria-label={`Retry uploading ${name}`}
              onClick={onRetry}
              className="fb-attachment-card__retry"
            >
              <RefreshIcon className="fb-attachment-card__retry-icon" />
              Retry
            </button>
          )}
        </div>
      ) : state === 'text' || text !== undefined ? (
        <TextPreview name={name} state={state} text={text} />
      ) : (
        <MediaPreview name={name} preview={preview} state={state} />
      )}
      {(typeLabel || hint) && (
        <div className="fb-attachment-card__tags">
          {typeLabel && <span className="fb-attachment-card__tag">{typeLabel}</span>}
          {hint && <LargeFileTag hint={hint} />}
        </div>
      )}
      {hint && (
        <span id={hintId} className="fb-attachment-card__sr-only">
          {hint}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="fb-attachment-card__remove"
        >
          <CloseIcon className="fb-attachment-card__remove-icon" />
        </button>
      )}
    </div>
  );
}
