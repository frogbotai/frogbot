import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(container.querySelectorAll('.frogbot-admin-sidebar__icon')).toHaveLength(3);
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
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
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
