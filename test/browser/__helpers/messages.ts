import { expect, type Page } from '@playwright/test';

export type SavedMessage = { chatId: number | string; messageId: string };

export async function createMessage(page: Page): Promise<SavedMessage> {
  const chatResponse = await page.request.post('/api/chats', { data: { title: 'Saved message' } });

  expect(chatResponse.ok()).toBe(true);

  const { doc: chat } = await chatResponse.json();
  const messageId = `browser-message-${Date.now()}`;

  const messageResponse = await page.request.post('/api/messages', {
    data: {
      id: messageId,
      chat: chat.id,
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    },
  });

  expect(messageResponse.ok()).toBe(true);

  return { chatId: chat.id, messageId };
}

export async function deleteMessage(page: Page, { chatId, messageId }: SavedMessage) {
  await page.request.delete(`/api/messages/${messageId}`);
  await page.request.delete(`/api/chats/${chatId}`);
}
