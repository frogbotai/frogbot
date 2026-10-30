import { render, screen } from '@testing-library/react';
import type { ReasoningUIPart } from 'ai';
import { describe, expect, it } from 'vitest';

import { ReasoningPart } from '../../../../packages/ui/src/chat/reasoning-part';

const part = (state: ReasoningUIPart['state']): ReasoningUIPart => ({
  type: 'reasoning',
  text: 'Work',
  state,
});

describe('ReasoningPart', () => {
  it('starts closed, with a Thinking shimmer and then Thought', () => {
    const { container, rerender } = render(<ReasoningPart part={part('streaming')} />);

    const details = container.querySelector('details');

    expect(details?.className).toBe('fb-reasoning-part');
    expect(details?.open).toBe(false);
    expect(screen.getByText('Thinking').className).toBe('fb-thinking');
    expect(screen.getByText('Work').parentElement?.className).toBe('fb-reasoning-part__content');

    rerender(<ReasoningPart part={part('done')} />);

    expect(details?.open).toBe(false);
    expect(screen.queryByText('Thinking')).toBeNull();
    expect(screen.getByText('Thought').className).toBe('fb-reasoning-part__summary');
  });

  it('keeps the open or closed state the user chose when the stream ends', () => {
    const { container, rerender } = render(<ReasoningPart part={part('streaming')} />);

    const details = container.querySelector('details')!;

    details.open = true;
    rerender(<ReasoningPart part={part('done')} />);
    rerender(<ReasoningPart part={part('done')} />);

    expect(details.open).toBe(true);

    details.open = false;
    rerender(<ReasoningPart part={{ ...part('done'), text: 'Work, revised' }} />);

    expect(details.open).toBe(false);
  });
});
