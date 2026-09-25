import { createServer, type IncomingMessage, type Server } from 'node:http';

export type StubToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type StubChatResponse = {
  text?: string;
  toolCalls?: StubToolCall[];
  hold?: Promise<void>;
};

export type StubChatRequest = {
  stream: boolean;
  messages: Array<{ role: string; content?: unknown; tool_calls?: unknown; tool_call_id?: string }>;
  tools?: Array<{ function: { name: string } }>;
};

export type StubChatModel = {
  requests: StubChatRequest[];
  respond: (...responses: StubChatResponse[]) => void;
  reset: () => void;
  close: () => Promise<void>;
};

const usage = { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 };

async function readJSON(req: IncomingMessage): Promise<StubChatRequest> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) chunks.push(Buffer.from(chunk));

  return JSON.parse(Buffer.concat(chunks).toString()) as StubChatRequest;
}

function toolCalls(calls: StubToolCall[]) {
  return calls.map((call, index) => ({
    index,
    id: call.id,
    type: 'function',
    function: { name: call.name, arguments: JSON.stringify(call.input) },
  }));
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

/**
 * OpenAI-compatible chat completions stub. Each request that offers tools
 * consumes the next scripted response (text by default), is recorded, and
 * can hold its reply until a test releases it. Requests without tools, such
 * as chat title generation, receive a plain text reply and are not recorded.
 */
export async function startStubChatModel(port: number): Promise<StubChatModel> {
  const requests: StubChatRequest[] = [];
  const responses: StubChatResponse[] = [];

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404).end();

      return;
    }

    const body = await readJSON(req);
    const agentRequest = (body.tools?.length ?? 0) > 0;

    if (agentRequest) requests.push(body);

    const response = (agentRequest ? responses.shift() : undefined) ?? { text: 'Done.' };

    await response.hold;

    const calls = response.toolCalls ?? [];
    const finishReason = calls.length > 0 ? 'tool_calls' : 'stop';
    const completion = { id: `stub-${requests.length}`, created: 1, model: 'stub' };

    if (!body.stream) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          ...completion,
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: response.text ?? null,
                ...(calls.length > 0 ? { tool_calls: toolCalls(calls) } : {}),
              },
              finish_reason: finishReason,
            },
          ],
          usage,
        }),
      );

      return;
    }

    res.writeHead(200, { 'content-type': 'text/event-stream' });

    const chunks = [
      ...(response.text !== undefined
        ? [{ index: 0, delta: { role: 'assistant', content: response.text }, finish_reason: null }]
        : []),
      ...(calls.length > 0
        ? [
            {
              index: 0,
              delta: { role: 'assistant', tool_calls: toolCalls(calls) },
              finish_reason: null,
            },
          ]
        : []),
      { index: 0, delta: {}, finish_reason: finishReason },
    ];

    for (const [index, choice] of chunks.entries()) {
      res.write(
        `data: ${JSON.stringify({
          ...completion,
          object: 'chat.completion.chunk',
          choices: [choice],
          ...(index === chunks.length - 1 ? { usage } : {}),
        })}\n\n`,
      );
    }

    res.end('data: [DONE]\n\n');
  });

  await listen(server, port);

  return {
    requests,
    respond: (...next) => {
      responses.push(...next);
    },
    reset: () => {
      requests.length = 0;
      responses.length = 0;
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
