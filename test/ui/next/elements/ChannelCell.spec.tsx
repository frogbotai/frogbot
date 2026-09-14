import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChannelCell } from '../../../../packages/next/src/elements/ChannelCell/index.client.js';

describe('ChannelCell', () => {
  it('renders a channel badge', () => {
    render(<ChannelCell cellData="slack" />);

    expect(screen.getByText('slack').className).toBe('channel-cell');
  });

  it('renders nothing for an ordinary chat', () => {
    const { container } = render(<ChannelCell cellData={null} />);

    expect(container.childElementCount).toBe(0);
  });
});
