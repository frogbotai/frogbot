import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { AgentModelId, FrogBotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';
import { FrogBot } from 'frogbot/test';
import { question, type QuestionInput } from 'frogbot/tools';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDiscord } from '../../packages/pieces/piece-discord/src/index.js';
import {
  callKey,
  encodeQuestionId,
} from '../../packages/pieces/piece-discord/src/questions/ids.js';
import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel.js';
import {
  componentClick,
  type DiscordApi,
  discordApplicationId,
  discordBotToken,
  discordPublicKey,
  forwardedGateway,
  gatewayMessage,
  signedInteraction,
  startDiscordApi,
} from '../unit/frogbot/channels/discordFixtures.js';
import { startPieceServer } from './nativePieceServers.js';

const RUN_E2E = process.env.RUN_E2E === '1';
const MODEL_PORT = 4094;
const CHANNEL_TASK = 'frogbot-run-channel-message';

type ChannelJob = {
  hasError?: boolean;
  input: { kind?: string; thread: { id: string } };
};

const paint: QuestionInput = {
  questions: [
    {
      header: 'Finish',
      question: 'Which finish should the **front door** get?',
      options: [
        { label: 'Matte (flat)', description: 'No shine; hides flaws' },
        { label: 'Eggshell', description: 'A soft glow' },
        { label: 'Satin — washable', description: 'Good for hands and paws' },
        { label: 'Semi-gloss', description: 'Shiny; shows brush marks' },
        { label: 'High gloss ✨', description: 'Mirror-like' },
        { label: 'Chalk_paint', description: 'Distressed look' },
        { label: '*Undecided*', description: 'Ask me again later' },
      ],
      custom: true,
    },
  ],
};

const order: QuestionInput = {
  questions: [
    {
      header: 'Size',
      question: 'Which size?',
      options: [{ label: 'Small' }, { label: 'Medium' }, { label: 'Large' }],
      custom: false,
    },
    {
      header: 'Toppings',
      question: 'Which toppings?',
      options: [{ label: 'Basil' }, { label: 'Olives' }, { label: 'Chili & honey' }],
      multiple: true,
      custom: false,
    },
    {
      header: 'Notes',
      question: 'Anything else?',
      options: [{ label: 'Nothing' }],
      custom: true,
    },
  ],
};

function control({
  n,
  q = 0,
  toolCallId,
  verb,
}: {
  n?: number;
  q?: number;
  toolCallId: string;
  verb: Parameters<typeof encodeQuestionId>[0]['verb'];
}) {
  return encodeQuestionId({ key: callKey(toolCallId), q, verb, n });
}

