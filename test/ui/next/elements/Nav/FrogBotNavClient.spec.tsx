import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FrogBotNavClient } from '../../../../../packages/next/src/elements/Nav/index.client';

let hydrated = true;
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
    hydrated,
    navOpen: nav.navOpen,
    navRef: { current: null },
    setNavOpen: nav.setNavOpen,
    shouldAnimate: false,
  }),
  usePreferences: () => ({ getPreference: vi.fn(), setPreference }),
  useRouteTransition: () => ({ startRouteTransition: (fn: () => void) => fn() }),
}));

function Harness({
  initialNavOpen,
  initialOpen,
}: {
  initialNavOpen: boolean;
  initialOpen?: boolean;
}) {
  const [navOpen, setNavOpen] = useState(initialNavOpen);
  nav = { navOpen, setNavOpen };
  return (
    <FrogBotNavClient
      accountPath="/admin/account"
      homePath="/admin"
      initialOpen={initialOpen}
      items={[{ label: 'Users', path: '/admin/collections/users' }]}
      settingsPath="/admin/settings"
    />
  );
}

const shell = () => document.querySelector('.frogbot-nav-shell') as HTMLElement;
const backdrop = () => document.querySelector('.frogbot-nav-backdrop');

describe('FrogBotNavClient', () => {
  beforeEach(() => {
    hydrated = true;
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

  it('restores the desktop sidebar when Payload closes the nav', () => {
    render(<Harness initialNavOpen />);

    act(() => nav.setNavOpen(false));

    expect(shell().dataset.navState).toBe('desktop-nav-open');
    expect(nav.navOpen).toBe(true);
    expect(screen.getByRole('button', { name: 'Close sidebar' })).toBeTruthy();
    expect(setPreference).not.toHaveBeenCalled();
  });

  it('keeps a manual desktop collapse when Payload reopens the nav', () => {
    render(<Harness initialNavOpen />);
    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));

    act(() => nav.setNavOpen(true));

    expect(shell().dataset.navState).toBe('desktop-nav-closed');
    expect(nav.navOpen).toBe(false);
  });

  it('starts open on desktop when there is no saved preference', () => {
    hydrated = false;

    render(<Harness initialNavOpen />);

    expect(shell().dataset.navState).toBe('desktop-nav-open');
  });

  it('seeds from Payload state when remounted after hydration', () => {
    render(<Harness initialNavOpen={false} initialOpen />);

    expect(shell().dataset.navState).toBe('desktop-nav-closed');
    expect(nav.navOpen).toBe(false);
  });

  it('leaves Payload state alone until Payload is hydrated', () => {
    hydrated = false;

    render(<Harness initialNavOpen={false} initialOpen />);

    expect(nav.navOpen).toBe(false);
  });

  it('closing the mobile drawer with its close button does not save the preference', async () => {
    isMobile = true;
    render(<Harness initialNavOpen={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Close sidebar' }));

    expect(shell().dataset.navState).toBe('mobile-nav-closed');
    expect(setPreference).not.toHaveBeenCalled();
  });

  it('shows the last desktop choice after resizing from mobile', async () => {
    const { rerender } = render(<Harness initialNavOpen />);

    isMobile = true;
    act(() => rerender(<Harness initialNavOpen />));
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close sidebar' }));

    isMobile = false;
    act(() => rerender(<Harness initialNavOpen />));

    expect(shell().dataset.navState).toBe('desktop-nav-open');
    expect(nav.navOpen).toBe(true);
  });

  it('shows the collapsed desktop choice after resizing from an open mobile drawer', () => {
    const { rerender } = render(<Harness initialNavOpen />);
    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));

    isMobile = true;
    act(() => rerender(<Harness initialNavOpen />));
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    isMobile = false;
    act(() => rerender(<Harness initialNavOpen />));

    expect(shell().dataset.navState).toBe('desktop-nav-closed');
    expect(nav.navOpen).toBe(false);
    expect(backdrop()).toBeNull();
  });
});
