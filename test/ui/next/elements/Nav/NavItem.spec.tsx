import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NavItem } from '../../../../../packages/next/src/elements/Nav/NavItem';

vi.mock('@payloadcms/ui', () => ({
  Link: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

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
});
