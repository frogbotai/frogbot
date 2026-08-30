import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ArtifactProvider } from '../../../../packages/ui/src/chat/artifact';
import { MessagePart } from '../../../../packages/ui/src/chat/message-part';

describe('data and boundary parts', () => {
  it('renders data by default or through a consumer renderer', () => {
    const part = { type: 'data-weather' as const, data: { temperature: 72 } };
    const { rerender } = render(<MessagePart part={part} />);
    expect(screen.getByText(/"temperature": 72/).className).toBe('fb-data-part');
    rerender(
      <MessagePart
        part={part}
        renderData={({ data }) => (
          <span>{String((data as { temperature: number }).temperature)} degrees</span>
        )}
      />,
    );
    expect(screen.getByText('72 degrees')).toBeTruthy();
  });

  it('does not render step boundaries', () => {
    const { container } = render(<MessagePart part={{ type: 'step-start' }} />);
    expect(container.innerHTML).toBe('');
  });

  it('streams custom-rendered data into artifacts', () => {
    const onStreamPart = vi.fn();
    render(
      <ArtifactProvider registry={[{ kind: 'weather', render: () => null, onStreamPart }]}>
        <MessagePart
          part={{ type: 'data-weather', data: 72 }}
          renderData={() => <span>Custom</span>}
        />
      </ArtifactProvider>,
    );
    expect(screen.getByText('Custom')).toBeTruthy();
    expect(onStreamPart).toHaveBeenCalledOnce();
  });
});
