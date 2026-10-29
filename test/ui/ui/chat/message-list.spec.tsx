import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { MessageList } from '../../../../packages/ui/src/chat/message-list';

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

function stubLayout(container: HTMLElement, { overflow = true } = {}) {
  const scroller = container.querySelector('.fb-message-list__scroller') as HTMLDivElement;

  Object.defineProperties(scroller, {
    scrollHeight: { value: overflow ? 3000 : 400, configurable: true },
    clientHeight: { value: 400, configurable: true },
    offsetWidth: { value: 1000, configurable: true },
    clientWidth: { value: 1000, configurable: true },
    scrollTop: { value: 0, writable: true, configurable: true },
    scrollTo: { value: vi.fn(), configurable: true },
    getBoundingClientRect: { value: () => ({ top: 0 }) as DOMRect, configurable: true },
  });

  container.querySelectorAll<HTMLElement>('.fb-message-list__item').forEach((item, index) => {
    item.getBoundingClientRect = () => ({ top: index * 500 }) as DOMRect;
  });

  fireEvent.scroll(scroller);

  return scroller;
}

const ticks = () =>
  within(screen.getByRole('navigation', { name: 'Conversation messages' })).getAllByRole('button');

describe('MessageList', () => {
  it('renders messages and exposes scroll recovery when detached', () => {
    const { container } = render(
      <MessageList
        messages={[{ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] }]}
      />,
    );

    const scroller = container.querySelector('.fb-message-list__scroller') as HTMLDivElement;

    Object.defineProperties(scroller, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 200 },
      scrollTop: { value: 0, writable: true },
      scrollTo: { value: vi.fn() },
    });

    fireEvent.scroll(scroller);

    expect(screen.getByText('Hello')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));

    expect(scroller.scrollTo).toHaveBeenCalled();
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

    const card = document.querySelector('.fb-message-list__scrubber-card');

    expect(card).toBeTruthy();
    expect(card?.getAttribute('aria-hidden')).toBe('true');
    expect(card?.textContent).toContain('chart.png');
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
});
