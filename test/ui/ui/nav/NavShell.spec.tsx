import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NavAdapterProvider } from '../../../../packages/ui/src/nav/adapter';
import { NavShell } from '../../../../packages/ui/src/nav/NavShell';

let isMobile = false;

vi.mock('../../../../packages/ui/src/hooks/use-mobile.js', () => ({
  useIsMobile: () => isMobile,
}));

const shell = () => document.querySelector('.fb-nav-shell') as HTMLElement;

describe('NavShell', () => {
  beforeEach(() => {
    isMobile = false;
  });

  it('starts open on desktop without a host, and saves a collapse to the preferences', () => {
    const set = vi.fn();

    render(
      <NavAdapterProvider preferences={{ get: () => Promise.resolve(undefined), set }}>
        <NavShell homePath="/" navItems={[{ label: 'Providers', path: '/providers' }]} />
      </NavAdapterProvider>,
    );

    expect(shell().dataset.navState).toBe('desktop-nav-open');
    expect(shell().dataset.navHydrated).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));

    expect(shell().dataset.navState).toBe('desktop-nav-closed');
    expect(set).toHaveBeenCalledWith('nav', { open: false });
  });

  it('is a drawer on mobile that opens from its toggle and closes with Escape and the backdrop', () => {
    isMobile = true;
    render(<NavShell homePath="/" />);

    expect(shell().dataset.navState).toBe('mobile-nav-closed');

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(shell().dataset.navState).toBe('mobile-nav-open');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(shell().dataset.navState).toBe('mobile-nav-closed');

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(document.querySelector('.fb-nav-backdrop')!);

    expect(shell().dataset.navState).toBe('mobile-nav-closed');
  });

  it("navigates through the adapter and marks the adapter's path active", () => {
    const navigate = vi.fn();

    render(
      <NavAdapterProvider navigate={navigate} pathname="/providers">
        <NavShell homePath="/" navItems={[{ label: 'Providers', path: '/providers' }]} />
      </NavAdapterProvider>,
    );

    const item = screen.getByRole('button', { name: 'Providers' });

    expect(item.className).toContain('fb-app-sidebar__item--active');

    fireEvent.click(item);

    expect(navigate).toHaveBeenCalledWith('/providers');
  });

  it('has no account menu without an account path', () => {
    render(<NavShell homePath="/" />);

    expect(screen.queryByRole('button', { name: 'Account' })).toBeNull();
  });
});
