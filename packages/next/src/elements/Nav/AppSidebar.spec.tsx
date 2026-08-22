import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppSidebar } from './AppSidebar';

const props = {
  currentPath: '/admin/collections/users',
  groups: [
    {
      items: [{ label: 'Users', path: '/admin/collections/users' }],
      label: 'Content',
    },
  ],
  homePath: '/admin',
  onNavigate: vi.fn(),
  onToggle: vi.fn(),
};

describe('AppSidebar', () => {
  it('marks the active nav item', () => {
    render(<AppSidebar {...props} open />);
    expect(screen.getByRole('button', { name: 'Users' }).className).toContain(
      'frogbot-admin-sidebar__item--active',
    );
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
    expect(document.querySelector('.frogbot-admin-sidebar__tooltip')).toBeNull();
  });

  it('renders no Tailwind utility classes', () => {
    const { container } = render(<AppSidebar {...props} open />);
    const classNames = [...container.querySelectorAll('[class]')].flatMap((element) =>
      element.getAttribute('class')!.split(/\s+/),
    );
    expect(
      classNames.filter(
        (name) => name && !name.startsWith('frogbot-admin-sidebar') && !name.startsWith('lucide'),
      ),
    ).toEqual([]);
  });
});
