import type { ReactNode } from 'react';

import { Tooltip } from '../components/tooltip.js';
import BranchIcon from '../icons/icons/BranchIcon.js';
import CopyIcon from '../icons/icons/CopyIcon.js';
import PencilIcon from '../icons/icons/PencilIcon.js';
import RefreshIcon from '../icons/icons/RefreshIcon.js';
import StopIcon from '../icons/icons/StopIcon.js';
import VolumeIcon from '../icons/icons/VolumeIcon.js';
import { copyMarkdown } from './copy-markdown.js';
import { formatMessageTimestamp } from './format-timestamp.js';

export interface MessageActionsProps {
  onBranch?: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  readAloud?: ReadAloudMessageActionProps;
  text?: string;
  timestamp?: Date | number | string;
  timestampPlacement?: 'end' | 'start';
}

export interface MessageTimestampProps {
  value: Date | number | string;
}

export interface CopyMessageActionProps {
  onCopy?: () => void;
  text?: string;
}

export interface ReadAloudMessageActionProps {
  active: boolean;
  error?: string;
  onToggle: () => void;
}

export interface EditMessageActionProps {
  onEdit: () => void;
}

export interface BranchMessageActionProps {
  onBranch: () => void;
}

function Action({
  children,
  label,
  onClick,
  pressed,
  tooltip,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  tooltip?: string;
}) {
  return (
    <Tooltip label={tooltip ?? `${label} Message`} side="bottom">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className="fb-message-actions__button fb-slide-up-1"
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function CopyMessageAction({ onCopy, text }: CopyMessageActionProps) {
  const copy = async () => {
    if (text) await copyMarkdown(text);
    onCopy?.();
  };

  return (
    <Action label="Copy" onClick={copy}>
      <CopyIcon className="fb-message-actions__icon" />
    </Action>
  );
}

export function ReadAloudMessageAction({ active, error, onToggle }: ReadAloudMessageActionProps) {
  const label = active ? 'Stop reading' : 'Read aloud';

  return (
    <>
      <Action label={label} onClick={onToggle} pressed={active} tooltip={label}>
        {active ? (
          <StopIcon className="fb-message-actions__icon" />
        ) : (
          <VolumeIcon className="fb-message-actions__icon" />
        )}
      </Action>
      {error && (
        <span role="alert" className="fb-message-actions__error">
          {error}
        </span>
      )}
    </>
  );
}

export function EditMessageAction({ onEdit }: EditMessageActionProps) {
  return (
    <Action label="Edit" onClick={onEdit} tooltip="Edit Message/Retry">
      <PencilIcon className="fb-message-actions__icon" />
    </Action>
  );
}

export function BranchMessageAction({ onBranch }: BranchMessageActionProps) {
  return (
    <Action label="Branch" onClick={onBranch} tooltip="Branch in new chat">
      <BranchIcon className="fb-message-actions__icon" />
    </Action>
  );
}

export function MessageTimestamp({ value }: MessageTimestampProps) {
  const label = formatMessageTimestamp(value);
  if (!label) return null;

  return (
    <time className="fb-message-actions__timestamp" dateTime={new Date(value).toISOString()}>
      {label}
    </time>
  );
}

export function MessageActions({
  onBranch,
  onCopy,
  onEdit,
  onRegenerate,
  readAloud,
  text,
  timestamp,
  timestampPlacement = 'start',
}: MessageActionsProps) {
  const time = timestamp === undefined ? null : <MessageTimestamp value={timestamp} />;

  return (
    <div className="fb-message-actions" aria-label="Message actions">
      {timestampPlacement === 'start' && time}
      {(text != null || onCopy) && <CopyMessageAction text={text} onCopy={onCopy} />}
      {readAloud && <ReadAloudMessageAction {...readAloud} />}
      {onEdit && <EditMessageAction onEdit={onEdit} />}
      {onBranch && <BranchMessageAction onBranch={onBranch} />}

      {onRegenerate && (
        <Action label="Regenerate" onClick={onRegenerate}>
          <RefreshIcon className="fb-message-actions__icon" />
        </Action>
      )}
      {timestampPlacement === 'end' && time}
    </div>
  );
}
