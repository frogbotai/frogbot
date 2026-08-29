'use client';

import type { UIMessage } from 'ai';
import { type HTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';

import { Message } from './message';
import { MessagePart } from './message-part';

export interface MessageListProps extends HTMLAttributes<HTMLDivElement> {
  messages: UIMessage[];
  renderMessage?: (message: UIMessage) => ReactNode;
}

export function MessageList({ className, messages, renderMessage, ...props }: MessageListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const anchored = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const scrollToBottom = () =>
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });

  useEffect(() => {
    if (!anchored.current) return;
    const frame = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  return (
    <div className="fb-message-list">
      <div
        ref={ref}
        aria-live="polite"
        className={`fb-message-list__scroller${className ? ` ${className}` : ''}`}
        role="log"
        onScroll={(event) => {
          const node = event.currentTarget;
          anchored.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
          setShowJump(!anchored.current);
        }}
        {...props}
      >
        {messages.map((message) =>
          renderMessage ? (
            renderMessage(message)
          ) : (
            <Message key={message.id} role={message.role}>
              {message.parts.map((part, index) => (
                <MessagePart key={`${message.id}-${index}`} part={part} role={message.role} />
              ))}
            </Message>
          ),
        )}
      </div>
      {showJump && (
        <button
          type="button"
          onClick={() => {
            anchored.current = true;
            setShowJump(false);
            scrollToBottom();
          }}
          className="fb-message-list__jump"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}
