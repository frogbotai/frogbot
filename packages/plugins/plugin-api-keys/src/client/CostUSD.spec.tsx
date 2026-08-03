import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@payloadcms/ui', () => ({
  FieldLabel: () => null,
  useField: () => ({ value: 0 }),
}));

const { CostUSDCell, formatCostUSD } = await import('./CostUSD.js');

describe('USD cost formatting', () => {
  it('formats dollars with sub-cent precision', () => {
    expect(formatCostUSD(12.5)).toBe('$12.50');
    expect(formatCostUSD(0.000322618)).toBe('$0.000323');
  });

  it('renders formatted list cells', () => {
    render(<CostUSDCell cellData={1.2345678} />);
    expect(screen.getByText('$1.234568')).toBeTruthy();
  });
});
