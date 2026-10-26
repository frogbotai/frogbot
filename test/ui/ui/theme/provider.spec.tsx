import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../packages/ui/src/components/dropdown-menu';
import { ThemeProvider, ThemeScript, useTheme } from '../../../../packages/ui/src/theme/provider';

function Toggle() {
  const { resolvedMode, setMode } = useTheme();

  return <button onClick={() => setMode('dark')}>{resolvedMode}</button>;
}

function stubSystemMode(dark: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    addEventListener: vi.fn(),
    matches: dark,
    removeEventListener: vi.fn(),
  }));
}

describe('ThemeProvider', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('persists mode changes and themes the page', () => {
    stubSystemMode(false);

    const storage = { get: vi.fn(() => null), set: vi.fn() };
    const { container } = render(
      <ThemeProvider storage={storage}>
        <Toggle />
      </ThemeProvider>,
    );

    expect(document.documentElement.dataset.theme).toBe('light');

    fireEvent.click(screen.getByRole('button'));

    expect(storage.set).toHaveBeenCalledWith('fb-ui-theme', 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(container.firstElementChild?.hasAttribute('data-theme')).toBe(false);
  });

  it('reads the stored mode before paint', () => {
    stubSystemMode(false);

    const storage = { get: vi.fn(() => 'dark' as const), set: vi.fn() };

    render(
      <ThemeProvider storage={storage}>
        <Toggle />
      </ThemeProvider>,
    );

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows the system mode by default', () => {
    stubSystemMode(true);

    render(
      <ThemeProvider storage={{ get: () => null, set: vi.fn() }}>
        <Toggle />
      </ThemeProvider>,
    );

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button').textContent).toBe('dark');
  });

  it('themes only its own section when given a mode', () => {
    stubSystemMode(false);
    document.documentElement.dataset.theme = 'light';

    const { container } = render(
      <ThemeProvider mode="dark">
        <Toggle />
      </ThemeProvider>,
    );

    expect(container.firstElementChild?.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('copies the provider mode to portalled overlays', async () => {
    stubSystemMode(false);

    const { container } = render(
      <ThemeProvider mode="dark">
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Rename</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    const item = await screen.findByRole('menuitem', { name: 'Rename' });
    const frame = item.closest('[data-fb-ui]');

    expect(container.firstElementChild?.contains(item)).toBe(false);
    expect(frame?.getAttribute('data-theme')).toBe('dark');
    expect(frame?.hasAttribute('style')).toBe(false);
  });

  it('renders no inline style on the provider root', () => {
    stubSystemMode(false);

    const legacyProps = { theme: { '--primary': 'red' } } as object;
    const { container } = render(
      <ThemeProvider mode="light" {...legacyProps}>
        <button>Action</button>
      </ThemeProvider>,
    );

    expect(container.firstElementChild?.getAttribute('data-theme')).toBe('light');
    expect(container.firstElementChild?.hasAttribute('style')).toBe(false);
  });

  it('emits a pre-hydration stored-theme bootstrap', () => {
    const { container } = render(<ThemeScript storageKey="custom-theme" />);

    expect(container.querySelector('script')?.textContent).toContain('custom-theme');
    expect(container.querySelector('script')?.textContent).toContain('dataset.theme');
    expect(container.querySelector('script')?.textContent).toContain('prefers-color-scheme: dark');
  });
});
