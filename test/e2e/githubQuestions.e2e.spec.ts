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

import { createGithub } from '../../packages/pieces/piece-github/src/index.js';
import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel.js';
import { testPort } from '../__helpers/shared/testPorts.js';
import {
  assertGithubTraffic,
  type GithubApi,
  githubApp,
  type GithubPerson,
  githubWebhookSecret,
  issueComment,
  issuePath,
  redirectGithub,
  startGithubApi,
} from '../unit/frogbot/channels/githubFixtures.js';
import { startPieceServer } from './nativePieceServers.js';

const RUN_E2E = process.env.RUN_E2E === '1';
const MODEL_PORT = testPort(4097);
const CHANNEL_TASKS = ['frogbot-run-channel-message', 'frogbot-update-channel-question'];

type ChannelJob = { input: { kind?: string; thread: { id: string } } };

const alice: GithubPerson = { id: 41, login: 'alice', email: 'alice@example.com' };
const bob: GithubPerson = { id: 42, login: 'bob', email: 'bob@example.com' };
const mallory: GithubPerson = { id: 66, login: 'mallory' };

const paint: QuestionInput = {
  questions: [
    {
      header: 'Finish',
      question: 'Which finish should the **front door** get?',
      options: [
        { label: 'Matte (flat)', description: 'No shine; hides flaws' },
        { label: 'Eggshell', description: 'A soft glow' },
        { label: 'Satin — washable', description: 'Good for hands & paws' },
        { label: 'Semi-gloss', description: 'Shiny; shows brush marks' },
        { label: 'High gloss ✨', description: 'Mirror-like' },
        { label: 'Chalk_paint', description: 'Distressed look' },
        { label: '*Undecided*', description: 'Ask @design again #12' },
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

function rendered(markdown: string): string {
  return markdown.replaceAll('\u200b', '').replace(/\\(.)/g, '$1');
}

describe.skipIf(!RUN_E2E)('GitHub questions e2e — webhook to continuation over HTTP', () => {
  let api: GithubApi;
  let blocked: string[];
  let dataDir: string;
  let frogbot: FrogBotInstance;
  let model: StubChatModel;
  let server: Awaited<ReturnType<typeof startPieceServer>>;

  const threadId = (issue: number) => `github:frogbotai/frogbot:issue:${issue}`;

  async function channelJobs(where: Record<string, unknown> = {}): Promise<ChannelJob[]> {
    const result = await frogbot.find({
      collection: 'payload-jobs' as never,
      where: { and: [{ taskSlug: { in: CHANNEL_TASKS } }, where] },
      sort: 'createdAt',
      limit: 0,
      overrideAccess: true,
    });

    return result.docs;
  }

  async function kinds(issue: number): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    (await channelJobs())
      .filter(({ input }) => input.thread.id === threadId(issue))
      .map(({ input }) => input.kind ?? 'message')
      .filter((kind) => kind !== 'promote')
      .forEach((kind) => {
        counts[kind] = (counts[kind] ?? 0) + 1;
      });

    return counts;
  }

  async function work() {
    await expect
      .poll(
        async () => {
          await frogbot.jobs.run({ allQueues: true, req: await frogbot.createRequest() });

          return (
            await channelJobs({ completedAt: { exists: false }, hasError: { not_equals: true } })
          ).length;
        },
        { timeout: 20_000, interval: 50 },
      )
      .toBe(0);

    expect(await channelJobs({ hasError: { equals: true } })).toEqual([]);
  }

  async function comment({
    body,
    issue,
    person = bob,
  }: {
    body: string;
    issue: number;
    person?: GithubPerson;
  }) {
    const request = issueComment({ body, issue, person });

    const response = await fetch(`${server.url}/api/webhooks/github`, {
      method: 'POST',
      headers: request.headers,
      body: await request.text(),
      signal: AbortSignal.timeout(20_000),
    });

    expect(response.status).toBe(200);

    await work();
  }

  function comments(issue: number) {
    return api.posts(issuePath(issue));
  }

  function bodies(issue: number) {
    return comments(issue).map(({ body }) => body);
  }

  function toolResults() {
    return model.requests
      .at(-1)!
      .messages.filter(({ role }) => role === 'tool')
      .map(({ content }) => JSON.parse(String(content)));
  }

  beforeAll(async () => {
    api = await startGithubApi({ people: [alice, bob, mallory] });
    model = await startStubChatModel(MODEL_PORT);

    const redirect = redirectGithub({ api, fetch: globalThis.fetch });

    blocked = redirect.blocked;
    vi.stubGlobal('fetch', redirect.fetch);

    dataDir = mkdtempSync(join(tmpdir(), 'frogbot-github-questions-e2e-'));

    const config = await buildConfig({
      secret: 'github-questions-e2e-secret',
      telemetry: false,
      db: sqliteAdapter({ client: { url: `file:${join(dataDir, 'github.db')}` } }),
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
            models: [{ id: 'github-e2e', mode: 'chat' }],
          },
        },
      },
      agents: [
        {
          slug: 'support',
          model: 'local/github-e2e' as AgentModelId,
          instructions: 'Ask before acting.',
          tools: [question],
          channels: [
            createGithub({
              auth: githubApp,
              webhookSecret: githubWebhookSecret,
              botUsername: 'frogbot',
              botUserId: 99,
            }),
          ],
        },
      ],
    });

    frogbot = await new FrogBot().init({ config, startChannelGateway: false });

    await Promise.all(
      [alice, bob].map(({ email }) =>
        frogbot.create({
          collection: 'users' as never,
          data: { email: email!, password: 'github-questions-e2e' } as never,
          overrideAccess: true,
        }),
      ),
    );

    const app = new Hono();

    app.all('/api/*', (context) => frogbot.handleRequest(context.req.raw.clone()));

    server = await startPieceServer(app);
  });

  beforeEach(() => {
    model.reset();
    api.reset();
  });

  afterEach(() => {
    assertGithubTraffic({ api, blocked });
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

  it('asks in the issue, takes a teammate’s signed /answer, and posts the continued reply', async () => {
    const issue = 201;
    const toolCallId = 'e2e-finish';

    model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input: paint }] });

    await comment({ body: '@frogbot paint the door', issue, person: alice });

    const [asked] = comments(issue);
    const options = asked.body.split('\n').filter((line) => /^\d+\. /.test(line));

    expect(model.requests[0].tools?.map(({ function: tool }) => tool.name)).toContain('question');
    expect(bodies(issue)).toEqual([asked.body]);
    expect(asked.body.startsWith('### Finish\n\n')).toBe(true);
    expect(rendered(asked.body)).toContain('Which finish should the **front door** get?');
    expect(options.map((line) => rendered(line))).toEqual(
      paint.questions[0].options.map(
        ({ label, description }, index) => `${index + 1}. **${label}** — ${description}`,
      ),
    );
    expect(asked.body).not.toMatch(/@design|#12/);
    expect(asked.body).toContain('- `/answer "your answer"` to answer in your own words');

    model.respond({ text: 'Going with satin on the front door.' });

    await comment({ body: '/answer 3', issue });

    expect(api.edits(asked.id)).toEqual([
      { id: asked.id, body: expect.stringContaining('<sub>Answered by `@bob`</sub>') },
    ]);
    expect(rendered(api.edits(asked.id)[0].body)).toContain('✅ **Satin — washable**');
    expect(toolResults()).toEqual([
      { answers: [{ header: 'Finish', selected: ['Satin — washable'] }] },
    ]);
    expect(await kinds(issue)).toEqual({ message: 2, continue: 1 });
    expect(bodies(issue).at(-1)).toBe('Going with satin on the front door.');

    await comment({ body: '/answer 1', issue, person: alice });

    expect(bodies(issue).at(-1)).toBe('`@alice` This question was already answered by `@bob`.');
    expect(model.requests).toHaveLength(2);
  });

  it('refuses a commenter the agent’s access does not admit, and explains a malformed answer', async () => {
    const issue = 202;

    model.respond({ toolCalls: [{ id: 'e2e-denied', name: 'question', input: paint }] });

    await comment({ body: '@frogbot paint the door', issue, person: alice });

    const [asked] = comments(issue);

    await comment({ body: '/dismiss', issue, person: mallory });
    await comment({ body: '/answer 9', issue });

    expect(bodies(issue).slice(1)).toEqual([
      "`@mallory` doesn't have access to answer this question.",
      expect.stringMatching(/^`@bob` There's no option 9\. Choose a number from 1 to 7\.\n\n/),
    ]);
    expect(api.edits(asked.id)).toEqual([]);
    expect(model.requests).toHaveLength(1);
    expect(await kinds(issue)).toEqual({ message: 3 });
  });

  it('walks a three-question set one comment at a time, then continues once', async () => {
    const issue = 203;

    model.respond({ toolCalls: [{ id: 'e2e-order', name: 'question', input: order }] });

    await comment({ body: '@frogbot order a pizza', issue, person: alice });
    await comment({ body: '/answer 3', issue, person: alice });
    await comment({ body: '/answer 3, 1', issue });

    const asked = comments(issue);

    expect(asked.map(({ body }) => body.split('\n')[0])).toEqual([
      '### Size · Question 1 of 3',
      '### Toppings · Question 2 of 3',
      '### Notes · Question 3 of 3',
    ]);
    expect(api.edits(asked[0].id)[0].body).toContain('Answered by `@alice`');
    expect(rendered(api.edits(asked[1].id)[0].body)).toContain('✅ **Basil, Chili & honey**');
    expect(model.requests).toHaveLength(1);

    model.respond({ text: 'Large with basil and chili & honey, extra crispy.' });

    await comment({ body: '/answer "Extra crispy, please"', issue });

    expect(toolResults()).toEqual([
      {
        answers: [
          { header: 'Size', selected: ['Large'] },
          { header: 'Toppings', selected: ['Basil', 'Chili & honey'] },
          { header: 'Notes', selected: [], custom: 'Extra crispy, please' },
        ],
      },
    ]);
    expect(api.edits(asked[2].id).at(-1)!.body).toContain('Answered by `@bob`');
    expect(await kinds(issue)).toEqual({ message: 4, continue: 1 });
    expect(bodies(issue).at(-1)).toBe('Large with basil and chili & honey, extra crispy.');
  });
});
