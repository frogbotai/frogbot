'use client';

import type { UIMessage } from 'ai';
import { type HTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';

import ArrowDownIcon from '../icons/icons/ArrowDownIcon.js';
import { Message } from './message.js';
import { MessagePart } from './message-part.js';
import { MessageScrubber } from './message-scrubber.js';

export interface MessageListProps extends HTMLAttributes<HTMLDivElement> {
  messages: UIMessage[];
  renderMessage?: (message: UIMessage) => ReactNode;
}

export function MessageList({ className, messages, renderMessage, ...props }: MessageListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const anchored = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const scrollToBottom = () =>
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });

  useEffect(() => {
    if (!anchored.current) return;
    const frame = requestAnimationFrame(scrollToBottom);

    return () => cancelAnimationFrame(frame);
  }, [messages]);

  const pin = (id: string | null) => {
    setPinned(id);

    if (!id) return;

    anchored.current = false;
    setShowJump(true);
  };

  return (
    <div className="fb-message-list">
      <div
        ref={ref}
        aria-live="polite"
        className={`fb-message-list__scroller${className ? ` ${className}` : ''}`}
        role="log"
        onScroll={(event) => {
          const node = event.currentTarget;

          anchored.current = !pinned && node.scrollHeight - node.scrollTop - node.clientHeight < 48;

          setShowJump(!anchored.current);
        }}
        {...props}
      >
        <div className="fb-message-list__content">
          {messages.map((message) => (
            <div key={message.id} className="fb-message-list__item" data-message-id={message.id}>
              {renderMessage ? (
                renderMessage(message)
              ) : (
                <Message role={message.role}>
                  {message.parts.map((part, index) => (
                    <MessagePart key={`${message.id}-${index}`} part={part} role={message.role} />
                  ))}
                </Message>
              )}
            </div>
          ))}
        </div>
      </div>
      {showJump && (
        <button
          type="button"
          onClick={() => {
            anchored.current = true;
            setPinned(null);
            setShowJump(false);
            scrollToBottom();
          }}
          className="fb-message-list__jump fb-slide-up-1"
          aria-label="Jump to latest"
        >
          <ArrowDownIcon className="fb-message-list__jump-icon" />
        </button>
      )}
      <MessageScrubber messages={messages} pinned={pinned} scrollerRef={ref} onPin={pin} />
    </div>
  );
}
