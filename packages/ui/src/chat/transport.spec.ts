import { createFrogbotSDK } from '@frogbotai/sdk';
import { describe, expect, it, vi } from 'vitest';

import { FrogbotChatTransport, prepareChatRequest } from './transport';

const message = {
  id: 'user-1',
  role: 'user' as const,
  parts: [{ type: 'text' as const, text: 'Hello' }],
};
const sdk = (fetch: typeof globalThis.fetch = globalThis.fetch) =>
  createFrogbotSDK({ baseURL: '/api', fetch });

async function captureBody(chatId?: string | (() => string | undefined)) {
  const fetch = vi.fn(() =>
    Promise.resolve(
      new Response(new ReadableStream({ start: (controller) => controller.close() })),
    ),
  );
  const transport = new FrogbotChatTransport({
    agentSlug: 'agent',
    sdk: sdk(fetch),
    prepareSendMessagesRequest: prepareChatRequest(chatId),
    body: { unsupported: true },
  });
  await transport.sendMessages({
    chatId: 'chat',
    messageId: message.id,
    messages: [message],
    trigger: 'submit-message',
  });
  return JSON.parse(fetch.mock.calls[0][1]?.body as string);
}

describe('FrogbotChatTransport', () => {
  it('serializes the strict new-chat body', async () => {
    expect(await captureBody()).toEqual({ messages: [message] });
  });

  it('serializes the strict existing-chat body', async () => {
    expect(await captureBody('chat-1')).toEqual({ messages: [message], chatId: 'chat-1' });
  });

  it('resolves a lazy chat id at send time', async () => {
    let chatId: string | undefined;
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(new ReadableStream({ start: (controller) => controller.close() })),
      ),
    );
    const transport = new FrogbotChatTransport({
      agentSlug: 'agent',
      sdk: sdk(fetch),
      prepareSendMessagesRequest: prepareChatRequest(
        () => chatId,
        () => 'zen/big-pickle',
      ),
    });
    const send = () =>
      transport.sendMessages({
        chatId: 'chat',
        messageId: message.id,
        messages: [message],
        trigger: 'submit-message',
      });
    await send();
    chatId = 'chat-1';
    await send();
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({
      messages: [message],
      model: 'zen/big-pickle',
    });
    expect(JSON.parse(fetch.mock.calls[1][1]?.body as string)).toEqual({
      messages: [message],
      chatId: 'chat-1',
      model: 'zen/big-pickle',
    });
  });

  it('targets the agent endpoint and captures the chat id', async () => {
    const onChatId = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response('data: {"type":"finish"}\n\n', {
          headers: { 'Content-Type': 'text/event-stream', 'X-Frogbot-Chat-Id': 'chat-1' },
        }),
      ),
    );
    const transport = new FrogbotChatTransport({
      agentSlug: 'support agent',
      sdk: sdk(fetch),
      onChatId,
    });
    await transport
      .sendMessages({ chatId: 'chat', messages: [], trigger: 'submit-message' })
      .then((stream) => stream.cancel());
    expect(fetch).toHaveBeenCalledWith(
      '/api/agents/support%20agent',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(transport.chatId).toBe('chat-1');
    expect(onChatId).toHaveBeenCalledWith('chat-1');
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'frogbot:chats:mutated' }),
    );
    vi.unstubAllGlobals();
  });

  it('requests the event stream response by default', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response('data: {"type":"finish"}\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );
    const transport = new FrogbotChatTransport({ agentSlug: 'agent', sdk: sdk(fetch) });
    await transport
      .sendMessages({ chatId: 'chat', messages: [], trigger: 'submit-message' })
      .then((stream) => stream.cancel());
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('accept')).toBe('text/event-stream');
  });

  it('preserves caller header overrides', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(new ReadableStream({ start: (controller) => controller.close() })),
      ),
    );
    const transport = new FrogbotChatTransport({
      agentSlug: 'agent',
      sdk: sdk(fetch),
      headers: { Accept: 'application/json' },
    });
    await transport.sendMessages({ chatId: 'chat', messages: [], trigger: 'submit-message' });
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('accept')).toBe('application/json');
  });

  it('treats a bodyless 499 as a clean empty stream', async () => {
    const transport = new FrogbotChatTransport({
      agentSlug: 'agent',
      sdk: sdk(() => Promise.resolve(new Response(null, { status: 499 }))),
    });
    const stream = await transport.sendMessages({
      chatId: 'chat',
      messages: [],
      trigger: 'submit-message',
    });
    expect((await stream.getReader().read()).done).toBe(true);
  });

  it('does not reconnect', async () => {
    expect(
      await new FrogbotChatTransport({ agentSlug: 'agent', sdk: sdk() }).reconnectToStream({
        chatId: 'chat',
      }),
    ).toBeNull();
  });
});
