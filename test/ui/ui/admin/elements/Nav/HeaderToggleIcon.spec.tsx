import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { HeaderToggleIcon } from '../../../../../../packages/ui/src/admin/elements/Nav/HeaderToggleIcon';

const payloadToggle = () => {
  const button = document.createElement('button');
  button.className = 'app-header__sidebar-toggle';
  button.innerHTML = '<span class="btn__icon"><svg class="icon icon--sidebar"></svg></span>';
  document.body.append(button);

  return button;
};

describe('HeaderToggleIcon', () => {
  afterEach(() => {
    document.querySelectorAll('.app-header__sidebar-toggle').forEach((node) => node.remove());
  });

  it("draws the sidebar icon inside Payload's header toggle", () => {
    const button = payloadToggle();

    render(<HeaderToggleIcon pathname="/admin" />);

    expect(
      button.querySelector('.btn__icon > .lucide-sidebar-left-icon.fb-sidebar-toggle-icon'),
    ).not.toBeNull();
  });

  it('finds a header toggle mounted after a navigation', () => {
    const { rerender } = render(<HeaderToggleIcon pathname="/admin" />);

    expect(document.querySelector('.lucide-sidebar-left-icon')).toBeNull();

    const button = payloadToggle();

    rerender(<HeaderToggleIcon pathname="/admin/collections/users" />);

    expect(button.querySelector('.lucide-sidebar-left-icon')).not.toBeNull();
  });
});
