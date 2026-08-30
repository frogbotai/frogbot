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
});
