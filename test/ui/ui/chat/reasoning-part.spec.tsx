import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReasoningPart } from '../../../../packages/ui/src/chat/reasoning-part';

describe('ReasoningPart', () => {
  it('opens while streaming and collapses when done', () => {
    const { container, rerender } = render(
      <ReasoningPart part={{ type: 'reasoning', text: 'Work', state: 'streaming' }} />,
    );
    const details = container.querySelector('details');
    expect(details?.className).toBe('fb-reasoning-part');
    expect(details?.open).toBe(true);
    expect(screen.getByText('Thinking...').className).toBe('fb-reasoning-part__summary');
    expect(screen.getByText('Work').parentElement?.className).toBe('fb-reasoning-part__content');
    rerender(<ReasoningPart part={{ type: 'reasoning', text: 'Work', state: 'done' }} />);
    expect(details?.open).toBe(false);
  });
});
