import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NavSection } from './NavSection';

const getPreference = vi.fn();
const setPreference = vi.fn();

vi.mock('@payloadcms/ui', () => ({
  AnimateHeight: ({ children, height, id }: { children: React.ReactNode; height: number | string; id: string }) => (
    <div aria-hidden={height === 0} id={id}>
      {children}
    </div>
  ),
  usePreferences: () => ({ getPreference, setPreference }),
}));

describe('NavSection', () => {
  beforeEach(() => {
    getPreference.mockReset();
    setPreference.mockReset();
  });

  it('restores and persists its collapsed state', async () => {
    getPreference.mockResolvedValue({ collapsed: true });
    render(
      <NavSection id="collections" title="Collections">
        <span>Users</span>
      </NavSection>,
    );

    const toggle = screen.getByRole('button', { name: 'Collections' });
    await waitFor(() => expect(toggle.getAttribute('aria-expanded')).toBe('false'));
    expect(getPreference).toHaveBeenCalledWith('frogbot-nav-section:collections');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(setPreference).toHaveBeenCalledWith('frogbot-nav-section:collections', {
      collapsed: false,
    });
  });

  it('renders an accessible scroll region', async () => {
    getPreference.mockResolvedValue(null);
    const { container } = render(
      <NavSection id="recents" title="Recents">
        <span>Latest thread</span>
      </NavSection>,
    );

    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Recents' }).disabled).toBe(false),
    );
    expect(container.querySelector('.frogbot-nav-section__scroll')?.textContent).toBe(
      'Latest thread',
    );
  });
});
