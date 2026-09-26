'use client';

import { Button } from '../components/button.js';
import BranchIcon from '../icons/icons/BranchIcon.js';

export type ChannelConversationNoticeProps = {
  channelLabel: string;
  branching?: boolean;
  className?: string;
  onBranch?: () => void;
};

export function ChannelConversationNotice({
  branching = false,
  channelLabel,
  className,
  onBranch,
}: ChannelConversationNoticeProps) {
  return (
    <div className={className ? `fb-channel-notice ${className}` : 'fb-channel-notice'}>
      <div className="fb-channel-notice__text">
        <p className="fb-channel-notice__title">This conversation happens in {channelLabel}.</p>
        <p className="fb-channel-notice__description">
          Continue it there, or branch it into a new chat.
        </p>
      </div>
      {onBranch && (
        <Button type="button" variant="secondary" size="sm" disabled={branching} onClick={onBranch}>
          <BranchIcon className="fb-channel-notice__icon" />
          Branch
        </Button>
      )}
    </div>
  );
}
