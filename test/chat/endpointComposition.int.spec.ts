import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { agentSlug, messagesSlug, chatsSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(3988, '127.0.0.1', resolve);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe('agent endpoint composition', () => {
  let booted: BootedFrogbot;
  let openai: Server;

  beforeAll(async () => {
    openai = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        const stream = (JSON.parse(body) as { stream?: boolean }).stream;
        if (stream) {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.end(
            'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"gpt-4.1-mini","choices":[{"index":0,"delta":{"role":"assistant","content":"hello"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"gpt-4.1-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n',
          );
          return;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: 1,
            model: 'gpt-4.1-mini',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
      });
    });
    await listen(openai);
    booted = await bootFrogbot(dirname, 'endpoint-composition');
  });

  afterAll(async () => {
    await booted.shutdown();
    await close(openai);
  });

  async function expectPersisted(chatId: string | number) {
    const [chats, messages] = await Promise.all([
      booted.frogbot.count({
        collection: chatsSlug,
        where: { id: { equals: chatId } },
        overrideAccess: true,
      }),
      booted.frogbot.find({
        collection: messagesSlug,
        where: { chat: { equals: chatId } },
        depth: 0,
        overrideAccess: true,
      }),
    ]);
    expect(chats.totalDocs).toBe(1);
    expect(messages.docs).toHaveLength(2);
    expect(messages.docs.map((message) => message.role).sort()).toEqual(['assistant', 'user']);
  }

  async function createOwnedChat() {
    const owner = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: `owner-${Date.now()}@frogbot.local`, password: 'frogbot-int-password' },
      overrideAccess: true,
    });
    return booted.frogbot.create({
      collection: chatsSlug,
      data: { agent: agentSlug, user: owner.id },
      overrideAccess: true,
    });
  }

  async function expectAnonymousRejected(accept?: string) {
    const chat = await createOwnedChat();
    const response = await fetch(`${booted.baseUrl}/api/agents/${agentSlug}`, {
      method: 'POST',
      headers: { ...(accept ? { accept } : {}), 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Read private history', chatId: chat.id }),
    });
    expect(response.status).toBe(404);
    const messages = await booted.frogbot.count({
      collection: messagesSlug,
      where: { chat: { equals: chat.id } },
      overrideAccess: true,
    });
    expect(messages.totalDocs).toBe(0);
  }

  it('JSON POST persists one chat, one user message, and one assistant message', async () => {
    const response = await booted.restClient.post<{ text: string; chatId: string | number }>(
      `/api/agents/${agentSlug}`,
      { prompt: 'Reply with exactly: hello' },
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.text).toBe('hello');
    expect(response.body.chatId).toBeDefined();
    await expectPersisted(response.body.chatId);
  });

  it('fully consumed SSE POST persists one chat, one user message, and one assistant message', async () => {
    const response = await fetch(`${booted.baseUrl}/api/agents/${agentSlug}`, {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Reply with exactly: hello' }),
    });
    expect(response.status).toBe(200);
    await response.text();
    const chatId = response.headers.get('X-Frogbot-Chat-Id');
    expect(chatId).not.toBeNull();
    await expectPersisted(chatId!);
  });

  it('anonymous JSON POST cannot read or write an authenticated chat', async () => {
    await expectAnonymousRejected();
  });

  it('anonymous SSE POST cannot read or write an authenticated chat', async () => {
    await expectAnonymousRejected('text/event-stream');
  });
});
