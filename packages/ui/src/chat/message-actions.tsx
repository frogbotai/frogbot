import type { ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/tooltip';
import BranchIcon from '../icons/icons/BranchIcon';
import CopyIcon from '../icons/icons/CopyIcon';
import PencilIcon from '../icons/icons/PencilIcon';
import RefreshIcon from '../icons/icons/RefreshIcon';
import { copyMarkdown } from './copy-markdown';
import { formatMessageTimestamp } from './format-timestamp';

export interface MessageActionsProps {
  onBranch?: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
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
  tooltip,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tooltip?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="fb-message-actions__button fb-slide-up-1"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent align="center" side="bottom">
        {tooltip ?? `${label} Message`}
      </TooltipContent>
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
  text,
  timestamp,
  timestampPlacement = 'start',
}: MessageActionsProps) {
  const time = timestamp === undefined ? null : <MessageTimestamp value={timestamp} />;
  return (
    <TooltipProvider>
      <div className="fb-message-actions" aria-label="Message actions">
        {timestampPlacement === 'start' && time}
        {(text != null || onCopy) && <CopyMessageAction text={text} onCopy={onCopy} />}
        {onEdit && <EditMessageAction onEdit={onEdit} />}
        {onBranch && <BranchMessageAction onBranch={onBranch} />}

        {onRegenerate && (
          <Action label="Regenerate" onClick={onRegenerate}>
            <RefreshIcon className="fb-message-actions__icon" />
          </Action>
        )}
        {timestampPlacement === 'end' && time}
      </div>
    </TooltipProvider>
  );
}
