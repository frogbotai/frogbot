import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageList } from '../../../../packages/ui/src/chat/message-list';
import { speechText } from '../../../../packages/ui/src/chat/speech-text';

vi.mock('../../../../packages/ui/src/chat/speech-text', async (importOriginal) => {
  const actual = await importOriginal<{ speechText: typeof speechText }>();

  return { ...actual, speechText: vi.fn(actual.speechText) };
});

const thread: UIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: '\n  First question  \nmore' }] },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'First answer' }] },
  {
    id: 'u2',
    role: 'user',
    parts: [{ type: 'file', mediaType: 'image/png', url: 'data:,', filename: 'chart.png' }],
  },
  { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'Second answer' }] },
  { id: 'u3', role: 'user', parts: [{ type: 'text', text: '   ' }] },
  { id: 'a3', role: 'assistant', parts: [{ type: 'text', text: 'Third answer' }] },
];

function stubItems(container: HTMLElement, tops: Record<string, number> = {}) {
  container.querySelectorAll<HTMLElement>('.fb-message-list__item').forEach((item, index) => {
    const top = tops[item.dataset.messageId!] ?? index * 500;

    item.getBoundingClientRect = () => ({ top, bottom: top + 500 }) as DOMRect;
  });
}

function stubLayout(container: HTMLElement, { overflow = true } = {}) {
  const scroller = container.querySelector('.fb-message-list__scroller') as HTMLDivElement;

  Object.defineProperties(scroller, {
    scrollHeight: { value: overflow ? 3000 : 400, configurable: true },
    clientHeight: { value: 400, configurable: true },
    offsetWidth: { value: 1000, configurable: true },
    clientWidth: { value: 1000, configurable: true },
    scrollTop: { value: 0, writable: true, configurable: true },
    scrollTo: { value: vi.fn(), configurable: true },
    getBoundingClientRect: {
      value: () => ({ top: 0, bottom: 400 }) as DOMRect,
      configurable: true,
    },
  });

  stubItems(container);
  fireEvent.scroll(scroller);

  return scroller;
}

const ticks = () =>
  within(screen.getByRole('navigation', { name: 'Conversation messages' })).getAllByRole('button');

const inView = () => ticks().filter((tick) => tick.hasAttribute('data-in-view'));

const card = () => document.querySelector<HTMLElement>('.fb-message-list__scrubber-card');