describe.skipIf(!RUN_E2E)('Discord questions e2e — webhook to continuation over HTTP', () => {
  let api: DiscordApi;
  let dataDir: string;
  let frogbot: FrogBotInstance;
  let model: StubChatModel;
  let server: Awaited<ReturnType<typeof startPieceServer>>;
  const blocked: string[] = [];

  const webhookURL = () => `${server.url}/api/webhooks/discord`;

  async function channelJobs(threadId: string): Promise<ChannelJob[]> {
    const result = await frogbot.find({
      collection: 'payload-jobs' as never,
      where: { taskSlug: { equals: CHANNEL_TASK } },
      sort: 'createdAt',
      limit: 0,
      overrideAccess: true,
    });

    return (result.docs as unknown as ChannelJob[]).filter(
      ({ input }) => input.thread.id === `discord:G1:C1:${threadId}`,
    );
  }

  async function kinds(threadId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    (await channelJobs(threadId))
      .map(({ input }) => input.kind ?? 'message')
      .filter((kind) => kind !== 'promote')
      .forEach((kind) => {
        counts[kind] = (counts[kind] ?? 0) + 1;
      });

    return counts;
  }

  async function channelJobsWhere(where: Record<string, unknown>) {
    const result = await frogbot.find({
      collection: 'payload-jobs' as never,
      where: { and: [{ taskSlug: { equals: CHANNEL_TASK } }, where] },
      limit: 0,
      overrideAccess: true,
    });

    return result.docs as unknown as ChannelJob[];
  }

  async function work() {
    await expect
      .poll(
        async () => {
          await frogbot.jobs.run({ allQueues: true, req: await frogbot.createRequest() } as never);

          return (
            await channelJobsWhere({
              completedAt: { exists: false },
              hasError: { not_equals: true },
            })
          ).length;
        },
        { timeout: 20_000, interval: 50 },
      )
      .toBe(0);

    expect(await channelJobsWhere({ hasError: { equals: true } })).toEqual([]);
  }

  async function post(request: Request) {
    return fetch(webhookURL(), {
      method: 'POST',
      headers: request.headers,
      body: await request.text(),
      signal: AbortSignal.timeout(20_000),
    });
  }

  async function mention({ content, threadId }: { content: string; threadId: string }) {
    api.parents.set(threadId, 'C1');

    const response = await post(
      forwardedGateway({
        body: gatewayMessage({ content, mention: true, starter: true, threadId }),
      }),
    );

    expect(response.status).toBe(200);

    await work();
  }

  async function click(args: {
    customId: string;
    messageId: string;
    threadId: string;
    user?: string;
    values?: string[];
  }) {
    const response = await post(signedInteraction({ body: componentClick(args) }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 6 });

    await work();
  }

  async function reply({
    content,
    threadId,
    user = 'U2',
  }: {
    content: string;
    threadId: string;
    user?: string;
  }) {
    const response = await post(
      forwardedGateway({ body: gatewayMessage({ content, threadId, user }) }),
    );

    expect(response.status).toBe(200);

    await work();
  }

  function replies(threadId: string) {
    return api.calls
      .filter(
        ({ body, path }) =>
          path.startsWith(`/channels/${threadId}/messages`) &&
          typeof body.content === 'string' &&
          body.flags === undefined,
      )
      .map(({ body }) => String(body.content));
  }

  function toolResults() {
    return model.requests
      .at(-1)!
      .messages.filter(({ role }) => role === 'tool')
      .map(({ content }) => JSON.parse(String(content)));
  }

  beforeAll(async () => {
    api = await startDiscordApi();
    model = await startStubChatModel(MODEL_PORT);

    const nativeFetch = globalThis.fetch;

    vi.stubGlobal('fetch', ((input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());

      if (url.hostname !== '127.0.0.1') {
        blocked.push(url.origin);

        throw new Error(`External network is disabled in the Discord questions E2E: ${url.origin}`);
      }

      return nativeFetch(input, init);
    }) satisfies typeof fetch);

    dataDir = mkdtempSync(join(tmpdir(), 'frogbot-discord-questions-e2e-'));

    const config = await buildConfig({
      secret: 'discord-questions-e2e-secret',
      telemetry: false,
      db: sqliteAdapter({ client: { url: `file:${join(dataDir, 'discord.db')}` } }),
      typescript: { autoGenerate: false },
      jobs: { deleteJobOnComplete: false },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'chats', chat: true, fields: [] },
      ],
      ai: {
        providers: {
          local: {
            type: 'openai-compatible',
            baseUrl: `http://127.0.0.1:${MODEL_PORT}/v1`,
            apiKey: 'e2e-key',
            models: [{ id: 'discord-e2e', mode: 'chat' }],
          },
        },
      },
      agents: [
        {
          slug: 'support',
          model: 'local/discord-e2e' as AgentModelId,
          instructions: 'Ask before acting.',
          tools: [question],
          channels: [
            createDiscord({
              auth: { botToken: discordBotToken },
              apiUrl: api.url,
              applicationId: discordApplicationId,
              publicKey: discordPublicKey,
            }),
          ],
          access: ({ req }) => ['U1', 'U2', 'U3'].includes(req.context?.channel?.author.id ?? ''),
        },
      ],
    });

    frogbot = await new FrogBot().init({ config, startChannelGateway: false });

    const app = new Hono();

    app.all('/api/*', (context) => frogbot.handleRequest(context.req.raw.clone()));

    server = await startPieceServer(app);
  });

  beforeEach(() => {
    model.reset();
    api.reset();
  });

  afterEach(() => {
    expect(blocked).toEqual([]);
  });

  afterAll(async () => {
    try {
      const results = await Promise.allSettled([server?.close(), frogbot?.destroy()]);

      await Promise.allSettled([model?.close(), api?.close()]);

      results.forEach((result) => {
        if (result.status === 'rejected') throw result.reason;
      });
    } finally {
      vi.unstubAllGlobals();

      if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('asks natively, takes a teammate’s signed click, and posts the continued reply', async () => {
    const threadId = 'T201';
    const toolCallId = 'e2e-finish';

    model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input: paint }] });

    await mention({ content: '<@100000000000000001> paint the door', threadId });

    const [card] = api.cards(threadId);
    const select = JSON.parse(JSON.stringify(card!.body)).components[0].components.find(
      (component: { type: number }) => component.type === 1,
    ).components[0];

    expect(model.requests[0]!.tools?.map(({ function: tool }) => tool.name)).toContain('question');
    expect(replies(threadId)).toEqual([]);
    expect(card!.body).toMatchObject({ flags: 32768, allowed_mentions: { parse: [] } });
    expect(JSON.stringify(card!.body)).toContain('Which finish should the **front door** get?');
    expect(select.options).toEqual(
      paint.questions[0]!.options.map((option, index) => ({ ...option, value: String(index) })),
    );

    model.respond({ text: 'Going with satin on the front door.' });

    await click({
      customId: control({ toolCallId, verb: 'select', n: 0 }),
      messageId: card!.id!,
      threadId,
      values: ['2'],
    });

    expect(JSON.stringify(api.edits(threadId, card!.id!)[0]!.body)).toContain(
      'Answered by **User U2**',
    );
    expect(toolResults()).toEqual([
      { answers: [{ header: 'Finish', selected: ['Satin — washable'] }] },
    ]);
    expect(await kinds(threadId)).toEqual({ message: 1, continue: 1 });
    expect(replies(threadId).at(-1)).toBe('Going with satin on the front door.');

    const settled = api.calls.length;

    await click({
      customId: control({ toolCallId, verb: 'select', n: 0 }),
      messageId: card!.id!,
      threadId,
      user: 'U3',
      values: ['0'],
    });

    expect(api.calls.slice(settled)).toEqual([]);
    expect(model.requests).toHaveLength(2);
  });

  it('refuses a participant the agent’s access does not admit', async () => {
    const threadId = 'T202';
    const toolCallId = 'e2e-denied';

    model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input: paint }] });

    await mention({ content: 'paint the door', threadId });

    const [card] = api.cards(threadId);

    await click({
      customId: control({ toolCallId, verb: 'dismiss' }),
      messageId: card!.id!,
      threadId,
      user: 'U9',
    });

    expect(replies(threadId)).toEqual(["<@U9> You don't have access to answer this question."]);
    expect(api.edits(threadId, card!.id!)).toEqual([]);
    expect(model.requests).toHaveLength(1);
    expect(await kinds(threadId)).toEqual({ message: 1 });
  });

  it('walks a three-question set with a menu and a typed reply, then continues once', async () => {
    const threadId = 'T203';
    const toolCallId = 'e2e-order';

    model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input: order }] });

    await mention({ content: 'order a pizza', threadId });

    const [card] = api.cards(threadId);
    const messageId = card!.id!;

    await click({ customId: control({ toolCallId, verb: 'option', n: 2 }), messageId, threadId });
    await click({
      customId: control({ toolCallId, q: 1, verb: 'select', n: 0 }),
      messageId,
      threadId,
      user: 'U3',
      values: ['2', '0'],
    });
    await click({
      customId: control({ toolCallId, q: 1, verb: 'submit' }),
      messageId,
      threadId,
      user: 'U3',
    });
    await click({ customId: control({ toolCallId, q: 2, verb: 'custom' }), messageId, threadId });

    const edits = api.edits(threadId, messageId).map(({ body }) => JSON.stringify(body));

    expect(edits).toHaveLength(3);
    expect(edits[0]).toContain('**Toppings** · 2 of 3');
    expect(edits[1]).toContain('**Notes** · 3 of 3');
    expect(edits[2]).toContain('**User U2**, reply in this thread with your answer.');
    expect(model.requests).toHaveLength(1);

    model.respond({ text: 'Large with basil and chili & honey, extra crispy.' });

    await reply({ content: 'Extra crispy, please', threadId });

    expect(toolResults()).toEqual([
      {
        answers: [
          { header: 'Size', selected: ['Large'] },
          { header: 'Toppings', selected: ['Basil', 'Chili & honey'] },
          { header: 'Notes', selected: [], custom: 'Extra crispy, please' },
        ],
      },
    ]);
    expect(JSON.stringify(api.edits(threadId, messageId).at(-1)!.body)).toContain(
      'Answered by **User U2**',
    );
    expect(await kinds(threadId)).toEqual({ message: 2, continue: 1 });
    expect(replies(threadId).at(-1)).toBe('Large with basil and chili & honey, extra crispy.');
  });
});
