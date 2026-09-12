import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FrogbotNavClient } from '../../../../../packages/next/src/elements/Nav/index.client';

let isMobile = false;
let pathname = '/admin';
const setPreference = vi.fn();
let nav: { navOpen: boolean; setNavOpen: (open: boolean) => void };

vi.mock('@frogbotai/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@frogbotai/ui')>()),
  useIsMobile: () => isMobile,
}));

vi.mock('next/navigation.js', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@payloadcms/ui', () => ({
  useNav: () => ({
    hydrated: true,
    navOpen: nav.navOpen,
    navRef: { current: null },
    setNavOpen: nav.setNavOpen,
    shouldAnimate: false,
  }),
  usePreferences: () => ({ getPreference: vi.fn(), setPreference }),
  useRouteTransition: () => ({ startRouteTransition: (fn: () => void) => fn() }),
}));

function Harness({ initialNavOpen }: { initialNavOpen: boolean }) {
  const [navOpen, setNavOpen] = useState(initialNavOpen);
  nav = { navOpen, setNavOpen };
  return (
    <FrogbotNavClient
      accountPath="/admin/account"
      homePath="/admin"
      items={[{ label: 'Users', path: '/admin/collections/users' }]}
      settingsPath="/admin/settings"
    />
  );
}

const shell = () => document.querySelector('.frogbot-nav-shell') as HTMLElement;
const backdrop = () => document.querySelector('.frogbot-nav-backdrop');

describe('FrogbotNavClient', () => {
  beforeEach(() => {
    isMobile = false;
    pathname = '/admin';
    setPreference.mockReset();
  });

  it('does not reuse Payload nav classes on the shell', () => {
    render(<Harness initialNavOpen />);
    expect(shell().className).toBe('frogbot-nav-shell');
  });

  it('exposes desktop-nav-open and desktop-nav-closed on desktop', () => {
    render(<Harness initialNavOpen />);
    expect(shell().dataset.navState).toBe('desktop-nav-open');

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
    expect(shell().dataset.navState).toBe('desktop-nav-closed');
    expect(setPreference).toHaveBeenCalledWith('nav', { open: false }, true);
    expect(backdrop()).toBeNull();
  });

  it('starts closed on mobile and opens as a drawer with a backdrop', () => {
    isMobile = true;
    render(<Harness initialNavOpen />);
    expect(shell().dataset.navState).toBe('mobile-nav-closed');
    expect(backdrop()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(shell().dataset.navState).toBe('mobile-nav-open');
    expect(backdrop()).not.toBeNull();
  });

  it('closes the drawer from the backdrop, Escape, and navigation', () => {
    isMobile = true;
    const { rerender } = render(<Harness initialNavOpen={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(backdrop()!);
    expect(shell().dataset.navState).toBe('mobile-nav-closed');

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(shell().dataset.navState).toBe('mobile-nav-closed');

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(shell().dataset.navState).toBe('mobile-nav-open');
    pathname = '/admin/collections/users';
    act(() => rerender(<Harness initialNavOpen={false} />));
    expect(shell().dataset.navState).toBe('mobile-nav-closed');
  });

  it('marks the shell hydrated only when Payload reports hydration', () => {
    render(<Harness initialNavOpen />);
    expect(shell().dataset.navHydrated).toBe('true');
  });
});
