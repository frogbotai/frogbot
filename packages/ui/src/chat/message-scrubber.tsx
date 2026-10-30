'use client';

import type { UIMessage } from 'ai';
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Popover, PopoverAnchor, PopoverContent } from '../components/popover.js';
import { speechText } from './speech-text.js';
import { onUserScroll, prefersReducedMotion } from './user-scroll.js';

export interface MessageScrubberProps {
  messages: UIMessage[];
  onPin: (id: string | null) => void;
  pinned: string | null;
  scrollerRef: RefObject<HTMLDivElement | null>;
}

const closeDelay = 120;

const fisheye = 3;

function labelOf(message: UIMessage, index: number) {
  for (const part of message.parts) {
    if (part.type !== 'text') continue;

    const line = part.text
      .split('\n')
      .map((text) => text.trim())
      .find(Boolean);

    if (line) return line;
  }

  const file = message.parts.find((part) => part.type === 'file');

  return file?.filename ? file.filename : `Message ${index + 1}`;
}

function itemsOf(scroller: HTMLElement) {
  const items = new Map<string, HTMLElement>();

  scroller
    .querySelectorAll<HTMLElement>(':scope > .fb-message-list__content > .fb-message-list__item')
    .forEach((item) => {
      if (item.dataset.messageId) items.set(item.dataset.messageId, item);
    });

  return items;
}

function replyOf(messages: UIMessage[], userId: string) {
  const start = messages.findIndex((message) => message.id === userId);
  const texts: string[] = [];

  for (const message of messages.slice(start + 1)) {
    if (message.role === 'user') break;
    if (message.role !== 'assistant') continue;

    for (const part of message.parts) if (part.type === 'text') texts.push(part.text);
  }

  return texts.length ? speechText(texts.join('\n\n')) : '';
}

function remOf(element: Element) {
  return parseFloat(getComputedStyle(element).fontSize) || 16;
}

export function composerHeight(scroller: HTMLElement) {
  const value = getComputedStyle(scroller).getPropertyValue('--fb-composer-height').trim();

  return value.endsWith('px') ? parseFloat(value) : 7 * remOf(document.documentElement);
}

