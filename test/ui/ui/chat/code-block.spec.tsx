import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CodeBlock } from '../../../../packages/ui/src/chat/code-block';
import { highlight } from '../../../../packages/ui/src/chat/highlight';
import { Message, type MessageProps } from '../../../../packages/ui/src/chat/message';
import { MessagePart } from '../../../../packages/ui/src/chat/message-part';

const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function mockClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

async function clickCopy() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await Promise.resolve();
  });
}

function renderCodeInMessage(role: MessageProps['role']) {
  return render(
    <Message role={role}>
      <MessagePart
        role={role}
        part={{ type: 'text', text: '```js\nconst x = 1\n```', state: 'done' }}
      />
    </Message>,
  );
}

afterEach(() => {
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
  vi.useRealTimers();
});

describe('CodeBlock', () => {
  it('renders code literally with its language', () => {
    const { container } = render(<CodeBlock code={'<script>bad()</script>'} language="html" />);
    const block = container.querySelector<HTMLElement>('.fb-code-block');

    expect(screen.getByText('<script>bad()</script>')).toBeTruthy();
    expect(block?.dataset.language).toBe('html');
    expect(block?.className).toBe('fb-code-block');
    expect(container.querySelector('.fb-code-block__language')?.textContent).toBe('html');
    expect(container.querySelector('script')).toBeNull();
  });

  it('marks code blocks in user messages without a theme provider', () => {
    const { container } = renderCodeInMessage('user');

    expect(
      container.querySelector('.fb-code-block')?.classList.contains('fb-code-block--user'),
    ).toBe(true);
  });

  it('leaves code blocks in assistant messages unmarked', () => {
    const { container } = renderCodeInMessage('assistant');

    expect(
      container.querySelector('.fb-code-block')?.classList.contains('fb-code-block--user'),
    ).toBe(false);
  });

  it('copies the exact raw code, trailing whitespace kept, and announces it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const code = 'const a = 1;  \n\tif (a) {}\n\n';
    mockClipboard({ writeText });

    render(<CodeBlock code={code} />);
    await clickCopy();

    expect(writeText).toHaveBeenCalledWith(code);
    expect(screen.getByRole('status').textContent).toBe('Copied');
    expect(document.querySelector('.fb-code-block__copy[data-copied]')).not.toBeNull();
  });

  it('copies the raw code, not the highlighted markup, and resets after a moment', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const code = "const greeting: string = 'hi';";
    mockClipboard({ writeText });

    const { container } = render(<CodeBlock code={code} language="ts" />);

    await waitFor(() => expect(container.querySelector('code span')).not.toBeNull());

    expect(container.querySelector('code')?.textContent).toBe(code);

    vi.useFakeTimers();
    await clickCopy();

    expect(writeText).toHaveBeenCalledWith(code);

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('shows new streamed text plain until it is highlighted', async () => {
    const { container, rerender } = render(<CodeBlock code="const a = 1;" language="ts" />);

    await waitFor(() => expect(container.querySelector('code span')).not.toBeNull());
    rerender(<CodeBlock code={'const a = 1;\nconst b'} language="ts" />);

    expect(container.querySelector('code')?.textContent).toBe('const a = 1;\nconst b');

    await waitFor(() =>
      expect(
        [...container.querySelectorAll('code span')].map((span) => span.textContent),
      ).toContain('b'),
    );
  });

  it('keeps an unknown language plain', async () => {
    const { container } = render(<CodeBlock code="hello" language="not-a-language" />);

    expect(await highlight('hello', 'not-a-language')).toBeUndefined();
    expect(container.querySelector('code span')).toBeNull();
    expect(container.querySelector('code')?.textContent).toBe('hello');
  });
});

describe('highlight', () => {
  it('colours tokens from the theme tokens and accepts aliases in any case', async () => {
    const lines = await highlight("const a = 'x'; // note", 'TypeScript');
    const colors = Object.fromEntries(
      lines?.[0]?.map((token) => [token.content, token.color]) ?? [],
    );

    expect(colors.const).toContain('var(--color-text-danger)');
    expect(colors["'x'"]).toContain('var(--color-text-success)');
    expect(colors['// note']).toContain('var(--color-text-tertiary)');
  });

  it('keeps every line, including trailing blank ones', async () => {
    const lines = await highlight('a\n\nb\n', 'js');

    expect(lines?.map((line) => line.map((token) => token.content).join(''))).toEqual([
      'a',
      '',
      'b',
      '',
    ]);
  });
});
