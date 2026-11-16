import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UserAvatar, userInitials } from '../../../../packages/ui/src/components/user-avatar.js';

describe('UserAvatar', () => {
  it('shows initials from the name, else the email', () => {
    expect(userInitials('Colby Gilbert')).toBe('CG');
    expect(userInitials('  ana  ')).toBe('A');
    expect(userInitials('', 'ro@example.com')).toBe('R');
    expect(userInitials(undefined)).toBe('?');
  });

  it('renders initials at the given size when there is no picture', async () => {
    render(<UserAvatar email="sam@example.com" name="Sam Lee" size={20} />);

    const fallback = await screen.findByText('SL');

    const root = fallback.closest<HTMLElement>('.fb-user-avatar');

    expect(root?.style.width).toBe('20px');
    expect(root?.style.height).toBe('20px');
  });
});
