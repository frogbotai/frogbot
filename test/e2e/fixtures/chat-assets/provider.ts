import { serve } from '@hono/node-server';
import { Hono } from 'hono';

import { answer, followUp, report, toolCallId, toolSlug } from './shared.js';

export type ModelMessage = {
  role: string;
  content: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
};

export type ModelRequest = {
  model: string;
  stream?: boolean;
  messages: ModelMessage[];
  tools?: Array<{ type: string; function: { name: string; parameters: unknown } }>;
};

export async function startModelProvider() {
  const requests: ModelRequest[] = [];
  const unexpected: string[] = [];
  const app = new Hono();

  app.post('/v1/chat/completions', async (context) => {
    const body = await context.req.json<ModelRequest>();

    requests.push(body);

    const lastMessage = body.messages.at(-1);
    const finished =
      lastMessage?.role === 'tool' ||
      (lastMessage?.role === 'user' && lastMessage.content === followUp);

    const toolCall = {
      id: toolCallId,
      type: 'function',
      function: { name: toolSlug, arguments: JSON.stringify({ content: report }) },
    };
    const message = finished
      ? { role: 'assistant', content: answer }
      : { role: 'assistant', content: null, tool_calls: [toolCall] };
    const finishReason = finished ? 'stop' : 'tool_calls';
    const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
    const completion = {
      id: `chat-assets-${requests.length}`,
      created: 1,
      model: body.model,
    };

    if (!body.stream) {
      return context.json({
        ...completion,
        object: 'chat.completion',
        choices: [{ index: 0, message, finish_reason: finishReason }],
        usage,
      });
    }

    const delta = finished
      ? { role: 'assistant', content: answer }
      : { role: 'assistant', tool_calls: [{ index: 0, ...toolCall }] };
    const chunks = [
      { choices: [{ index: 0, delta, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: finishReason }], usage },
    ];
    const stream = chunks
      .map((chunk) => JSON.stringify({ ...completion, object: 'chat.completion.chunk', ...chunk }))
      .map((chunk) => `data: ${chunk}\n\n`)
      .join('');

    return new Response(`${stream}data: [DONE]\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    });
  });

  app.notFound((context) => {
    unexpected.push(`${context.req.method} ${context.req.path}`);

    return context.json({ error: 'Unexpected model provider request' }, 500);
  });

  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });

  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();

  if (!address || typeof address === 'string') throw new Error('Missing model provider address');

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    unexpected,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
