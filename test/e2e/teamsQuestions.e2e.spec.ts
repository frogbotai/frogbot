import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { AgentModelId, FrogBotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';
import { FrogBot } from 'frogbot/test';
import { question } from 'frogbot/tools';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMicrosoftTeams } from '../../packages/pieces/piece-microsoft-teams/dist/index.js';
import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel.js';
import {
  botAppId,
  botAppPassword,
  cardInputs,
  cardOf,
  members,
  mentionActivity,
  startTeamsServer,
  submitActivity,
  type TeamsMember,
  type TeamsServer,
} from '../unit/frogbot/channels/teamsFixtures.js';
import { startPieceServer } from './nativePieceServers.js';

const RUN_E2E = process.env.RUN_E2E === '1';
const modelPort = 4096;

type ToolMessage = { role: string; content?: unknown };

describe.skipIf(!RUN_E2E)('Teams questions e2e — signed webhooks to a persisted reply', () => {
  let frogbot: FrogBotInstance;
  let model: StubChatModel;
  let server: Awaited<ReturnType<typeof startPieceServer>>;
  let teams: TeamsServer;
  let dataDir: string;

  const conversation = (root: string) => `19:general@thread.tacv2;messageid=${root}`;

  const inThread = (root: string) => (request: { conversationId?: string }) =>
    request.conversationId === conversation(root);

  const cards = (root: string) => teams.cards().filter(inThread(root));

  const updates = (root: string) => teams.updates().filter(inThread(root));

  const notices = (root: string) =>
    teams
      .targeted()
      .filter(inThread(root))
      .map(({ body }) => ({ user: body.recipient?.id, text: body.text }));

  const replies = (root: string) =>
    teams.requests
      .filter(inThread(root))
      .filter(({ method, targeted, body }) => method === 'POST' && !targeted && body.text)
      .map(({ body }) => body.text as string);

  async function webhook(activity: Record<string, unknown>) {
    const response = await fetch(`${server.url}/api/webhooks/teams`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${teams.botToken()}`,
      },
      body: JSON.stringify(activity),
      signal: AbortSignal.timeout(20_000),
    });

    expect(response.status).toBe(200);
  }

  async function work() {
    await frogbot.jobs.run({ allQueues: true, limit: 20 });
  }

  async function mention({ root, text }: { root: string; text: string }) {
    await webhook(mentionActivity({ id: root, root, text, serviceUrl: teams.serviceUrl }));
    await work();
  }

  async function submit({
    action,
    card,
    from = members.grace,
    root,
    toolCallId,
    values,
  }: {
    action?: 'submit' | 'dismiss';
    card: string;
    from?: TeamsMember;
    root: string;
    toolCallId: string;
    values?: Record<string, string>;
  }) {
    await webhook(
      submitActivity({
        action,
        card,
        from,
        root,
        serviceUrl: teams.serviceUrl,
        toolCallId,
        values,
      }),
    );
  }

  function toolResults() {
    return (model.requests.at(-1)!.messages as ToolMessage[])
      .filter(({ role }) => role === 'tool')
      .map(({ content }) => JSON.parse(String(content)));
  }

  beforeAll(async () => {
    teams = await startTeamsServer();
    teams.interceptLogin();
    model = await startStubChatModel(modelPort);
    dataDir = mkdtempSync(join(tmpdir(), 'frogbot-teams-e2e-'));

    const config = await buildConfig({
      secret: 'teams-questions-e2e-secret',
      telemetry: false,
      db: sqliteAdapter({ client: { url: `file:${join(dataDir, 'teams.db')}` } }),
      typescript: { autoGenerate: false },
      admin: { user: 'users' },
      jobs: { autoRun: [], shouldAutoRun: () => false },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'chats', chat: true, fields: [] },
      ],
      ai: {
        providers: {
          local: {
            type: 'openai-compatible',
            baseUrl: `http://127.0.0.1:${modelPort}/v1`,
            apiKey: 'test-key',
            models: [{ id: 'teams-e2e', mode: 'chat' }],
          },
        },
      },
      agents: [
        {
          slug: 'support',
          model: 'local/teams-e2e' as AgentModelId,
          instructions: 'Ask before acting.',
          tools: [question],
          channels: [
            createMicrosoftTeams({
              slug: 'teams',
              auth: { appId: botAppId, appPassword: botAppPassword },
              botApiUrl: teams.url,
            }),
          ],
        },
      ],
    });

    frogbot = await new FrogBot().init({ config });

    const app = new Hono();

    app.all('/api/*', (context) => frogbot.handleRequest(context.req.raw.clone()));

    server = await startPieceServer(app);

    for (const email of ['ada@example.com', 'grace@example.com']) {
      await frogbot.create({
        collection: 'users' as never,
        data: { email, password: 'teams-e2e-password' } as never,
        overrideAccess: true,
      });
    }
  });

  beforeEach(() => {
    model.reset();
  });

  afterAll(async () => {
    try {
      const results = await Promise.allSettled([
        server?.close(),
        frogbot?.destroy(),
        model?.close(),
        teams?.close(),
      ]);

      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
      }
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();

      if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('asks on a native card, takes a teammate’s answer, and replies in the thread', async () => {
    const root = '2001';

    model.respond({
      toolCalls: [
        {
          id: 'call-paint',
          name: 'question',
          input: {
            questions: [
              {
                header: 'Colors',
                question: 'Which colors should the fence be?',
                options: [
                  { label: 'Red, barn', description: 'The classic' },
                  { label: 'Blue “navy”' },
                  { label: 'White' },
                ],
                multiple: true,
              },
              {
                header: 'Finish',
                question: 'Which finish?',
                options: [{ label: 'Matte' }, { label: 'Gloss' }],
                custom: false,
              },
            ],
          },
        },
      ],
    });

    await mention({ root, text: 'Paint the fence' });

    const [card] = cards(root);

    expect(replies(root)).toEqual([]);
    expect(cardOf(card)).toMatchObject({ type: 'AdaptiveCard', version: '1.5' });
    expect(
      cardInputs(card).map(({ id, isMultiSelect, choices }) => ({ id, isMultiSelect, choices })),
    ).toEqual([
      {
        id: 'question-0',
        isMultiSelect: true,
        choices: [
          { title: 'Red, barn — The classic', value: '0' },
          { title: 'Blue “navy”', value: '1' },
          { title: 'White', value: '2' },
        ],
      },
      { id: 'question-0-text', isMultiSelect: undefined, choices: undefined },
      {
        id: 'question-1',
        isMultiSelect: false,
        choices: [
          { title: 'Matte', value: '0' },
          { title: 'Gloss', value: '1' },
        ],
      },
    ]);

    model.respond({ text: 'Painting it red and navy, matte, with a teal trim.' });

    await submit({
      card: card!.sentId!,
      root,
      toolCallId: 'call-paint',
      values: { 'question-0': '1,0', 'question-0-text': 'Teal trim', 'question-1': '0' },
    });

    const [settled] = updates(root);

    expect(settled).toMatchObject({ activityId: card!.sentId });
    expect(cardInputs(settled)).toEqual([]);
    expect(JSON.stringify(cardOf(settled))).toContain('Answered by Grace Hopper');

    await work();

    expect(toolResults()).toEqual([
      {
        answers: [
          { header: 'Colors', selected: ['Red, barn', 'Blue “navy”'], custom: 'Teal trim' },
          { header: 'Finish', selected: ['Matte'] },
        ],
      },
    ]);
    expect(replies(root)).toEqual(['Painting it red and navy, matte, with a teal trim.']);
    expect(teams.unexpected).toEqual([]);
  });

  it('refuses an unlinked responder, accepts a teammate, and tells a late click it is stale', async () => {
    const root = '2002';

    model.respond({
      toolCalls: [
        {
          id: 'call-guarded',
          name: 'question',
          input: {
            questions: [
              {
                header: 'Deploy',
                question: 'Deploy now?',
                options: [{ label: 'Yes' }, { label: 'No' }],
              },
            ],
          },
        },
      ],
    });

    await mention({ root, text: 'Ship it' });

    const card = cards(root)[0]!.sentId!;

    await submit({
      card,
      from: members.mallory,
      root,
      toolCallId: 'call-guarded',
      values: { 'question-0': '0' },
    });

    expect(notices(root)).toEqual([
      { user: '29:mallory', text: "You don't have access to answer this question." },
    ]);
    expect(updates(root)).toEqual([]);

    model.respond({ text: 'Holding the deploy.' });

    await submit({ card, root, toolCallId: 'call-guarded', values: { 'question-0': '1' } });
    await submit({
      card,
      from: members.ada,
      root,
      toolCallId: 'call-guarded',
      values: { 'question-0': '0' },
    });

    expect(notices(root).at(-1)).toEqual({
      user: '29:ada',
      text: 'This question was already answered.',
    });

    await work();

    expect(toolResults()).toEqual([{ answers: [{ header: 'Deploy', selected: ['No'] }] }]);
    expect(replies(root)).toEqual(['Holding the deploy.']);
  });

  it('walks sibling questions one card at a time and continues once', async () => {
    const root = '2003';

    model.respond({
      toolCalls: [
        {
          id: 'call-first',
          name: 'question',
          input: {
            questions: [
              {
                header: 'Color',
                question: 'Which color?',
                options: [{ label: 'Red' }, { label: 'Blue' }],
              },
            ],
          },
        },
        {
          id: 'call-second',
          name: 'question',
          input: {
            questions: [
              {
                header: 'Size',
                question: 'Which size?',
                options: [{ label: 'S' }, { label: 'L' }],
              },
            ],
          },
        },
      ],
    });

    await mention({ root, text: 'Order a shirt' });

    expect(cards(root)).toHaveLength(1);

    await submit({
      card: cards(root)[0]!.sentId!,
      root,
      toolCallId: 'call-first',
      values: { 'question-0': '1' },
    });

    expect(cards(root)).toHaveLength(2);
    expect(cardOf(cards(root)[1])!.actions![0]!.data).toMatchObject({ value: 'call-second' });

    await work();

    expect(model.requests).toHaveLength(1);

    model.respond({ text: 'A large blue shirt.' });

    await submit({
      card: cards(root)[1]!.sentId!,
      root,
      toolCallId: 'call-second',
      values: { 'question-0': '1' },
    });

    await work();

    expect(toolResults()).toEqual([
      { answers: [{ header: 'Color', selected: ['Blue'] }] },
      { answers: [{ header: 'Size', selected: ['L'] }] },
    ]);
    expect(replies(root)).toEqual(['A large blue shirt.']);
  });
});
