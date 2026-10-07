import { createFrogBotSDK } from '@frogbotai/sdk';
import { describe, expect, it, vi } from 'vitest';

import {
  FrogBotChatTransport,
  prepareChatRequest,
} from '../../../../packages/ui/src/chat/transport';

const message = {
  id: 'user-1',
  role: 'user' as const,
  parts: [{ type: 'text' as const, text: 'Hello' }],
};

const sdk = (fetch: typeof globalThis.fetch = globalThis.fetch) =>
  createFrogBotSDK({ baseURL: '/api', fetch });

type SendOptions = Parameters<FrogBotChatTransport['sendMessages']>[0];

function sendOptions(overrides: Partial<SendOptions> = {}): SendOptions {
  return {
    abortSignal: undefined,
    chatId: 'chat',
    messageId: undefined,
    messages: [],
    trigger: 'submit-message',
    ...overrides,
  };
}

async function captureBody(request?: Parameters<typeof prepareChatRequest>[0]) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(
      new Response(new ReadableStream({ start: (controller) => controller.close() })),
    ),
  );

  const transport = new FrogBotChatTransport({
    agentSlug: 'agent',
    sdk: sdk(fetch),
    prepareSendMessagesRequest: prepareChatRequest(request),
    body: { unsupported: true },
  });

  await transport.sendMessages(sendOptions({ messageId: message.id, messages: [message] }));

  return JSON.parse(fetch.mock.calls[0][1]?.body as string);
}

describe('FrogBotChatTransport', () => {
  it('serializes the strict new-chat body', async () => {
    expect(await captureBody()).toEqual({ messages: [message] });
  });

  it('serializes the strict existing-chat body', async () => {
    expect(await captureBody({ chatId: 'chat-1' })).toEqual({
      messages: [message],
      chatId: 'chat-1',
    });
  });

  it('sends the selected reasoning level beside the model', async () => {
    const body = await captureBody({ model: 'openai/gpt-5', reasoning: () => 'high' });

    expect(body).toEqual({ messages: [message], model: 'openai/gpt-5', reasoning: 'high' });
  });

  it('omits reasoning when the Default level is selected', async () => {
    const body = await captureBody({ model: 'openai/gpt-5', reasoning: () => undefined });

    expect(body).toEqual({ messages: [message], model: 'openai/gpt-5' });
  });

  it('resolves a lazy chat id at send time', async () => {
    let chatId: string | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(new ReadableStream({ start: (controller) => controller.close() })),
      ),
    );

    const transport = new FrogBotChatTransport({
      agentSlug: 'agent',
      sdk: sdk(fetch),
      prepareSendMessagesRequest: prepareChatRequest({
        chatId: () => chatId,
        model: () => 'zen/big-pickle',
      }),
    });

    const send = () =>
      transport.sendMessages(sendOptions({ messageId: message.id, messages: [message] }));

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
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response('data: {"type":"finish"}\n\n', {
          headers: { 'Content-Type': 'text/event-stream', 'X-FrogBot-Chat-Id': 'chat-1' },
        }),
      ),
    );

    const transport = new FrogBotChatTransport({
      agentSlug: 'support agent',
      sdk: sdk(fetch),
      onChatId,
    });

    await transport.sendMessages(sendOptions()).then((stream) => stream.cancel());

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
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response('data: {"type":"finish"}\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const transport = new FrogBotChatTransport({ agentSlug: 'agent', sdk: sdk(fetch) });
    await transport.sendMessages(sendOptions()).then((stream) => stream.cancel());

    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('accept')).toBe('text/event-stream');
  });

  it('preserves caller header overrides', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(new ReadableStream({ start: (controller) => controller.close() })),
      ),
    );

    const transport = new FrogBotChatTransport({
      agentSlug: 'agent',
      sdk: sdk(fetch),
      headers: { Accept: 'application/json' },
    });

    await transport.sendMessages(sendOptions());

    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('accept')).toBe('application/json');
  });

  it('sends the SDK headers with every agent request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(new ReadableStream({ start: (controller) => controller.close() })),
      ),
    );

    const transport = new FrogBotChatTransport({
      agentSlug: 'agent',
      sdk: createFrogBotSDK({
        baseURL: '/api',
        fetch,
        headers: { authorization: 'Bearer token' },
      }),
    });

    await transport.sendMessages(sendOptions());

    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer token');
  });

  it('treats a bodyless 499 as a clean empty stream', async () => {
    const transport = new FrogBotChatTransport({
      agentSlug: 'agent',
      sdk: sdk(() => Promise.resolve(new Response(null, { status: 499 }))),
    });

    const stream = await transport.sendMessages(sendOptions());

    expect((await stream.getReader().read()).done).toBe(true);
  });

  it('does not reconnect', async () => {
    expect(
      await new FrogBotChatTransport({ agentSlug: 'agent', sdk: sdk() }).reconnectToStream(),
    ).toBeNull();
  });
});
