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
import { LiveContext } from './use-paced-text.js';
import { onUserScroll, prefersReducedMotion } from './user-scroll.js';
import { WorkingIndicator } from './working.js';

export interface MessageListProps extends HTMLAttributes<HTMLDivElement> {
  /** The logo that pulses below the thread while the agent works; defaults to the FrogBot favicon. */
  icon?: ReactNode;
  messages: UIMessage[];
  /** The agent is working on a reply: the logo below the thread pulses. */
  pending?: boolean;
  renderMessage?: (message: UIMessage) => ReactNode;
}

function detached(scroller: HTMLElement) {
  const last = [
    ...scroller.querySelectorAll(':scope > .fb-message-list__content > .fb-message-list__item'),
  ].at(-1);

  if (!last) return false;

  const band =
    scroller.getBoundingClientRect().top + scroller.clientHeight - composerHeight(scroller);

  return last.getBoundingClientRect().bottom - band > 48;
}

function blurJump(button: HTMLElement | null, scroller: HTMLElement | null) {
  if (button && scroller && button.contains(document.activeElement)) {
    scroller.focus({ preventScroll: true });
  }
}

function glide(scroller: HTMLElement, top: number) {
  const reduce = prefersReducedMotion();
  const target = reduce || Math.abs(scroller.scrollTop - top) < 1 ? null : top;

  scroller.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });

  return target;
}

export function MessageList({
  className,
  icon,
  messages,
  pending = false,
  renderMessage,
  ...props
}: MessageListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const jumpRef = useRef<HTMLButtonElement>(null);
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
      const shown = away || pinnedRef.current !== null;

      if (away) follow.current = false;

      if (!shown) blurJump(jumpRef.current, scroller);

      setShowJump(shown);
    };

    let lastTop = scroller.scrollTop;
    let lastHeight = scroller.scrollHeight;
    let inputAt = -Infinity;

    const onScroll = () => {
      const { clientHeight, scrollHeight, scrollTop } = scroller;
      const up = scrollTop < lastTop;
      const shrank = scrollHeight < lastHeight;

      lastTop = scrollTop;
      lastHeight = scrollHeight;

      if (
        follow.current &&
        up &&
        !shrank &&
        scrollHeight - scrollTop - clientHeight >= 8 &&
        performance.now() - inputAt < 150
      ) {
        follow.current = false;
      }

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
      inputAt = performance.now();
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
      blurJump(jumpRef.current, scroller);
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

  return (
    <div className="fb-message-list">
      <div
        ref={ref}
        aria-live="polite"
        className={`fb-message-list__scroller${className ? ` ${className}` : ''}`}
        role="log"
        tabIndex={-1}
        {...props}
      >
        <div ref={contentRef} className="fb-message-list__content">
          {messages.map((message) => (
            <div key={message.id} className="fb-message-list__item" data-message-id={message.id}>
              <LiveContext value={pending && message === messages.at(-1)}>
                {renderMessage ? (
                  renderMessage(message)
                ) : (
                  <Message role={message.role}>
                    {message.parts.map((part, index) => (
                      <MessagePart key={`${message.id}-${index}`} part={part} role={message.role} />
                    ))}
                  </Message>
                )}
              </LiveContext>
            </div>
          ))}
          <WorkingIndicator active={pending} icon={icon} />
        </div>
      </div>
      <button
        ref={jumpRef}
        type="button"
        aria-label="Jump to latest"
        className="fb-message-list__jump fb-slide-up-1"
        data-shown={showJump || undefined}
        inert={!showJump}
        onClick={() => {
          const scroller = ref.current;

          follow.current = pending;
          moving.current = null;
          setPinned(null);
          blurJump(jumpRef.current, scroller);
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
