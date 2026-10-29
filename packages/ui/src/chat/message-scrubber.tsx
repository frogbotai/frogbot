'use client';

import type { UIMessage } from 'ai';
import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Popover, PopoverAnchor, PopoverContent } from '../components/popover.js';

export interface MessageScrubberProps {
  messages: UIMessage[];
  onPin: (id: string | null) => void;
  pinned: string | null;
  scrollerRef: RefObject<HTMLDivElement | null>;
}

const scrollKeys = new Set(['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' ']);

const closeDelay = 120;

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

function rightGutter(scroller: HTMLElement) {
  const gutter = scroller.offsetWidth - scroller.clientWidth;

  return getComputedStyle(scroller).getPropertyValue('scrollbar-gutter').includes('both-edges')
    ? gutter / 2
    : gutter;
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
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hovering = useRef(false);
  const held = useRef<{ height: number; top: number | null }>({ height: 0, top: null });
  const [overflowing, setOverflowing] = useState(false);
  const [gutter, setGutter] = useState(0);
  const [onScreen, setOnScreen] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const live = useRef({ onPin, pinned });

  live.current = { onPin, pinned };

  const shown = overflowing && users.length >= 2;
  const current = users.some((user) => user.id === pinned) ? pinned : (onScreen ?? users[0]?.id);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller) return;

    const measure = () => {
      setOverflowing(scroller.scrollHeight > scroller.clientHeight);
      setGutter(rightGutter(scroller));

      const items = itemsOf(scroller);
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.25;
      let next: string | null = null;

      for (const user of users) {
        const item = items.get(user.id);

        if (item && item.getBoundingClientRect().top <= line) next = user.id;
      }

      setOnScreen(next);
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

    const release = (event: Event) => {
      if (!live.current.pinned) return;

      if (event.type === 'pointerdown' && event.target !== scroller) return;

      if (event instanceof globalThis.KeyboardEvent && !scrollKeys.has(event.key)) return;

      live.current.onPin(null);
    };

    const observer = new ResizeObserver(sync);
    const releaseOn = ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const;

    observer.observe(scroller);

    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);

    scroller.addEventListener('scroll', sync, { passive: true });
    releaseOn.forEach((type) => scroller.addEventListener(type, release, { passive: true }));
    sync();

    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', sync);
      releaseOn.forEach((type) => scroller.removeEventListener(type, release));
    };
  }, [scrollerRef, users]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!shown) setOpen(false);
  }, [shown]);

  useEffect(() => {
    const rail = railRef.current;
    const tick = rail?.querySelector<HTMLElement>('[aria-current="true"]');

    if (!rail || !tick) return;

    const bottom = tick.offsetTop + tick.offsetHeight;

    if (tick.offsetTop < rail.scrollTop) rail.scrollTop = tick.offsetTop;
    else if (bottom > rail.scrollTop + rail.clientHeight) {
      rail.scrollTop = bottom - rail.clientHeight;
    }
  }, [current, shown]);

  if (!shown) return null;

  const jump = (id: string) => {
    const scroller = scrollerRef.current;
    const item = scroller && itemsOf(scroller).get(id);

    if (!scroller || !item) return;

    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const top =
      scroller.scrollTop +
      item.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      rem;

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    onPin(id);
    scroller.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  };

  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };

  const scheduleClose = () => {
    clearTimeout(closeTimer.current);

    closeTimer.current = setTimeout(() => {
      if (hovering.current || railRef.current?.contains(document.activeElement)) return;

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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <nav
          ref={railRef}
          aria-label="Conversation messages"
          className="fb-message-list__scrubber"
          style={{ '--fb-message-scrubber-gutter': `${gutter}px` } as CSSProperties}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;

            setFocused(null);
            scheduleClose();
          }}
          {...hover}
        >
          <ol className="fb-message-list__scrubber-list">
            {users.map((user, index) => (
              <li key={user.id}>
                <button
                  type="button"
                  aria-current={user.id === current ? 'true' : undefined}
                  aria-label={`Go to message ${index + 1} of ${users.length}: ${user.label}`}
                  className="fb-message-list__scrubber-tick"
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
            ))}
          </ol>
        </nav>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        aria-hidden="true"
        className="fb-message-list__scrubber-card"
        collisionPadding={8}
        side="left"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onFocusOutside={insideRail}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={insideRail}
        {...hover}
      >
        {users.map((user) => (
          <button
            key={user.id}
            type="button"
            className="fb-message-list__scrubber-row"
            data-active={user.id === active || undefined}
            data-current={user.id === current || undefined}
            tabIndex={-1}
            onClick={() => jump(user.id)}
            onMouseDown={(event) => event.preventDefault()}
          >
            {user.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