beforeEach(() => {
  vi.mocked(speechText).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MessageList', () => {
  it('shows the jump button when the end is out of view, and jumps there at once', () => {
    const { container } = render(<MessageList messages={thread} />);

    const scroller = stubLayout(container);
    const button = () =>
      container.querySelector<HTMLButtonElement>('.fb-message-list__jump[data-shown]:not([inert])');

    expect(screen.getByText('First answer')).toBeTruthy();

    fireEvent.click(button()!);

    expect(scroller.scrollTop).toBe(3000);
    expect(scroller.scrollTo).not.toHaveBeenCalled();
    expect(button()).toBeNull();

    const hidden = container.querySelector<HTMLButtonElement>('.fb-message-list__jump')!;

    expect(hidden.hasAttribute('inert')).toBe(true);
    expect(hidden.hasAttribute('data-shown')).toBe(false);

    stubItems(container, { u1: -2800, a1: -2300, u2: -1800, a2: -1300, u3: -800, a3: -300 });
    fireEvent.scroll(scroller);

    expect(button()).toBeNull();

    stubItems(container);
    fireEvent.wheel(scroller);
    fireEvent.scroll(scroller);

    expect(button()?.hasAttribute('data-shown')).toBe(true);
  });

  it('moves focus off the jump button when it hides, and makes it inert', () => {
    const { container } = render(<MessageList messages={thread} />);

    const scroller = stubLayout(container);
    const jump = screen.getByRole('button', { name: 'Jump to latest' });

    expect(jump.hasAttribute('inert')).toBe(false);

    act(() => jump.focus());
    fireEvent.click(jump);

    expect(jump.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(scroller);
  });

  it('stops following after a jump once the user scrolls up 8px from the end', () => {
    const observers: Array<() => void> = [];

    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }

        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );

    const { container } = render(<MessageList messages={thread} pending />);

    const scroller = stubLayout(container);
    const grow = (height: number) => {
      Object.defineProperty(scroller, 'scrollHeight', { value: height, configurable: true });
      act(() => observers.forEach((callback) => callback()));
      fireEvent.scroll(scroller);
    };

    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));
    stubItems(container, { u1: -2800, a1: -2300, u2: -1800, a2: -1300, u3: -800, a3: -300 });
    grow(3500);

    expect(scroller.scrollTop).toBe(3500);

    fireEvent.wheel(scroller, { deltaY: -8 });
    scroller.scrollTop = 3500 - 400 - 8;
    fireEvent.scroll(scroller);
    grow(3600);

    expect(scroller.scrollTop).toBe(3092);

    vi.unstubAllGlobals();
  });

  it('follows the reply after a jump until the stream ends', () => {
    const observers: Array<() => void> = [];

    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }

        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );

    const { container, rerender } = render(<MessageList messages={thread} pending />);

    const scroller = stubLayout(container);
    const grow = (height: number) => {
      Object.defineProperty(scroller, 'scrollHeight', { value: height, configurable: true });
      act(() => observers.forEach((callback) => callback()));
    };

    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));
    stubItems(container, { u1: -2800, a1: -2300, u2: -1800, a2: -1300, u3: -800, a3: -300 });
    grow(3500);

    expect(scroller.scrollTop).toBe(3500);

    rerender(<MessageList messages={thread} />);
    grow(4000);

    expect(scroller.scrollTop).toBe(3500);

    vi.unstubAllGlobals();
  });

  it('opens another chat at the bottom at once, with no animation', () => {
    const { container, rerender } = render(<MessageList messages={thread} />);

    const scroller = stubLayout(container);

    rerender(
      <MessageList
        messages={[
          { id: 'other', role: 'user', parts: [{ type: 'text', text: 'Other' }] },
          ...thread,
        ]}
      />,
    );

    expect(scroller.scrollTop).toBe(3000);
    expect(scroller.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls a sent message to the top once and reserves the space below it', () => {
    const { container, rerender } = render(<MessageList messages={thread} />);

    const scroller = stubLayout(container);
    const content = container.querySelector<HTMLElement>('.fb-message-list__content')!;

    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return { top: this.dataset.messageId === 'u4' ? 3000 : 0, bottom: 3100 } as DOMRect;
      });

    const sent: UIMessage[] = [
      ...thread,
      { id: 'u4', role: 'user', parts: [{ type: 'text', text: 'Next question' }] },
    ];

    rerender(<MessageList messages={sent} />);

    expect(scroller.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 3000, behavior: 'smooth' });
    expect(content.style.minHeight).toBe('3400px');

    fireEvent.scroll(scroller);

    expect(container.querySelector('.fb-message-list__jump')?.hasAttribute('inert')).toBe(true);

    rerender(
      <MessageList
        messages={[
          ...sent,
          { id: 'a4', role: 'assistant', parts: [{ type: 'text', text: 'Reply' }] },
        ]}
      />,
    );

    expect(vi.mocked(scroller.scrollTo).mock.calls).toHaveLength(1);
    expect(content.style.minHeight).toBe('3400px');

    rect.mockRestore();
  });

  it('supports consumer-owned message rendering', () => {
    render(
      <MessageList
        messages={[{ id: '1', role: 'user', parts: [] }]}
        renderMessage={(message) => <div key={message.id}>Own state</div>}
      />,
    );

    expect(screen.getByText('Own state')).toBeTruthy();
  });

  it('wraps every row, default or custom, in an anchor it owns', () => {
    const { container, rerender } = render(<MessageList messages={thread} />);

    const ids = () =>
      [...container.querySelectorAll<HTMLElement>('.fb-message-list__item[data-message-id]')].map(
        (item) => item.dataset.messageId,
      );

    expect(ids()).toEqual(['u1', 'a1', 'u2', 'a2', 'u3', 'a3']);

    rerender(
      <MessageList
        messages={thread}
        renderMessage={(message) => <p className="own">{message.id}</p>}
      />,
    );

    expect(ids()).toEqual(['u1', 'a1', 'u2', 'a2', 'u3', 'a3']);
    expect(screen.getByText('u2').closest('.fb-message-list__item')).toBeTruthy();
  });

  it('gives each user message a named tick on a rail outside the log', () => {
    const { container } = render(<MessageList messages={thread} />);

    stubLayout(container);

    expect(ticks().map((tick) => tick.getAttribute('aria-label'))).toEqual([
      'Go to message 1 of 3: First question',
      'Go to message 2 of 3: chart.png',
      'Go to message 3 of 3: Message 3',
    ]);

    expect(screen.getByRole('navigation').closest('[role=log]')).toBeNull();
    expect(screen.getByRole('log').contains(screen.getByRole('navigation'))).toBe(false);
  });

  it('shows no rail for one user message or a chat that does not overflow', () => {
    const { container, rerender } = render(<MessageList messages={thread.slice(0, 2)} />);

    stubLayout(container);

    expect(screen.queryByRole('navigation')).toBeNull();

    rerender(<MessageList messages={thread} />);
    stubLayout(container, { overflow: false });

    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('opens the card on focus without moving focus and closes it on Escape', () => {
    const { container } = render(<MessageList messages={thread} />);

    stubLayout(container);

    const [first] = ticks();

    act(() => first.focus());

    expect(card()?.getAttribute('aria-hidden')).toBe('true');
    expect(card()?.textContent).toContain('First question');
    expect(card()?.textContent).toContain('First answer');
    expect(card()?.textContent).not.toContain('chart.png');
    expect(card()?.querySelector('button')).toBeNull();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: 'Escape' });

    expect(document.querySelector('.fb-message-list__scrubber-card')).toBeNull();
    expect(document.activeElement).toBe(first);
  });

  it('is one tab stop and moves focus between ticks with Up and Down', () => {
    const { container } = render(<MessageList messages={thread} />);

    stubLayout(container);

    expect(ticks().map((tick) => tick.tabIndex)).toEqual([0, -1, -1]);

    const [first, second, third] = ticks();

    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(second);
    expect(second.tabIndex).toBe(0);

    fireEvent.keyDown(second, { key: 'ArrowDown' });
    fireEvent.keyDown(third, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(third);
    expect(ticks().filter((tick) => tick.tabIndex === 0)).toEqual([third]);
  });

  it('jumps to a clicked turn, keeps it current and stops following', () => {
    const { container } = render(<MessageList messages={thread} />);

    const scroller = stubLayout(container);

    expect(ticks()[0].getAttribute('aria-current')).toBe('true');

    fireEvent.click(ticks()[1]);

    expect(ticks().filter((tick) => tick.getAttribute('aria-current') === 'true')).toEqual([
      ticks()[1],
    ]);
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 984, behavior: 'smooth' });
    expect(inView()).toContain(ticks()[1]);
    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeTruthy();

    fireEvent.scroll(scroller);

    expect(ticks()[1].getAttribute('aria-current')).toBe('true');

    fireEvent.wheel(scroller);

    expect(ticks()[0].getAttribute('aria-current')).toBe('true');
  });

  it('keeps a pinned turn in place when rows above it change height', () => {
    const { container } = render(<MessageList messages={thread} />);

    const scroller = stubLayout(container);

    fireEvent.click(ticks()[1]);
    fireEvent.scroll(scroller);

    const second = container.querySelector<HTMLElement>('[data-message-id="u2"]')!;

    second.getBoundingClientRect = () => ({ top: 960 }) as DOMRect;
    Object.defineProperty(scroller, 'scrollHeight', { value: 2960, configurable: true });
    fireEvent.scroll(scroller);

    expect(scroller.scrollTop).toBe(-40);
  });

  it('marks the turns on screen above the composer as in view', () => {
    const { container } = render(<MessageList messages={thread} />);

    const scroller = stubLayout(container);

    expect(inView()).toEqual([ticks()[0]]);

    stubItems(container, { u1: -1000, a1: -500, u2: -100, a2: 400, u3: 900, a3: 1400 });
    fireEvent.scroll(scroller);

    expect(inView()).toEqual([ticks()[1]]);
    expect(ticks()[1].getAttribute('aria-current')).toBe('true');
  });

  it('shows only the label for a tool-only reply or a turn with no reply', () => {
    const toolOnly: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Run it' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'Thinking hard' },
          {
            type: 'tool-search',
            toolCallId: 't1',
            state: 'output-available',
            input: {},
            output: 'found',
          },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Anything else?' }] },
    ];

    const { container } = render(<MessageList messages={toolOnly} />);

    stubLayout(container);

    for (const [index, label] of ['Run it', 'Anything else?'].entries()) {
      act(() => ticks()[index].focus());

      expect(card()?.textContent).toBe(label);
      expect(card()?.querySelector('.fb-message-list__scrubber-reply')).toBeNull();
    }
  });

  it('previews the reply as plain words without markdown or code', () => {
    const markdown: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Show me' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: '**Bold** words\n\n```js\nconst x = 1;\n```' }],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Thanks' }] },
    ];

    const { container } = render(<MessageList messages={markdown} />);

    stubLayout(container);
    act(() => ticks()[0].focus());

    const reply = card()?.querySelector('.fb-message-list__scrubber-reply');

    expect(reply?.textContent).toBe('Bold words');
    expect(card()?.textContent).not.toContain('const');
    expect(card()?.textContent).not.toContain('`');
  });

  it('parses only the open turn’s reply', () => {
    const { container, rerender } = render(<MessageList messages={thread} />);

    stubLayout(container);

    expect(speechText).not.toHaveBeenCalled();

    act(() => ticks()[0].focus());

    expect(vi.mocked(speechText).mock.calls).toEqual([['First answer']]);

    vi.mocked(speechText).mockClear();

    rerender(
      <MessageList
        messages={thread.map((message) =>
          message.id === 'a2'
            ? { ...message, parts: [{ type: 'text', text: 'Second answer, streaming' }] }
            : message,
        )}
      />,
    );

    expect(vi.mocked(speechText).mock.calls.flat().join(' ')).not.toContain('Second');
  });

  it('shows the open turn’s reply as it streams', () => {
    const { container, rerender } = render(<MessageList messages={thread} />);

    stubLayout(container);
    act(() => ticks()[0].focus());

    rerender(
      <MessageList
        messages={thread.map((message) =>
          message.id === 'a1'
            ? { ...message, parts: [{ type: 'text', text: 'First answer, still streaming' }] }
            : message,
        )}
      />,
    );

    expect(card()?.textContent).toContain('First answer, still streaming');
  });

  it('returns the card to the focused tick once the pointer leaves the rail and card', () => {
    vi.useFakeTimers();

    const { container } = render(<MessageList messages={thread} />);

    stubLayout(container);

    const [first, , third] = ticks();
    const list = first.closest('ol')!;

    act(() => first.focus());
    fireEvent.pointerEnter(list);
    fireEvent.pointerEnter(third);

    expect(card()?.textContent).toContain('Third answer');

    fireEvent.pointerLeave(list);
    fireEvent.pointerEnter(card()!);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(card()?.textContent).toContain('Third answer');

    fireEvent.pointerLeave(card()!);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(card()?.textContent).toContain('First answer');
    expect(document.activeElement).toBe(first);
  });
});
