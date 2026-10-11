import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RenameChatDialog } from '../../../../packages/ui/src/chat/rename-chat-dialog';
import { createRestChatAdapter } from '../../../../packages/ui/src/chat/rest/adapter';
import { CHAT_MUTATION_EVENT } from '../../../../packages/ui/src/chat/use-chats';

function makeAdapter(suggestion: string | null = 'Night frogs') {
  const request = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ suggestion })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'chat-1', title: suggestion })));

  return { adapter: createRestChatAdapter({ fetch: request, chatsSlug: 'chats' }), request };
}

describe('RenameChatDialog', () => {
  it('selects the current title and accepts the automatic suggestion', async () => {
    const user = userEvent.setup();
    const { adapter } = makeAdapter();

    render(
      <RenameChatDialog
        chatId="chat-1"
        onOpenChange={vi.fn()}
        open
        adapter={adapter}
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
    const { adapter, request } = makeAdapter(null);
    const mutated = vi.fn();

    window.addEventListener(CHAT_MUTATION_EVENT, mutated);

    render(
      <RenameChatDialog
        chatId="chat-1"
        onOpenChange={onOpenChange}
        onRenamed={onRenamed}
        open
        adapter={adapter}
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
      '/api/chats/chat-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(mutated).toHaveBeenCalledOnce();

    window.removeEventListener(CHAT_MUTATION_EVENT, mutated);
  });

  it('remains usable when suggestion generation fails', () => {
    const request = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('offline'));

    render(
      <RenameChatDialog
        chatId="chat-1"
        onOpenChange={vi.fn()}
        open
        adapter={createRestChatAdapter({ fetch: request, chatsSlug: 'chats' })}
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

  it('offers no suggestion when the adapter cannot suggest titles', async () => {
    const { suggestChatTitle: _suggest, ...adapter } = createRestChatAdapter({
      fetch: vi.fn<typeof globalThis.fetch>(),
      chatsSlug: 'chats',
    });

    render(
      <RenameChatDialog
        adapter={adapter}
        chatId="chat-1"
        onOpenChange={vi.fn()}
        open
        title="Current title"
      />,
    );

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Chat title' })).toBeTruthy());

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Cancel',
      'Save',
      'Close',
    ]);
  });
});
