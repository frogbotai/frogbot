import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AccountMenu } from '../../../../../packages/next/src/elements/Nav/AccountMenu';

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
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
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
      <AccountMenu
        {...props}
        email="colby@frogbot.ai"
        name="Colby Gilbert"
        onNavigate={onNavigate}
      >
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
