import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MessageActions } from '../../../../packages/ui/src/chat/message-actions';
import { MessageEditor } from '../../../../packages/ui/src/chat/message-editor';

describe('message controls', () => {
  it('renders the message actions BEM inventory', () => {
    render(<MessageActions text="Answer" onRegenerate={() => {}} onEdit={() => {}} />);

    expect(screen.getByLabelText('Message actions').className).toBe('fb-message-actions');
    expect(screen.getAllByRole('button').map(({ className }) => className)).toEqual([
      'fb-message-actions__button fb-slide-up-1',
      'fb-message-actions__button fb-slide-up-1',
      'fb-message-actions__button fb-slide-up-1',
    ]);
  });

  it('delegates copy, regenerate, and edit actions', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const regenerate = vi.fn();
    const edit = vi.fn();
    render(<MessageActions text="Answer" onRegenerate={regenerate} onEdit={edit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(writeText).toHaveBeenCalledWith('Answer');
    expect(regenerate).toHaveBeenCalledOnce();
    expect(edit).toHaveBeenCalledOnce();
  });

  it('places the timestamp before user actions and after assistant actions', () => {
    const timestamp = new Date(2026, 0, 12, 18, 58);
    const { container: userActions } = render(
      <MessageActions text="Question" timestamp={timestamp} timestampPlacement="start" />,
    );
    const { container: assistantActions } = render(
      <MessageActions text="Answer" timestamp={timestamp} timestampPlacement="end" />,
    );

    const children = (container: HTMLElement) =>
      Array.from(container.querySelector('.fb-message-actions')!.children).map(
        (child) => child.tagName,
      );
    expect(children(userActions)[0]).toBe('TIME');
    expect(children(assistantActions).at(-1)).toBe('TIME');
    expect(screen.getAllByText('Jan 12 6:58 PM')).toHaveLength(2);
  });

  it('edits and resubmits without owning chat state', () => {
    const submit = vi.fn();
    render(<MessageEditor initialValue="Original" onSubmit={submit} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit message' }), {
      target: { value: 'Revised' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(submit).toHaveBeenCalledWith('Revised');
  });
});
