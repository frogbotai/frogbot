'use client';

import type { UIMessage } from 'ai';
import {
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import ArrowDownIcon from '../icons/icons/ArrowDownIcon.js';
import { Message } from './message.js';
import { MessagePart } from './message-part.js';
import { composerHeight, MessageScrubber } from './message-scrubber.js';
import { Thinking } from './thinking.js';
import { onUserScroll, prefersReducedMotion } from './user-scroll.js';

export interface MessageListProps extends HTMLAttributes<HTMLDivElement> {
  messages: UIMessage[];
  /** A reply is on its way: until its first part arrives, the list shows that it is thinking. */
  pending?: boolean;
  renderMessage?: (message: UIMessage) => ReactNode;
}

const shows = (part: UIMessage['parts'][number]) =>
  part.type !== 'step-start' && !(part.type === 'text' && !part.text);

function detached(scroller: HTMLElement) {
  const last = scroller.querySelector(
    ':scope > .fb-message-list__content > .fb-message-list__item:last-child',
  );

  if (!last) return false;

  const band =
    scroller.getBoundingClientRect().top + scroller.clientHeight - composerHeight(scroller);

  return last.getBoundingClientRect().bottom - band > 48;
}

function glide(scroller: HTMLElement, top: number) {
  const reduce = prefersReducedMotion();
  const target = reduce || Math.abs(scroller.scrollTop - top) < 1 ? null : top;

  scroller.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });

  return target;
}

export function MessageList({
  className,
  messages,
  pending = false,
  renderMessage,
  ...props
}: MessageListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const moving = useRef<number | null>(null);
  const seen = useRef<{ first?: string; last?: string }>(undefined);
  const [showJump, setShowJump] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const pinnedRef = useRef(pinned);
  const wasPending = useRef(pending);

  pinnedRef.current = pinned;

  useEffect(() => {
    if (wasPending.current && !pending) follow.current = false;

    wasPending.current = pending;
  }, [pending]);

  useLayoutEffect(() => {
    const scroller = ref.current;
    const content = contentRef.current;

    if (!scroller || !content) return;

    const measure = () => {
      if (moving.current !== null) return;

      const away = detached(scroller);

      if (away) follow.current = false;

      setShowJump(away || pinnedRef.current !== null);
    };

    const onScroll = () => {
      const target = moving.current;

      if (target !== null) {
        const end = Math.min(target, scroller.scrollHeight - scroller.clientHeight);

        if (Math.abs(scroller.scrollTop - end) >= 1) return;

        moving.current = null;
      }

      measure();
    };

    const onScrollEnd = () => {
      moving.current = null;
      measure();
    };

    const onResize = () => {
      if (follow.current) {
        moving.current = null;
        scroller.scrollTop = scroller.scrollHeight;
      }

      measure();
    };

    const observer = new ResizeObserver(onResize);

    observer.observe(scroller);
    observer.observe(content);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('scrollend', onScrollEnd, { passive: true });

    const stop = onUserScroll(scroller, () => {
      moving.current = null;
    });

    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('scrollend', onScrollEnd);
      stop();
    };
  }, []);

  useLayoutEffect(() => {
    const scroller = ref.current;
    const content = contentRef.current;
    const first = messages[0]?.id;
    const last = messages.at(-1);
    const before = seen.current;

    seen.current = { first, last: last?.id };

    if (!scroller || !content) return;

    const opened = before?.first !== first;
    const sent =
      last?.role === 'user' && last.id !== before?.last && (!opened || messages.length === 1);

    if (sent) {
      const row = [...content.children].find(
        (child) => child instanceof HTMLElement && child.dataset.messageId === last.id,
      );

      if (!row) return;

      const view = scroller.getBoundingClientRect().top;
      const rowTop = row.getBoundingClientRect().top;
      const offset = parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
      const above = rowTop - content.getBoundingClientRect().top - offset;

      content.style.minHeight = `${above + scroller.clientHeight}px`;
      follow.current = false;
      setPinned(null);
      setShowJump(false);
      moving.current = glide(scroller, scroller.scrollTop + rowTop - view - offset);

      return;
    }

    if (!opened) return;

    content.style.minHeight = '';
    follow.current = true;
    moving.current = null;
    scroller.scrollTop = scroller.scrollHeight;
  }, [messages]);

  const pin = (id: string | null) => {
    setPinned(id);

    if (!id) return;

    follow.current = false;
    setShowJump(true);
  };

  const last = messages.at(-1);

  const thinking =
    pending &&
    last !== undefined &&
    (last.role === 'user' || (last.role === 'assistant' && !last.parts.some(shows)));

  const thinkingRow = (
    <Message role="assistant">
      <Thinking />
    </Message>
  );

  return (
    <div className="fb-message-list">
      <div
        ref={ref}
        aria-live="polite"
        className={`fb-message-list__scroller${className ? ` ${className}` : ''}`}
        role="log"
        {...props}
      >
        <div ref={contentRef} className="fb-message-list__content">
          {messages.map((message) => (
            <div key={message.id} className="fb-message-list__item" data-message-id={message.id}>
              {thinking && message === last && message.role === 'assistant' ? (
                thinkingRow
              ) : renderMessage ? (
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
          {thinking && last.role === 'user' && (
            <div className="fb-message-list__item">{thinkingRow}</div>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-hidden={!showJump || undefined}
        aria-label="Jump to latest"
        className="fb-message-list__jump fb-slide-up-1"
        data-shown={showJump || undefined}
        tabIndex={showJump ? undefined : -1}
        onClick={() => {
          const scroller = ref.current;

          follow.current = pending;
          moving.current = null;
          setPinned(null);
          setShowJump(false);

          if (scroller) scroller.scrollTop = scroller.scrollHeight;
        }}
      >
        <ArrowDownIcon className="fb-message-list__jump-icon" />
      </button>
      <MessageScrubber messages={messages} pinned={pinned} scrollerRef={ref} onPin={pin} />
    </div>
  );
}
