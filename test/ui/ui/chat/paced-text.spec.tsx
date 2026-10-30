import { act, render } from '@testing-library/react';
import type { TextUIPart } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TextPart } from '../../../../packages/ui/src/chat/text-part';
import { TextSmoother } from '../../../../packages/ui/src/chat/use-paced-text';

const words = Array.from({ length: 400 }, (_, index) => `w${index % 10}xyz`).join(' ');

const part = (text: string, state: TextUIPart['state']): TextUIPart => ({
  type: 'text',
  text,
  state,
});

const frames = (count: number) => {
  for (let index = 0; index < count; index++) {
    act(() => {
      vi.advanceTimersByTime(1000 / 60);
    });
  }
};

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'Date',
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('paced text', () => {
  it('reveals a long chunk character by character over about 0.3s, then all of it at the end', () => {
    const start = 'Hello there. ';
    const text = `${start}${words}`;

    expect(words.length).toBeGreaterThanOrEqual(2000);

    const { container, rerender } = render(<TextPart part={part(start, 'streaming')} />);

    const shown = () => container.textContent ?? '';

    rerender(<TextPart part={part(text, 'streaming')} />);

    expect(shown()).toBe(start.trim());

    const seen: string[] = [];

    for (let frame = 0; frame < 12; frame++) {
      frames(1);
      seen.push(shown());
    }

    expect(new Set(seen).size).toBeGreaterThan(8);

    for (const [index, value] of seen.entries()) {
      expect(text.startsWith(value)).toBe(true);
      expect(value.length).toBeGreaterThanOrEqual(seen[index - 1]?.length ?? 0);
    }

    expect(seen.at(-1)!.length).toBeLessThan(text.length);
    expect(seen.some((value) => /\w$/.test(value) && /\w/.test(text[value.length]))).toBe(true);

    frames(12);

    expect(shown()).toBe(text);

    rerender(<TextPart part={part(`${text} more`, 'streaming')} />);
    rerender(<TextPart part={part(`${text} more and the end`, 'done')} />);

    expect(shown()).toBe(`${text} more and the end`);
  });

  it('renders a history message in full at once', () => {
    const { container } = render(<TextPart part={part(words, 'done')} />);

    expect(container.textContent).toBe(words);

    const streaming = render(<TextPart part={part(words, 'streaming')} />);

    expect(streaming.container.textContent).toBe(words);
  });

  it('shows streamed text at once under reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({ matches: query === '(prefers-reduced-motion: reduce)' }) as MediaQueryList,
    );

    const { container, rerender } = render(<TextPart part={part('Hi', 'streaming')} />);

    rerender(<TextPart part={part(`Hi ${words}`, 'streaming')} />);

    expect(container.textContent).toBe(`Hi ${words}`);
  });

  it('slows to a 200ms tick while the tab is hidden', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const { container, rerender } = render(<TextPart part={part('', 'streaming')} />);

    rerender(<TextPart part={part(words, 'streaming')} />);

    act(() => {
      vi.advanceTimersByTime(190);
    });

    expect(container.textContent).toBe('');

    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(container.textContent?.length).toBeGreaterThan(0);

    hidden.mockRestore();
  });
});

describe('TextSmoother', () => {
  it('settles about 0.3s behind text that arrives at a steady rate', () => {
    const smoother = new TextSmoother('');
    const chunk = 'abcdefghij'.repeat(5);
    let now = 1000;
    let arrived = 0;
    let shown = '';

    for (let tick = 0; tick < 180; tick++) {
      if (tick % 6 === 0) {
        smoother.add(chunk, now);
        arrived += chunk.length;
      }

      shown = smoother.revealed(now);
      now += 1000 / 60;
    }

    const rate = chunk.length / 0.1;
    const lag = (arrived - shown.length) / rate;

    expect(lag).toBeGreaterThan(0.1);
    expect(lag).toBeLessThan(0.6);
  });
});
