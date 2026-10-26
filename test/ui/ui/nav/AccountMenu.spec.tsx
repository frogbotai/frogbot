import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AccountMenu, AccountMenuItem } from '../../../../packages/ui/src/nav/AccountMenu';

const props = {
  accountPath: '/admin/account',
  onNavigate: vi.fn(),
  settingsPath: '/admin/settings',
};

describe('AccountMenu', () => {
  it('opens from its trigger and navigates default items', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <AccountMenu {...props} logoutPath="/admin/logout" onNavigate={onNavigate}>
        <button type="button">Open account</button>
      </AccountMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Open account' }));

    expect(screen.getAllByRole('menuitem').map((item: HTMLElement) => item.textContent)).toEqual([
      'Account',
      'Settings',
      'Log out',
    ]);

    await user.click(screen.getByRole('menuitem', { name: 'Account' }));

    expect(onNavigate).toHaveBeenCalledWith('/admin/account');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('navigates to the account page from the identity header', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <AccountMenu {...props} email="colby@frogbot.ai" name="Colby Gilbert" onNavigate={onNavigate}>
        <button type="button">Open account</button>
      </AccountMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Open account' }));
    await user.click(screen.getByRole('menuitem', { name: /Colby Gilbert/ }));

    expect(onNavigate).toHaveBeenCalledWith('/admin/account');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders identity, avatar, slots, and a logout override', async () => {
    const user = userEvent.setup();

    render(
      <AccountMenu
        {...props}
        afterMenuItems={<span>Usage remaining</span>}
        avatar={<svg aria-label="Avatar" role="img" />}
        beforeMenuItems={<span>Show pet</span>}
        email="colby@frogbot.ai"
        logout={<a href="/custom-logout">Sign out</a>}
        name="Colby Gilbert"
      >
        <button type="button">Open account</button>
      </AccountMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Open account' }));

    expect(screen.getByText('Colby Gilbert')).toBeTruthy();
    expect(screen.getByText('colby@frogbot.ai')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Avatar' })).toBeTruthy();
    expect(screen.getByText('Show pet')).toBeTruthy();
    expect(screen.getByText('Usage remaining')).toBeTruthy();
    expect(screen.getByText('Sign out').getAttribute('href')).toBe('/custom-logout');
    expect(screen.queryByRole('menuitem', { name: 'Log out' })).toBeNull();
  });

  it('renders a lazy item icon as a node and creates a component icon', async () => {
    const user = userEvent.setup();
    const lazyIcon = {
      $$typeof: Symbol.for('react.lazy'),
      _init: (payload: ReactNode) => payload,
      _payload: <svg data-testid="lazy-icon" />,
    } as unknown as ReactNode;

    const ComponentIcon = (iconProps: { className?: string; size?: number }) => (
      <svg data-testid="component-icon" {...iconProps} />
    );

    render(
      <AccountMenu
        {...props}
        beforeMenuItems={
          <>
            <AccountMenuItem icon={lazyIcon} label="Lazy" onSelect={vi.fn()} />
            <AccountMenuItem icon={ComponentIcon} label="Component" onSelect={vi.fn()} />
          </>
        }
      >
        <button type="button">Open account</button>
      </AccountMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Open account' }));

    expect(screen.getByTestId('lazy-icon').parentElement?.className).toBe(
      'fb-account-menu__item-icon',
    );
    expect(screen.getByTestId('component-icon').getAttribute('class')).toBe(
      'fb-account-menu__item-icon',
    );
    expect(screen.getByTestId('component-icon').getAttribute('size')).toBe('20');
  });

  it('omits the logout row without a path or override', async () => {
    const user = userEvent.setup();

    render(
      <AccountMenu {...props}>
        <button type="button">Open account</button>
      </AccountMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Open account' }));

    expect(screen.queryByText('Log out')).toBeNull();
  });
});