export function MessageScrubber({ messages, onPin, pinned, scrollerRef }: MessageScrubberProps) {
  const users = useMemo(
    () =>
      messages
        .filter((message) => message.role === 'user')
        .map((message, index) => ({ id: message.id, label: labelOf(message, index) })),
    [messages],
  );

  const railRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hovering = useRef(false);
  const held = useRef<{ height: number; top: number | null }>({ height: 0, top: null });
  const [overflowing, setOverflowing] = useState(false);
  const [onScreen, setOnScreen] = useState<string | null>(null);
  const [inView, setInView] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const live = useRef({ focused, onPin, pinned });

  live.current = { focused, onPin, pinned };

  const shown = overflowing && users.length >= 2;
  const current = users.some((user) => user.id === pinned) ? pinned : (onScreen ?? users[0]?.id);
  const activeIndex = users.findIndex((user) => user.id === active);
  const visible = useMemo(() => new Set(inView.split(' ')), [inView]);

  const reply = useMemo(
    () => (open && active ? replyOf(messages, active) : ''),
    [messages, active, open],
  );

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller) return;

    const measure = () => {
      setOverflowing(scroller.scrollHeight > scroller.clientHeight);

      const items = itemsOf(scroller);
      const top = scroller.getBoundingClientRect().top;
      const line = top + scroller.clientHeight * 0.25;
      const band = top + scroller.clientHeight - composerHeight(scroller);
      const last = [...items.values()].at(-1)?.getBoundingClientRect().bottom ?? top;
      const tops = users.map((user) => items.get(user.id)?.getBoundingClientRect().top);
      const seen: string[] = [];
      let next: string | null = null;

      users.forEach((user, index) => {
        const start = tops[index];

        if (start === undefined) return;

        const end = tops.slice(index + 1).find((value) => value !== undefined) ?? last;

        if (start <= line) next = user.id;
        if (Math.min(end, band) - Math.max(start, top) >= 1) seen.push(user.id);
      });

      setOnScreen(next);
      setInView(seen.join(' '));
    };

    const pinnedTop = () => {
      const id = live.current.pinned;
      const item = id ? itemsOf(scroller).get(id) : undefined;

      return item ? item.getBoundingClientRect().top - scroller.getBoundingClientRect().top : null;
    };

    const sync = () => {
      const now = pinnedTop();
      const resized = scroller.scrollHeight !== held.current.height;

      if (
        resized &&
        now !== null &&
        held.current.top !== null &&
        Math.abs(now - held.current.top) >= 1
      ) {
        scroller.scrollTop += now - held.current.top;
      }

      held.current = { height: scroller.scrollHeight, top: pinnedTop() };
      measure();
    };

    const observer = new ResizeObserver(sync);

    observer.observe(scroller);

    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);

    scroller.addEventListener('scroll', sync, { passive: true });

    const stop = onUserScroll(scroller, () => {
      if (live.current.pinned) live.current.onPin(null);
    });

    sync();

    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', sync);
      stop();
    };
  }, [scrollerRef, users]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!shown) setOpen(false);
  }, [shown]);

  useEffect(() => {
    const rail = railRef.current;
    const tick = rail?.querySelector<HTMLElement>('[data-in-view]');

    if (!rail || !tick) return;

    const bottom = tick.offsetTop + tick.offsetHeight;

    if (tick.offsetTop < rail.scrollTop) rail.scrollTop = tick.offsetTop;
    else if (bottom > rail.scrollTop + rail.clientHeight) {
      rail.scrollTop = bottom - rail.clientHeight;
    }
  }, [current, inView, shown]);

  if (!shown) return null;

  const jump = (id: string) => {
    const scroller = scrollerRef.current;
    const item = scroller && itemsOf(scroller).get(id);

    if (!scroller || !item) return;

    const top =
      scroller.scrollTop +
      item.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      remOf(document.documentElement);

    onPin(id);
    scroller.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };

  const scheduleClose = () => {
    clearTimeout(closeTimer.current);

    closeTimer.current = setTimeout(() => {
      if (hovering.current) return;

      if (railRef.current?.contains(document.activeElement)) {
        if (live.current.focused) setActive(live.current.focused);

        return;
      }

      setOpen(false);
      setActive(null);
    }, closeDelay);
  };

  const hover = {
    onPointerEnter: () => {
      hovering.current = true;
      show();
    },
    onPointerLeave: () => {
      hovering.current = false;
      scheduleClose();
    },
  };

  const step = (event: KeyboardEvent<HTMLButtonElement>, by: number) => {
    const ticks = [
      ...(railRef.current?.querySelectorAll<HTMLButtonElement>('.fb-message-list__scrubber-tick') ??
        []),
    ];

    const index = ticks.indexOf(event.currentTarget);

    event.preventDefault();
    ticks[Math.min(Math.max(index + by, 0), ticks.length - 1)]?.focus();
  };

  const insideRail = (event: Event) => {
    if (event.target instanceof Node && railRef.current?.contains(event.target)) {
      event.preventDefault();
    }
  };

  return (
    <Popover open={open && activeIndex >= 0} onOpenChange={setOpen}>
      <PopoverAnchor virtualRef={activeRef} />
      <nav
        ref={railRef}
        aria-label="Conversation messages"
        className="fb-message-list__scrubber"
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;

          setFocused(null);
          scheduleClose();
        }}
      >
        <ol className="fb-message-list__scrubber-list" {...hover}>
          {users.map((user, index) => {
            const distance = activeIndex >= 0 ? Math.abs(index - activeIndex) : Infinity;

            return (
              <li key={user.id}>
                <button
                  ref={user.id === active ? activeRef : undefined}
                  type="button"
                  aria-current={user.id === current ? 'true' : undefined}
                  aria-label={`Go to message ${index + 1} of ${users.length}: ${user.label}`}
                  className="fb-message-list__scrubber-tick"
                  data-distance={distance <= fisheye ? distance : undefined}
                  data-in-view={visible.has(user.id) || user.id === current || undefined}
                  tabIndex={user.id === (focused ?? current) ? 0 : -1}
                  onClick={() => jump(user.id)}
                  onFocus={() => {
                    setFocused(user.id);
                    setActive(user.id);
                    show();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') step(event, -1);
                    else if (event.key === 'ArrowDown') step(event, 1);
                  }}
                  onPointerEnter={() => setActive(user.id)}
                >
                  <span className="fb-message-list__scrubber-line" />
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <PopoverContent
        align="center"
        aria-hidden="true"
        className="fb-message-list__scrubber-card"
        collisionPadding={8}
        side="right"
        sideOffset={10}
        onClick={() => active && jump(active)}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onFocusOutside={insideRail}
        onMouseDown={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={insideRail}
        {...hover}
      >
        <div className="fb-message-list__scrubber-label">{users[activeIndex]?.label}</div>
        {reply && <div className="fb-message-list__scrubber-reply">{reply}</div>}
      </PopoverContent>
    </Popover>
  );
}
