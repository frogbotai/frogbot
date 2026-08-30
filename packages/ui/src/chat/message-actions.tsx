import type { ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/tooltip';
import CopyIcon from '../icons/icons/CopyIcon';
import PencilIcon from '../icons/icons/PencilIcon';
import RefreshIcon from '../icons/icons/RefreshIcon';

export interface MessageActionsProps {
  onCopy?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  text?: string;
}

function Action({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
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
        {label === 'Edit' ? 'Edit Message/Retry' : `${label} Message`}
      </TooltipContent>
    </Tooltip>
  );
}

export function MessageActions({ onCopy, onEdit, onRegenerate, text }: MessageActionsProps) {
  const copy = async () => {
    if (text) await navigator.clipboard.writeText(text);
    onCopy?.();
  };
  return (
    <TooltipProvider>
      <div className="fb-message-actions" aria-label="Message actions">
        {(text != null || onCopy) && (
          <Action label="Copy" onClick={copy}>
            <CopyIcon className="fb-message-actions__icon" />
          </Action>
        )}
        {onEdit && (
          <Action label="Edit" onClick={onEdit}>
            <PencilIcon className="fb-message-actions__icon" />
          </Action>
        )}

        {onRegenerate && (
          <Action label="Regenerate" onClick={onRegenerate}>
            <RefreshIcon className="fb-message-actions__icon" />
          </Action>
        )}
      </div>
    </TooltipProvider>
  );
}
