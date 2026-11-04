import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ToolApproval } from '../../../../packages/ui/src/chat/tool-approval';

describe('ToolApproval', () => {
  it('shows the reason and approves', async () => {
    const onAnswer = vi.fn();

    render(<ToolApproval reason="Refund $5000" onAnswer={onAnswer} />);

    expect(screen.getByText('Refund $5000')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ approved: true }));
  });

  it('denies with a typed reason', async () => {
    const onAnswer = vi.fn();

    render(<ToolApproval onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    fireEvent.change(screen.getByLabelText('Reason for denying'), {
      target: { value: '  Too much  ' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith({ approved: false, reason: 'Too much' }),
    );
  });

  it('denies without a reason, or goes back to Approve', async () => {
    const onAnswer = vi.fn();

    render(<ToolApproval onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(screen.queryByLabelText('Reason for denying')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ approved: false }));
  });

  it('needs a reason to deny when the adapter cannot end the turn', () => {
    render(<ToolApproval reasonRequired onAnswer={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    expect(screen.getByRole('button', { name: 'Deny' })).toHaveProperty('disabled', true);
  });
});
