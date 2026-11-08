import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { NavAdapterProvider } from '../../../../packages/ui/src/nav/adapter';
import { AppSidebar } from '../../../../packages/ui/src/nav/AppSidebar';
import { NavItem } from '../../../../packages/ui/src/nav/NavItem';

const lazyNode = (node: ReactNode) =>
  ({
    $$typeof: Symbol.for('react.lazy'),
    _init: (payload: ReactNode) => payload,
    _payload: node,
  }) as unknown as ReactNode;

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
      'fb-app-sidebar__item--active',
    );
  });

  it('marks only the most specific link across the sidebar, sections included', () => {
    const navItems = [
      { label: 'Chats', path: '/admin/collections/chats' },
      { label: 'New chat', path: '/admin/collections/chats/create' },
    ];

    render(
      <AppSidebar
        {...props}
        currentPath="/admin/collections/chats/42"
        navItems={navItems}
        open
        sections={
          <NavAdapterProvider pathname="/admin/collections/chats/42">
            <NavItem label="Chat 42" path="/admin/collections/chats/42" />
            <NavItem label="Ideas" path="/admin/collections/ideas" />
          </NavAdapterProvider>
        }
      />,
    );

    expect(document.querySelector('.fb-app-sidebar__item--active')).toBeNull();
    expect(screen.getByRole('link', { name: 'Chat 42' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Ideas' }).getAttribute('aria-current')).toBeNull();
  });

  it('marks the most specific item, including on pages under it', () => {
    const navItems = [
      { label: 'Chats', path: '/admin/collections/chats' },
      { label: 'New chat', path: '/admin/collections/chats/create' },
    ];

    const activeLabels = () =>
      screen
        .getAllByRole('button')
        .filter(({ className }) => className.includes('fb-app-sidebar__item--active'))
        .map((button) => button.getAttribute('aria-label'));

    const { rerender } = render(
      <AppSidebar
        {...props}
        currentPath="/admin/collections/chats/create"
        navItems={navItems}
        open
      />,
    );

    expect(activeLabels()).toEqual(['New chat']);

    rerender(
      <AppSidebar {...props} currentPath="/admin/collections/chats/42" navItems={navItems} open />,
    );

    expect(activeLabels()).toEqual(['Chats']);

    rerender(
      <AppSidebar {...props} currentPath="/admin/collections/chats/" navItems={navItems} open />,
    );

    expect(activeLabels()).toEqual(['Chats']);
  });

  it('marks one item active when two items share a path', () => {
    render(
      <AppSidebar
        {...props}
        currentPath="/admin/collections/posts"
        navItems={[
          { label: 'My posts', path: '/admin/collections/posts' },
          { label: 'Users', path: '/admin/collections/users' },
          { label: 'Posts', path: '/admin/collections/posts' },
        ]}
        open
      />,
    );

    const active = screen
      .getAllByRole('button')
      .filter(({ className }) => className.includes('fb-app-sidebar__item--active'));

    expect(active.map((button) => button.getAttribute('aria-label'))).toEqual(['My posts']);
  });

  it('marks no nav item active when none matches, and the home item only on its exact path', () => {
    const { rerender } = render(
      <AppSidebar
        {...props}
        currentPath="/admin/elsewhere"
        navItems={[
          { label: 'Overview', path: '/admin' },
          { label: 'A', path: '/a' },
        ]}
        open
      />,
    );

    expect(document.querySelector('.fb-app-sidebar__item--active')).toBeNull();

    rerender(
      <AppSidebar
        {...props}
        currentPath="/admin"
        navItems={[
          { label: 'Overview', path: '/admin' },
          { label: 'A', path: '/a' },
        ]}
        open
      />,
    );

    expect(screen.getByRole('button', { name: 'Overview' }).className).toContain(
      'fb-app-sidebar__item--active',
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

    expect(container.querySelectorAll('.fb-app-sidebar__icon')).toHaveLength(2);
  });

  it('renders the key-round icon on a collapsed rail item', () => {
    render(
      <AppSidebar
        {...props}
        navItems={[{ icon: 'key-round', label: 'API Keys', path: '/admin/collections/api-keys' }]}
        open={false}
      />,
    );

    const icon = screen.getByRole('button', { name: 'API Keys' }).querySelector('svg');

    expect(icon?.getAttribute('class')).toContain('lucide-key-round-icon');
    expect(icon?.getAttribute('class')).not.toContain('lucide-folder-icon');
  });

  it('renders a lazy account icon instead of the folder fallback', () => {
    const sidebar = (
      <AppSidebar {...props} accountIcon={lazyNode(<img alt="avatar" />)} open={false} />
    );

    const html = renderToString(sidebar);
    const serverAccount = html.slice(html.indexOf('aria-label="Account"'));

    render(sidebar);
    const account = screen.getByRole('button', { name: 'Account' });

    expect(serverAccount).toContain('alt="avatar"');
    expect(serverAccount).not.toContain('lucide-folder-icon');
    expect(account.querySelector('img[alt="avatar"]')).not.toBeNull();
    expect(account.querySelector('.lucide-folder-icon')).toBeNull();
  });

  it('falls back to the folder icon only without an account icon', () => {
    render(<AppSidebar {...props} accountIcon={undefined} open={false} />);

    expect(
      screen.getByRole('button', { name: 'Account' }).querySelector('.lucide-folder-icon'),
    ).not.toBeNull();
  });

  it('renders a lazy nav item icon as a node', () => {
    const sidebar = (
      <AppSidebar
        {...props}
        navItems={[{ icon: lazyNode(<img alt="robot" />), label: 'Robot', path: '/robot' }]}
        open
      />
    );

    expect(renderToString(sidebar)).toContain('alt="robot"');

    render(sidebar);

    expect(
      screen.getByRole('button', { name: 'Robot' }).querySelector('img[alt="robot"]'),
    ).not.toBeNull();
  });

  it('opens when a collapsed sidebar is clicked anywhere', () => {
    const onToggle = vi.fn();
    render(<AppSidebar {...props} onToggle={onToggle} open={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('draws the same sidebar icon on the close button and on strip hover', () => {
    const { rerender } = render(<AppSidebar {...props} open />);

    expect(
      screen
        .getByRole('button', { name: 'Close sidebar' })
        .querySelector('.lucide-sidebar-left-icon.fb-sidebar-toggle-icon'),
    ).not.toBeNull();

    rerender(<AppSidebar {...props} open={false} />);
    fireEvent.mouseEnter(document.querySelector('.fb-app-sidebar')!);

    expect(
      screen
        .getByRole('button', { name: 'Open sidebar' })
        .querySelector('.lucide-sidebar-left-icon.fb-sidebar-toggle-icon'),
    ).not.toBeNull();
  });

  it('navigates home from the logo only while open', () => {
    const onNavigate = vi.fn();
    render(<AppSidebar {...props} onNavigate={onNavigate} open />);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    expect(onNavigate).toHaveBeenCalledWith('/admin');
  });

  it('shows a label tooltip while collapsed', async () => {
    render(<AppSidebar {...props} open={false} />);
    fireEvent.focus(screen.getByRole('button', { name: 'Users' }));

    expect((await screen.findByRole('tooltip')).textContent).toBe('Users');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows no tooltip while open', () => {
    render(<AppSidebar {...props} open />);
    fireEvent.focus(screen.getByRole('button', { name: 'Users' }));
    fireEvent.focus(screen.getByRole('button', { name: 'Home' }));

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders no Tailwind utility classes', () => {
    const { container } = render(<AppSidebar {...props} open />);
    const classNames = [...container.querySelectorAll('[class]')].flatMap((element) =>
      element.getAttribute('class')!.split(/\s+/),
    );

    expect(
      classNames.filter((name) => name && !name.startsWith('fb-') && !name.startsWith('lucide')),
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

  it('does not expand a collapsed sidebar from a bottom rail click', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <AppSidebar
        {...props}
        beforeBottomRail={<button type="button">Theme</button>}
        onToggle={onToggle}
        open={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Theme' }));

    expect(onToggle).not.toHaveBeenCalled();
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
