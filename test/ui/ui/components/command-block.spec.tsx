import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandBlock } from '../../../../packages/ui/src/components/command-block';

const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

async function clickCopy(name = 'Copy') {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await Promise.resolve();
  });
}

function throwingExec() {
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: () => {
      throw new Error('SecurityError');
    },
  });
}

function mockClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('CommandBlock', () => {
  it('renders the label and the code', () => {
    render(
      <CommandBlock
        className="extra"
        code="npx skills add x"
        data-testid="block"
        label="Terminal"
      />,
    );

    const block = screen.getByTestId('block');

    expect(block.className).toBe('fb-command-block extra');
    expect(block.querySelector('.fb-command-block__label')?.textContent).toBe('Terminal');
    expect(block.querySelector('code')?.textContent).toBe('npx skills add x');
    expect(screen.getByRole('button', { name: 'Copy Terminal' })).toBeTruthy();
  });

  it('copies exactly the code, line breaks kept, then calls onCopy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn();
    const code = 'claude mcp add \\\n  --transport http dojo https://example.com/mcp';
    mockClipboard({ writeText });

    render(<CommandBlock code={code} onCopy={onCopy} />);
    await clickCopy();

    expect(writeText).toHaveBeenCalledWith(code);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('keeps backticks and markup as plain text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard({ writeText, write: vi.fn() });

    render(<CommandBlock code="echo `date` **bold**" />);
    await clickCopy();

    expect(writeText).toHaveBeenCalledWith('echo `date` **bold**');
  });

  it('falls back to a textarea without navigator.clipboard', async () => {
    mockClipboard(undefined);
    let copied = '';
    const execCommand = vi.fn(() => {
      copied = document.querySelector('textarea')?.value ?? '';

      return true;
    });

    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    const onCopy = vi.fn();

    render(<CommandBlock code="codex mcp add dojo" onCopy={onCopy} />);
    await clickCopy();

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(copied).toBe('codex mcp add dojo');
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('does not call onCopy when the copy fails', async () => {
    mockClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
    const onCopy = vi.fn();

    render(<CommandBlock code="x" onCopy={onCopy} />);
    await clickCopy();

    expect(onCopy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('returns to Copy after a moment', async () => {
    vi.useFakeTimers();
    mockClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });

    render(<CommandBlock code="x" />);
    await clickCopy();

    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('leaves no textarea behind when the clipboard and execCommand both throw', async () => {
    mockClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    throwingExec();
    const onCopy = vi.fn();

    render(<CommandBlock code="x" onCopy={onCopy} />);
    await clickCopy();

    expect(onCopy).not.toHaveBeenCalled();
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('leaves no textarea behind without a clipboard when execCommand throws', async () => {
    mockClipboard(undefined);
    throwingExec();

    render(<CommandBlock code="x" />);
    await clickCopy();

    expect(document.querySelector('textarea')).toBeNull();
  });

  it('restarts the Copied window on a second copy', async () => {
    vi.useFakeTimers();
    mockClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });

    render(<CommandBlock code="x" />);
    await clickCopy();

    act(() => {
      vi.advanceTimersByTime(1400);
    });

    await clickCopy('Copied');

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('makes the code box a named, keyboard-focusable region', () => {
    const { container } = render(<CommandBlock code="ls" label="Terminal" />);
    const pre = container.querySelector('pre');

    expect(pre?.getAttribute('role')).toBe('region');
    expect(pre?.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('region', { name: 'Terminal' })).toBe(pre);
  });
});
