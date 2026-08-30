import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppSidebar } from '../../../../../packages/next/src/elements/Nav/AppSidebar';

const props = {
  accountIcon: <span />,
  accountPath: '/admin/account',
  currentPath: '/admin/collections/users',
  homePath: '/admin',
  navItems: [{ label: 'Users', path: '/admin/collections/users' }],
  onNavigate: vi.fn(),
  onToggle: vi.fn(),
  settingsPath: '/admin/settings',
};

describe('AppSidebar', () => {
  it('marks the active nav item', () => {
    render(<AppSidebar {...props} open />);
    expect(screen.getByRole('button', { name: 'Users' }).className).toContain(
      'frogbot-admin-sidebar__item--active',
    );
  });

  it('renders built-in and fallback collection icons', () => {
    const { container } = render(
      <AppSidebar
        {...props}
        navItems={[
          { icon: 'robot', label: 'Robot', path: '/robot' },
          { label: 'Folder', path: '/folder' },
        ]}
        open
      />,
    );
    expect(container.querySelectorAll('.frogbot-admin-sidebar__icon')).toHaveLength(2);
  });

  it('opens when a collapsed sidebar is clicked anywhere', () => {
    const onToggle = vi.fn();
    render(<AppSidebar {...props} onToggle={onToggle} open={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('navigates home from the logo only while open', () => {
    const onNavigate = vi.fn();
    render(<AppSidebar {...props} onNavigate={onNavigate} open />);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(onNavigate).toHaveBeenCalledWith('/admin');
  });

  it('shows a label tooltip on hover while collapsed', () => {
    render(<AppSidebar {...props} open={false} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Users' }));
    const tooltip = document.querySelector('.frogbot-admin-sidebar__tooltip');
    expect(tooltip?.querySelector('.tooltip-content')?.textContent).toBe('Users');
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Users' }));
    expect(document.querySelector('.frogbot-admin-sidebar__tooltip')).toBeNull();
  });

  it('shows no tooltip while open', () => {
    render(<AppSidebar {...props} open />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Users' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Home' }));
    expect(document.querySelector('.frogbot-admin-sidebar__tooltip')).toBeNull();
  });

  it('renders no Tailwind utility classes', () => {
    const { container } = render(<AppSidebar {...props} open />);
    const classNames = [...container.querySelectorAll('[class]')].flatMap((element) =>
      element.getAttribute('class')!.split(/\s+/),
    );
    expect(
      classNames.filter(
        (name) =>
          name &&
          !name.startsWith('frogbot-admin-sidebar') &&
          !name.startsWith('fb-') &&
          !name.startsWith('lucide'),
      ),
    ).toEqual([]);
  });

  it('renders only the account control in the bottom rail', () => {
    render(<AppSidebar {...props} open />);
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  });

  it('opens the account menu and navigates from its items', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<AppSidebar {...props} logoutPath="/admin/logout" onNavigate={onNavigate} open />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(onNavigate).toHaveBeenCalledWith('/admin/settings');
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(onNavigate).toHaveBeenCalledWith('/admin/logout');
  });

  it('shows identity and account menu slots in order', async () => {
    const user = userEvent.setup();
    render(
      <AppSidebar
        {...props}
        accountEmail="colby@frogbot.ai"
        accountName="Colby Gilbert"
        afterAccountMenu={<span>After menu</span>}
        beforeAccountMenu={<span>Before menu</span>}
        open
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Account' }));
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain('Colby Gilbert');
    expect(menu.textContent).toContain('colby@frogbot.ai');
    const order = [...menu.children]
      .map((node) => node.textContent)
      .filter((text) => ['After menu', 'Before menu', 'Settings'].includes(text ?? ''));
    expect(order).toEqual(['Before menu', 'Settings', 'After menu']);
  });

  it('opens the account menu without expanding a collapsed sidebar', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<AppSidebar {...props} onToggle={onToggle} open={false} />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(onToggle).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders sections, shell slots, and bottom rail items', () => {
    const { rerender } = render(
      <AppSidebar
        {...props}
        afterBottomRail={<span>After bottom</span>}
        beforeBottomRail={<span>Before bottom</span>}
        beforeSidebarClose={<span>Header action</span>}
        open
        sections={<span>Sections</span>}
      />,
    );
    expect(screen.getByText('Sections')).toBeTruthy();
    expect(screen.getByText('Header action')).toBeTruthy();
    expect(screen.getByText('Before bottom')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy();
    expect(screen.getByText('After bottom')).toBeTruthy();

    const headerAction = screen.getByText('Header action');
    const close = screen.getByRole('button', { name: 'Close sidebar' });
    expect(headerAction.nextElementSibling).toBe(close);

    rerender(
      <AppSidebar
        {...props}
        beforeSidebarClose={<span>Header action</span>}
        open={false}
        sections={<span>Sections</span>}
      />,
    );
    expect(screen.queryByText('Header action')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close sidebar' })).toBeNull();
    expect(screen.queryByText('Sections')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy();
  });
});
