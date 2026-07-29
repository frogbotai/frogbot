import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { agentSlug, messagesSlug, threadsSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(3988, '127.0.0.1', resolve);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
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
          response.end('data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"gpt-4.1-mini","choices":[{"index":0,"delta":{"role":"assistant","content":"hello"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"gpt-4.1-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n');
          return;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ id: 'chatcmpl-test', object: 'chat.completion', created: 1, model: 'gpt-4.1-mini', choices: [{ index: 0, message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
      });
    });
    await listen(openai);
    booted = await bootFrogbot(dirname, 'endpoint-composition');
  });

  afterAll(async () => {
    await booted.shutdown();
    await close(openai);
  });

  async function expectPersisted(threadId: string | number) {
    const [threads, messages] = await Promise.all([
      booted.frogbot.count({ collection: threadsSlug, where: { id: { equals: threadId } }, overrideAccess: true }),
      booted.frogbot.find({ collection: messagesSlug, where: { thread: { equals: threadId } }, depth: 0, overrideAccess: true }),
    ]);
    expect(threads.totalDocs).toBe(1);
    expect(messages.docs).toHaveLength(2);
    expect(messages.docs.map((message) => message.role).sort()).toEqual(['assistant', 'user']);
  }

  it('JSON POST persists one thread, one user message, and one assistant message', async () => {
    const response = await booted.restClient.post<{ text: string; threadId: string | number }>(`/api/agents/${agentSlug}`, { prompt: 'Reply with exactly: hello' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.text).toBe('hello');
    expect(response.body.threadId).toBeDefined();
    await expectPersisted(response.body.threadId);
  });

  it('fully consumed SSE POST persists one thread, one user message, and one assistant message', async () => {
    const response = await fetch(`${booted.baseUrl}/api/agents/${agentSlug}`, {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Reply with exactly: hello' }),
    });
    expect(response.status).toBe(200);
    await response.text();
    const threadId = response.headers.get('X-Frogbot-Thread-Id');
    expect(threadId).not.toBeNull();
    await expectPersisted(threadId!);
  });
});
