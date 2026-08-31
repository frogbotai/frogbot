import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatRowActions } from '../../../../packages/ui/src/chat/chat-row-actions';

describe('ChatRowActions', () => {
  it('opens the hover trigger menu and selects both actions', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <ChatRowActions onDelete={onDelete} onRename={onRename}>
        <div>Conversation</div>
      </ChatRowActions>,
    );

    await user.click(screen.getByRole('button', { name: 'Chat actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Chat actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(onRename).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('opens the same actions from the row context menu', async () => {
    const onRename = vi.fn();
    render(
      <ChatRowActions onDelete={vi.fn()} onRename={onRename}>
        <div>Conversation</div>
      </ChatRowActions>,
    );

    fireEvent.contextMenu(screen.getByText('Conversation'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    expect(onRename).toHaveBeenCalledOnce();
  });

  it('marks the row while either menu is open', async () => {
    const user = userEvent.setup();
    render(
      <ChatRowActions onDelete={vi.fn()} onRename={vi.fn()}>
        <div className="row">Conversation</div>
      </ChatRowActions>,
    );

    const rowClasses = () => screen.getByText('Conversation').closest('.row')?.classList;
    expect(rowClasses()?.contains('fb-chat-row-actions__row')).toBe(true);
    expect(rowClasses()?.contains('fb-slide-right-1')).toBe(true);
    expect(rowClasses()?.contains('fb-slide-active')).toBe(false);
    expect(rowClasses()?.contains('fb-chat-row-actions__row--open')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Chat actions' }));
    expect(rowClasses()?.contains('fb-chat-row-actions__row--open')).toBe(true);
    expect(rowClasses()?.contains('fb-slide-active')).toBe(true);

    await user.keyboard('{Escape}');
    expect(rowClasses()?.contains('fb-chat-row-actions__row--open')).toBe(false);

    fireEvent.contextMenu(screen.getByText('Conversation'));
    await screen.findByRole('menuitem', { name: 'Rename' });
    expect(rowClasses()?.contains('fb-chat-row-actions__row--open')).toBe(true);
  });
});
