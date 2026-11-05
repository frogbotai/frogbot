import { createServer, type IncomingMessage, type Server } from 'node:http';

export type StubToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type StubUsage = { prompt_tokens: number; completion_tokens: number };

export type StubChatResponse = {
  text?: string;
  toolCalls?: StubToolCall[];
  hold?: Promise<void>;
  error?: { status: number; body: unknown };
  usage?: StubUsage;
};

export type StubTitleResponse = {
  text: string;
  hold?: Promise<void>;
  error?: { status: number; body: unknown };
  usage?: StubUsage;
};

export type StubChatRequest = {
  model: string;
  reasoning_effort?: string;
  stream: boolean;
  messages: Array<{ role: string; content?: unknown; tool_calls?: unknown; tool_call_id?: string }>;
  tools?: Array<{ function: { name: string } }>;
};

export type StubChatModel = {
  requests: StubChatRequest[];
  titleRequests: StubChatRequest[];
  summaryRequests: StubChatRequest[];
  respond: (...responses: StubChatResponse[]) => void;
  respondTitle: (...responses: StubTitleResponse[]) => void;
  respondSummary: (...responses: StubTitleResponse[]) => void;
  reset: () => void;
  close: () => Promise<void>;
};

const defaultUsage: StubUsage = { prompt_tokens: 3, completion_tokens: 2 };

export const defaultSummary = [
  '## Objective',
  '- Continue the chat.',
  '',
  '## Important Context',
  '- (none)',
].join('\n');

function isSummaryRequest(body: StubChatRequest): boolean {
  return body.messages.some(
    ({ role, content }) => role === 'user' && JSON.stringify(content ?? '').includes('<template>'),
  );
}

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
 * can hold its reply until a test releases it or fail with a scripted HTTP
 * error. Requests without tools, such as chat title generation, consume the
 * next scripted title response ('Done.' by default), can hold or fail it the
 * same way, and are recorded in `titleRequests`. Compaction summary requests,
 * the tool-less ones whose last message holds the summary template, consume
 * `respondSummary` responses instead and are recorded in `summaryRequests`.
 * Each response can set its own `usage`.
 */
export async function startStubChatModel(port: number): Promise<StubChatModel> {
  const requests: StubChatRequest[] = [];
  const titleRequests: StubChatRequest[] = [];
  const responses: StubChatResponse[] = [];
  const titles: StubTitleResponse[] = [];
  const summaryRequests: StubChatRequest[] = [];
  const summaries: StubTitleResponse[] = [];

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404).end();

      return;
    }

    const body = await readJSON(req);
    const kind =
      (body.tools?.length ?? 0) > 0 ? 'agent' : isSummaryRequest(body) ? 'summary' : 'title';

    ({ agent: requests, summary: summaryRequests, title: titleRequests })[kind].push(body);

    const response: StubChatResponse =
      kind === 'agent'
        ? (responses.shift() ?? { text: 'Done.' })
        : kind === 'summary'
          ? (summaries.shift() ?? { text: defaultSummary })
          : (titles.shift() ?? { text: 'Done.' });

    const { prompt_tokens, completion_tokens } = response.usage ?? defaultUsage;
    const usage = {
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens,
    };

    await response.hold;

    if (response.error) {
      res.writeHead(response.error.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(response.error.body));

      return;
    }

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
    titleRequests,
    summaryRequests,
    respond: (...next) => {
      responses.push(...next);
    },
    respondTitle: (...next) => {
      titles.push(...next);
    },
    respondSummary: (...next) => {
      summaries.push(...next);
    },
    reset: () => {
      requests.length = 0;
      titleRequests.length = 0;
      summaryRequests.length = 0;
      responses.length = 0;
      titles.length = 0;
      summaries.length = 0;
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
