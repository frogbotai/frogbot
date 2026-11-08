import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SettingsNav } from '../../../../../packages/ui/src/admin/elements/SettingsNav/index.client';
import { NavAdapterProvider } from '../../../../../packages/ui/src/nav/adapter';

const base = {
  accountHref: '/admin/account',
  backHref: '/admin',
  items: [{ href: '/admin/settings/collections', icon: null, label: 'Collections' }],
};

describe('SettingsNav', () => {
  it('opens the account menu with its slots and Log out from Account', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();

    render(
      <NavAdapterProvider navigate={navigate} pathname="/admin/account">
        <SettingsNav
          {...base}
          afterAccountMenu={<div role="menuitem">After</div>}
          beforeAccountMenu={<div role="menuitem">Before</div>}
          logoutPath="/admin/logout"
        />
      </NavAdapterProvider>,
    );

    const account = screen.getByRole('button', { name: 'Account' });

    expect(account.getAttribute('aria-current')).toBe('page');

    await user.click(account);

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Account',
      'Before',
      'After',
      'Log out',
    ]);

    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));

    expect(navigate).toHaveBeenCalledWith('/admin/logout');
  });

  it('renders a logout override in place of Log out', async () => {
    const user = userEvent.setup();

    render(
      <NavAdapterProvider pathname="/admin/settings/collections">
        <SettingsNav
          {...base}
          logout={<a role="menuitem">Sign out</a>}
          logoutPath="/admin/logout"
        />
      </NavAdapterProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Account' }));

    expect(screen.getByRole('menuitem', { name: 'Sign out' })).not.toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Log out' })).toBeNull();
  });
});
