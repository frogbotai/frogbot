import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NavAdapterProvider } from '../../../../packages/ui/src/nav/adapter';
import { NavSection as Section } from '../../../../packages/ui/src/nav/NavSection';

const getPreference = vi.fn();
const setPreference = vi.fn();

function NavSection(props: React.ComponentProps<typeof Section>) {
  return (
    <NavAdapterProvider preferences={{ get: getPreference, set: setPreference }}>
      <Section {...props} />
    </NavAdapterProvider>
  );
}

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

  it('keeps a toggle while the host re-renders with new preferences', async () => {
    getPreference.mockResolvedValue({ collapsed: false });

    const { rerender } = render(
      <NavSection id="recents" title="Recents">
        <span>Latest thread</span>
      </NavSection>,
    );

    const toggle = screen.getByRole<HTMLButtonElement>('button', { name: 'Recents' });
    await waitFor(() => expect(toggle.disabled).toBe(false));

    fireEvent.click(toggle);

    rerender(
      <NavSection id="recents" title="Recents">
        <span>Latest thread</span>
      </NavSection>,
    );

    await Promise.resolve();

    expect(getPreference).toHaveBeenCalledTimes(1);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders an accessible scroll region', async () => {
    getPreference.mockResolvedValue(null);
    const { container } = render(
      <NavSection id="recents" title="Recents">
        <span>Latest thread</span>
      </NavSection>,
    );

    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Recents' }).disabled).toBe(
        false,
      ),
    );

    expect(container.querySelector('.fb-nav-section__scroll')?.textContent).toBe('Latest thread');
  });
});
