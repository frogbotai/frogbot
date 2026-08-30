import type { FrogBotSDK } from '@frogbotai/sdk';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RenameChatDialog } from '../../../../packages/ui/src/chat/rename-chat-dialog';

function makeSDK(suggestion: string | null = 'Night frogs') {
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ suggestion })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'chat-1', title: suggestion })));
  return { sdk: { request } as unknown as FrogBotSDK, request };
}

describe('RenameChatDialog', () => {
  it('selects the current title and accepts the automatic suggestion', async () => {
    const user = userEvent.setup();
    const { sdk } = makeSDK();
    render(
      <RenameChatDialog
        chatId="chat-1"
        chatsSlug="chats"
        onOpenChange={vi.fn()}
        open
        sdk={sdk}
        title="Current title"
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Chat title' }) as HTMLInputElement;
    await waitFor(() => expect(input.selectionStart).toBe(0));
    await user.click(await screen.findByRole('button', { name: 'Night frogs' }));
    expect(input.value).toBe('Night frogs');
  });

  it('saves a manual title and closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onRenamed = vi.fn();
    const { sdk, request } = makeSDK(null);
    render(
      <RenameChatDialog
        chatId="chat-1"
        chatsSlug="chats"
        onOpenChange={onOpenChange}
        onRenamed={onRenamed}
        open
        sdk={sdk}
        title="Current title"
      />,
    );

    await user.clear(screen.getByRole('textbox', { name: 'Chat title' }));
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByRole('textbox', { name: 'Chat title' }), 'Manual title');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith('Manual title'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(request).toHaveBeenLastCalledWith(
      '/chats/chat-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('remains usable when suggestion generation fails', async () => {
    const request = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <RenameChatDialog
        chatId="chat-1"
        chatsSlug="chats"
        onOpenChange={vi.fn()}
        open
        sdk={{ request } as unknown as FrogBotSDK}
        title="Current title"
      />,
    );

    expect((screen.getByRole('textbox', { name: 'Chat title' }) as HTMLInputElement).disabled).toBe(
      false,
    );
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
