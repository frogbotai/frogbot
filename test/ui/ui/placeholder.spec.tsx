import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Placeholder } from '../../../packages/ui/src/placeholder';

describe('Placeholder', () => {
  it('renders', () => {
    render(<Placeholder />);

    expect(screen.getByText('UI preview')).toBeTruthy();
  });
});
