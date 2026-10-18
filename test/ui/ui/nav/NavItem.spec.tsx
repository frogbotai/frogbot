import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NavAdapterProvider } from '../../../../packages/ui/src/nav/adapter';
import { NavItem } from '../../../../packages/ui/src/nav/NavItem';

function Icon(props: React.ComponentProps<'svg'>) {
  return <svg data-testid="icon" {...props} />;
}

describe('NavItem', () => {
  it('renders its icon, label, and path', () => {
    render(<NavItem icon={Icon} label="Agents" path="/admin/collections/agents" />);

    expect(screen.getByRole('link', { name: 'Agents' }).getAttribute('href')).toBe(
      '/admin/collections/agents',
    );
    expect(screen.getByTestId('icon')).not.toBeNull();
  });

  it('marks an active item', () => {
    render(<NavItem active icon={Icon} label="Agents" path="/admin/collections/agents" />);

    expect(screen.getByRole('link', { name: 'Agents' }).getAttribute('aria-current')).toBe('page');
  });

  it("renders through the adapter's Link", () => {
    const Link = vi.fn(({ children, ...props }: React.ComponentProps<'a'>) => (
      <a data-router="" {...props}>
        {children}
      </a>
    ));

    render(
      <NavAdapterProvider Link={Link}>
        <NavItem label="Agents" path="/admin/collections/agents" />
      </NavAdapterProvider>,
    );

    expect(screen.getByRole('link', { name: 'Agents' }).hasAttribute('data-router')).toBe(true);
    expect(Link).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/admin/collections/agents' }),
      undefined,
    );
  });
});
