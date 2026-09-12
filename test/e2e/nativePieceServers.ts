import { serve } from '@hono/node-server';
import { Hono } from 'hono';

export type PieceModelRequest = {
  model: string;
  stream?: boolean;
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string }> | null;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  }>;
  tools?: Array<{
    type: string;
    function: { name: string; parameters: Record<string, unknown> };
  }>;
};

export type PieceVendorRequest = {
  authorization: string | undefined;
  contentType: string | undefined;
  body: Record<string, unknown>;
};

export async function startPieceServer(app: Hono) {
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local server address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export async function startPieceProviders() {
  const requests = {
    model: [] as PieceModelRequest[],
    resend: [] as PieceVendorRequest[],
    unexpected: [] as string[],
  };
  const failures = new Map<string, { status: 401 | 429 | 500; message: string }>();
  const pauses = new Map<string, Promise<void>>();
  const app = new Hono();

  app.post('/emails', async (context) => {
    const body = await context.req.json<Record<string, unknown>>();
    requests.resend.push({
      authorization: context.req.header('authorization'),
      contentType: context.req.header('content-type'),
      body,
    });
    await pauses.get(String(body.subject));
    const failure = failures.get(String(body.subject));
    if (failure) return context.json({ message: failure.message }, failure.status);
    return context.json({ id: `email-${body.subject}` });
  });

  app.post('/v1/chat/completions', async (context) => {
    const body = await context.req.json<PieceModelRequest>();
    requests.model.push(body);
    if (body.stream) throw new Error('The piece fixture expects non-streaming completions');
    const result = body.messages.at(-1);
    const toolName = body.tools?.find(({ function: tool }) => tool.name.endsWith('_send'))?.function
      .name;
    if (!toolName) throw new Error('The model request is missing the native send tool');
    const user = body.messages.findLast(({ role }) => role === 'user');
    const prompt = Array.isArray(user?.content)
      ? user.content.map(({ text }) => text ?? '').join('')
      : user?.content;
    if (!prompt) throw new Error('The model request is missing the action input');
    const input: unknown = JSON.parse(prompt);
    const finished = result?.role === 'tool';
    if (finished) {
      const call = body.messages.at(-2);
      if (
        call?.role !== 'assistant' ||
        call.tool_calls?.length !== 1 ||
        call.tool_calls[0]?.id !== result.tool_call_id ||
        call.tool_calls[0]?.function.name !== toolName ||
        call.tool_calls[0]?.function.arguments !== JSON.stringify(input)
      ) {
        throw new Error('The tool result does not match the preceding assistant call');
      }
    }

    return context.json({
      id: `completion-${requests.model.length}`,
      object: 'chat.completion',
      created: 1,
      model: body.model,
      choices: [
        {
          index: 0,
          message: finished
            ? { role: 'assistant', content: `Tool result: ${result.content}` }
            : {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'native-send-call',
                    type: 'function',
                    function: { name: toolName, arguments: JSON.stringify(input) },
                  },
                ],
              },
          finish_reason: finished ? 'stop' : 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  });

  app.notFound((context) => {
    requests.unexpected.push(`${context.req.method} ${context.req.path}`);
    return context.json({ error: 'Unexpected provider request' }, 500);
  });

  return { ...(await startPieceServer(app)), requests, failures, pauses };
}
