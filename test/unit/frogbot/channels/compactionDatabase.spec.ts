import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';

import { BasePayload } from 'payload';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { sqliteAdapter } from '../../../../packages/db-sqlite/src/index.js';
import type { AgentModelId } from '../../../../packages/frogbot/src/agents/types.js';
import {
  CHANNEL_TASK_SLUG,
  getChannelHost,
} from '../../../../packages/frogbot/src/channels/host.js';
import type { ChannelTaskInput } from '../../../../packages/frogbot/src/channels/types.js';
import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import { type FrogBot, initFrogBotFromPayload } from '../../../../packages/frogbot/src/frogbot.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { createSlackAdapter } from '../../../../packages/pieces/piece-slack/node_modules/@chat-adapter/slack/dist/index.js';
import { startStubChatModel, type StubChatModel } from '../../../__helpers/shared/StubChatModel.js';
import { testPort } from '../../../__helpers/shared/testPorts.js';

const SMALL_MODEL = 'test/small-window' as AgentModelId;

const lookup = {
  slug: 'lookup',
  description: 'Look up a topic.',
  inputSchema: z.object({ topic: z.string() }),
  execute: ({ topic }: { topic: string }) => `Found ${topic}.`,
};

vi.mock('frogbot/pieces', () => import('../../../../packages/frogbot/src/exports/pieces.js'));

const signingSecret = 'compaction-database-secret';
const modelPort = testPort(3996);
const slackCalls: Array<{ method: string; body: Record<string, unknown> }> = [];
let slackTs = 0;
let eventId = 0;

const slack = createServer(async (req, res) => {
  const raw = await text(req);
  const ts = `3.${String(++slackTs).padStart(6, '0')}`;

  slackCalls.push({
    method: req.url!.slice(1),
    body: raw.startsWith('{') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw)),
  });

  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, ts, channel: 'C1', message: {} }));
});

function slackURL() {
  return `http://127.0.0.1:${(slack.address() as AddressInfo).port}/`;
}

function mention({ message, thread, ts }: { message: string; thread: string; ts: string }) {
  const body = JSON.stringify({
    type: 'event_callback',
    event_id: `Ev${++eventId}`,
    team_id: 'T1',
    event: {
      type: 'app_mention',
      channel: 'C1',
      ts,
      ...(ts === thread ? {} : { thread_ts: thread }),
      text: message,
      user: 'U1',
    },
  });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex');

  return new Request('http://localhost/webhook', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': `v0=${signature}`,
    },
  });
}

async function boot(directory: string): Promise<FrogBot> {
  const slackPiece = definePiece({
    slug: 'slack',
    label: 'Slack',
    auth: z.object({ token: z.string() }),
    client: () => ({}),
    actions: [],
    channel: {
      adapter: () =>
        createSlackAdapter({
          botToken: 'xoxb-test',
          botUserId: 'UBOT',
          signingSecret,
          apiUrl: slackURL(),
          nativeStreaming: false,
          webClientOptions: { retryConfig: { retries: 0 } },
        }),
      identity: () => Promise.resolve(null),
    },
  });

  const config = await buildConfig({
    secret: 'channel-compaction-test-secret',
    db: sqliteAdapter({ client: { url: `file:${directory}/compaction.db` }, push: true }),
    typescript: { autoGenerate: false },
    admin: { importMap: { autoGenerate: false } },
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'chats', chat: true, fields: [] },
    ],
    ai: {
      compaction: { keep: 200 },
      providers: {
        test: {
          type: 'openai-compatible',
          baseUrl: `http://127.0.0.1:${modelPort}/v1`,
          apiKey: 'test-key',
          models: [{ id: 'small-window', mode: 'chat', limit: { context: 4_000 } }],
        },
      },
    },
    agents: [
      {
        slug: 'support',
        model: SMALL_MODEL,
        instructions: 'Help the user.',
        tools: [lookup],
        channels: [slackPiece({ auth: { token: 'secret' } })],
        access: () => true,
      },
    ],
  });

  const payload = await new BasePayload().init({
    config: config._internal.payloadConfig,
    disableOnInit: true,
  });

  return initFrogBotFromPayload(payload, config, {
    disableOnInit: true,
    startChannelGateway: false,
  });
}

describe('Slack chat compaction with SQLite persistence', () => {
  let directory: string;
  let frogbot: FrogBot;
  let model: StubChatModel;

  async function say(message: string, thread: string, ts: string) {
    await getChannelHost(frogbot)!.webhook('slack', mention({ message, thread, ts }));

    const result = await frogbot.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: CHANNEL_TASK_SLUG } },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    });

    await getChannelHost(frogbot)!.run(
      JSON.parse(JSON.stringify(result.docs[0].input)) as ChannelTaskInput,
    );
  }

  beforeAll(async () => {
    await new Promise<void>((resolve) => slack.listen(0, '127.0.0.1', resolve));

    model = await startStubChatModel(modelPort);
    directory = await mkdtemp(join(tmpdir(), 'frogbot-channel-compaction-'));
    frogbot = await boot(directory);
  }, 30_000);

  afterAll(async () => {
    await frogbot?.destroy();
    await model?.close();
    await new Promise<void>((resolve) => slack.close(() => resolve()));

    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('compacts a long channel thread and posts only the reply', async () => {
    const thread = '3.000001';

    model.respond({
      text: 'Frogs sing to attract mates.',
      usage: { prompt_tokens: 3_700, completion_tokens: 5 },
    });

    await say('Why do frogs sing?', thread, thread);

    model.respond({ text: 'Mostly at night.' });

    await say('When do they sing?', thread, '3.000002');

    const { docs } = await frogbot.find({
      collection: 'messages',
      where: { role: { equals: 'assistant' } },
      sort: 'createdAt',
      limit: 0,
      overrideAccess: true,
    });

    const posted = JSON.stringify(slackCalls.map(({ body }) => body));

    expect(model.summaryRequests).toHaveLength(1);
    expect(JSON.stringify(model.requests[1].messages)).toContain('<conversation-checkpoint>');
    expect(JSON.stringify(docs[1].parts)).toContain('"status":"completed"');
    expect(posted).toContain('Mostly at night.');
    expect(posted).not.toContain('## Objective');
    expect(posted).not.toContain('conversation-checkpoint');
  });
});
