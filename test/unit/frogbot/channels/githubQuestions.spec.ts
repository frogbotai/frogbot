import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingCall } from '../../../../packages/frogbot/src/chat/turn/types.js';
import { question } from '../../../../packages/frogbot/src/tools/question.js';
import { createGitHubAdapter } from '../../../../packages/pieces/piece-github/node_modules/@chat-adapter/github/dist/index.js';
import { githubQuestions } from '../../../../packages/pieces/piece-github/src/questions/index.js';
import {
  assertGithubTraffic,
  type GithubApi,
  githubApp,
  type GithubPerson,
  githubWebhookSecret,
  issueComment,
  issuePath,
  nextCommentId,
  replyPath,
  reviewComment,
  startGithubApi,
} from './githubFixtures.js';
import { channelFixture } from './helpers.js';

vi.mock('frogbot/pieces', () => import('../../../../packages/frogbot/src/exports/pieces.js'));

const { continueTurn, listPendingCalls, settleClientToolCall } = vi.hoisted(() => ({
  continueTurn: vi.fn(),
  listPendingCalls: vi.fn(),
  settleClientToolCall: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/src/chat/turn/settle.js', () => ({
  listPendingCalls,
  settleClientToolCall,
}));

vi.mock('../../../../packages/frogbot/src/chat/turn/continueTurn.js', () => ({ continueTurn }));

type Fixture = ReturnType<typeof channelFixture>;

type Location =
  | { kind: 'issue'; issue: number }
  | { kind: 'pull'; issue: number }
  | { kind: 'review'; root: number };

const octocat: GithubPerson = { id: 42, login: 'octocat' };
const hubot: GithubPerson = { id: 43, login: 'hubot' };
const mallory: GithubPerson = { id: 66, login: 'mallory' };

const issue: Location = { kind: 'issue', issue: 12 };

const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };

let api: GithubApi;
const fixtures: Fixture[] = [];

function pendingCall({
  toolCallId = 'call-1',
  questions = [
    {
      header: 'Color',
      question: 'Pick a color',
      options: [{ label: 'Red *hot*' }, { label: 'Blue @team' }],
      custom: true,
    },
  ],
}: {
  toolCallId?: string;
  questions?: Array<Record<string, unknown>>;
} = {}): PendingCall {
  return {
    toolCallId,
    toolName: 'question',
    input: { questions },
    messageId: 'assistant-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-26T00:00:00.000Z',
  };
}

const colorSet = pendingCall({
  questions: [
    { header: 'Color', question: 'Color?', options: [{ label: 'Red' }, { label: 'Blue' }] },
    {
      header: 'Size',
      question: 'Size?',
      options: [{ label: 'S' }, { label: 'L' }],
      multiple: true,
      custom: false,
    },
  ],
});

function questionPath(location: Location): string {
  if (location.kind === 'review') return replyPath({ root: location.root });

  return issuePath(location.issue);
}

function comment({
  body,
  location = issue,
  person = hubot,
  ...rest
}: {
  body: string;
  id?: number;
  location?: Location;
  person?: GithubPerson;
  action?: 'created' | 'edited';
}) {
  if (location.kind === 'review') {
    return reviewComment({ body, inReplyTo: location.root, person, ...rest });
  }

  return issueComment({
    body,
    issue: location.issue,
    person,
    pullRequest: location.kind === 'pull',
    ...rest,
  });
}

async function asked({
  calls = [pendingCall()],
  location = issue,
}: {
  calls?: PendingCall[];
  location?: Location;
} = {}) {
  const fixture = channelFixture({
    slug: 'github',
    adapter: createGitHubAdapter({
      ...githubApp,
      apiUrl: api.url,
      botUserId: 99,
      logger: silent,
      userName: 'frogbot',
      webhookSecret: githubWebhookSecret,
    }),
    questions: githubQuestions as never,
  });

  fixtures.push(fixture);

  Object.assign(fixture.frogbot.agents.support.config, { tools: [question] });

  await fixture.host.initialize(false);

  const mention =
    location.kind === 'review'
      ? reviewComment({ body: '@frogbot help', id: location.root, person: octocat })
      : comment({ body: '@frogbot help', location, person: octocat });

  await fixture.host.webhook('github', mention);

  listPendingCalls.mockResolvedValueOnce(calls);

  await fixture.host.run(JSON.parse(JSON.stringify(fixture.inputs[0])));

  const posted = api.posts(questionPath(location));

  return { fixture, posted, question: posted.at(-1)! };
}

async function say({
  fixture,
  ...args
}: Parameters<typeof comment>[0] & { fixture: Fixture }): Promise<void> {
  const before = fixture.inputs.length;

  await fixture.host.webhook('github', comment(args));

  if (fixture.inputs.length === before) return;

  await fixture.host.run(JSON.parse(JSON.stringify(fixture.inputs[before])));
}

function record(fixture: Fixture, toolCallId = 'call-1') {
  return [...fixture.values].find(([key]) =>
    key.endsWith(`:questions:call:chat-1:${toolCallId}`),
  )?.[1] as {
    messages: unknown[];
    revision: number;
    state?: unknown;
    settled?: unknown;
    pending?: unknown;
  };
}

function since(before: number) {
  return api.calls.slice(before).map(({ method, path, body }) => ({ method, path, body }));
}

function notices(before: number, location: Location = issue) {
  return since(before)
    .filter(({ method, path }) => method === 'POST' && path === questionPath(location))
    .map(({ body }) => body.body);
}

describe('GitHub native questions through the channel host', () => {
  beforeAll(async () => {
    api = await startGithubApi();
  });

  afterAll(async () => {
    await api.close();
  });

  beforeEach(() => {
    api.reset();
    listPendingCalls.mockReset().mockResolvedValue([]);
    settleClientToolCall.mockReset().mockResolvedValue({
      status: 'settled',
      part: {},
      allSettled: true,
    });
    continueTurn.mockReset();
  });

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map(({ host }) => host.shutdown()));

    assertGithubTraffic({ api });
  });

  it.each<[string, Location]>([
    ['an issue', issue],
    ['a pull request conversation', { kind: 'pull', issue: 7 }],
    ['a review comment thread', { kind: 'review', root: 5_000 }],
  ])('offers the question tool and posts the question comment in %s', async (_, location) => {
    const { fixture, posted, question: comment } = await asked({ location });

    expect(fixture.streamMessage.mock.calls[0][0].clientTools).toEqual({ kinds: ['question'] });
    expect(posted.map(({ body }) => body)).toEqual([
      'Hello back',
      expect.stringContaining('### Color'),
    ]);
    expect(comment.body).toContain('1. **Red \\*hot\\***\n2. **Blue @\u200bteam**');
    expect(record(fixture)).toMatchObject({
      messages: [{ id: comment.id, postedAt: expect.stringMatching(/Z$/), question: 0 }],
      revision: 0,
      state: { q: 0, answers: [], by: [] },
    });
  });

  it('settles /answer with the exact label, rewrites the comment, and queues one continuation', async () => {
    const { fixture, question: comment } = await asked();
    const before = api.calls.length;

    await say({ fixture, body: '/answer 2' });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(settleClientToolCall.mock.calls[0][0]).toMatchObject({
      outcome: { output: { answers: [{ header: 'Color', selected: ['Blue @team'] }] } },
      actor: { channel: { piece: 'github', account: 'github', id: '43', username: 'hubot' } },
    });
    expect(since(before)).toEqual([
      {
        method: 'PATCH',
        path: `/repos/frogbotai/frogbot/issues/comments/${comment.id}`,
        body: { body: expect.stringContaining('✅ **Blue @\u200bteam**') },
      },
    ]);
    expect(api.edits(comment.id)[0].body).toContain('<sub>Answered by `@hubot`</sub>');
    expect(fixture.streamMessage).toHaveBeenCalledOnce();
    expect(fixture.inputs.at(-1)).toMatchObject({ kind: 'continue', responder: { userId: '43' } });
  });

  it('settles in a review thread through the review comment endpoints', async () => {
    const location: Location = { kind: 'review', root: 6_000 };
    const { fixture, question: comment } = await asked({ location });

    await say({ fixture, body: '/answer "Teal"', location });

    expect(settleClientToolCall.mock.calls[0][0].outcome).toEqual({
      output: { answers: [{ header: 'Color', selected: [], custom: 'Teal' }] },
    });
    expect(api.edits(comment.id)).toEqual([
      { id: comment.id, body: expect.stringContaining('✅ **“Teal”**') },
    ]);
    expect(api.calls.at(-1)!.path).toBe(`/repos/frogbotai/frogbot/pulls/comments/${comment.id}`);
  });

  it('walks a question set one comment at a time, then settles every answer', async () => {
    const { fixture, question: first } = await asked({ calls: [colorSet] });

    await say({ fixture, body: '/answer 2', person: octocat });

    const second = api.posts(issuePath()).at(-1)!;

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(second.body).toContain('### Size · Question 2 of 2');
    expect(api.edits(first.id)[0].body).toContain('Answered by `@octocat`');
    expect(record(fixture)).toMatchObject({
      messages: [
        { id: first.id, question: 0 },
        { id: second.id, question: 1 },
      ],
      revision: 1,
    });
    expect(record(fixture).pending).toBeUndefined();

    await say({ fixture, body: '/answer 2, 1' });

    expect(settleClientToolCall.mock.calls[0][0].outcome).toEqual({
      output: {
        answers: [
          { header: 'Color', selected: ['Blue'] },
          { header: 'Size', selected: ['S', 'L'] },
        ],
      },
    });
    expect(api.edits(first.id).at(-1)!.body).toContain('Answered by `@octocat`');
    expect(api.edits(second.id).at(-1)!.body).toContain('Answered by `@hubot`');
    expect(fixture.inputs.filter(({ kind }) => kind === 'continue')).toHaveLength(1);
  });

  it('tells a racing reply to the first question that it came too late, without applying it', async () => {
    const { fixture } = await asked({ calls: [colorSet] });
    const racing = nextCommentId();

    await say({ fixture, body: '/answer 1', person: octocat });

    const before = api.calls.length;

    await say({ fixture, body: '/answer 2', id: racing });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(record(fixture)).toMatchObject({ revision: 1 });
    expect(notices(before)).toEqual([
      '`@hubot` That reply was for an earlier question. Answer question 2 of 2 instead.',
    ]);
    expect(fixture.streamMessage).toHaveBeenCalledOnce();
  });

  it('holds answers while the next question fails to post, then posts it from the update job', async () => {
    const { fixture } = await asked({ calls: [colorSet] });

    api.fail({ method: 'POST', path: issuePath() });

    await say({ fixture, body: '/answer 1', person: octocat });

    const update = fixture.inputs.at(-1)!;

    expect(update).toMatchObject({ kind: 'update', toolCallId: 'call-1', revision: 1 });

    const before = api.calls.length;

    await say({ fixture, body: '/answer 1' });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(notices(before)).toEqual([
      '`@hubot` The next question is still posting — try again in a moment. Nothing was recorded, so read the next question before you answer again.',
    ]);

    await fixture.host.run(JSON.parse(JSON.stringify(update)));

    const second = api.posts(issuePath()).at(-1)!;

    expect(second.body).toContain('### Size · Question 2 of 2');
    expect(record(fixture).pending).toBeUndefined();

    await say({ fixture, body: '/answer 1' });

    expect(settleClientToolCall.mock.calls[0][0].outcome).toEqual({
      output: {
        answers: [
          { header: 'Color', selected: ['Red'] },
          { header: 'Size', selected: ['S'] },
        ],
      },
    });
  });

  it('posts the next call’s question after the first is answered', async () => {
    const { fixture } = await asked({
      calls: [pendingCall(), pendingCall({ toolCallId: 'call-2' })],
    });

    expect(api.posts(issuePath())).toHaveLength(2);

    settleClientToolCall.mockResolvedValueOnce({ status: 'settled', part: {}, allSettled: false });
    listPendingCalls.mockResolvedValueOnce([pendingCall({ toolCallId: 'call-2' })]);

    await say({ fixture, body: '/answer 1' });

    expect(api.posts(issuePath())).toHaveLength(3);
    expect(record(fixture, 'call-2')).toMatchObject({ revision: 0 });
    expect(fixture.inputs.filter(({ kind }) => kind === 'continue')).toEqual([]);
  });

  it('dismisses without queueing a continuation', async () => {
    const { fixture, question: comment } = await asked();
    const jobs = fixture.inputs.length;

    await say({ fixture, body: '/dismiss' });

    expect(settleClientToolCall.mock.calls[0][0].outcome).toEqual({ dismissed: true });
    expect(api.edits(comment.id)[0].body).toContain('<sub>Dismissed by `@hubot`</sub>');
    expect(fixture.inputs.slice(jobs + 1)).toEqual([]);
  });

  it('explains a malformed answer in a reply and keeps the question open', async () => {
    const { fixture } = await asked();
    const before = api.calls.length;

    await say({ fixture, body: '/answer 7' });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(notices(before)).toEqual([
      expect.stringMatching(/^`@hubot` There's no option 7\. Choose a number from 1 to 2\.\n\n/),
    ]);
    expect(fixture.streamMessage).toHaveBeenCalledOnce();
    expect(record(fixture)).toMatchObject({ revision: 0 });
  });

  it('passes ordinary discussion to the agent while a question waits', async () => {
    const { fixture } = await asked();

    await say({ fixture, body: 'Why do you need a color?' });
    await say({ fixture, body: '> /answer 1\nquoting the bot' });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.streamMessage).toHaveBeenCalledTimes(3);
  });

  it('does not answer a question from another issue', async () => {
    const { fixture } = await asked();

    await say({ fixture, body: '/answer 1', location: { kind: 'issue', issue: 13 } });

    expect(settleClientToolCall).not.toHaveBeenCalled();
  });

  it('treats an answer in a review thread as a separate conversation from the pull request', async () => {
    const { fixture } = await asked({ location: { kind: 'pull', issue: 7 } });

    await say({ fixture, body: '/answer 1', location: { kind: 'review', root: 7_000 } });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.streamMessage).toHaveBeenCalledOnce();
  });

  it('ignores an edited comment', async () => {
    const { fixture } = await asked();
    const before = api.calls.length;
    const jobs = fixture.inputs.length;

    await fixture.host.webhook('github', comment({ body: '/answer 1', action: 'edited' }));

    expect(fixture.inputs).toHaveLength(jobs);
    expect(since(before)).toEqual([]);
  });

  it('treats another bot’s command as discussion', async () => {
    const { fixture } = await asked();

    await say({ fixture, body: '/answer 1', person: { id: 7, login: 'ci[bot]', bot: true } });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.streamMessage).toHaveBeenCalledTimes(2);
  });

  it('settles once when GitHub redelivers the same comment', async () => {
    const { fixture } = await asked();
    const id = nextCommentId();

    await say({ fixture, body: '/answer 1', id });
    await say({ fixture, body: '/answer 1', id });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
  });

  it('tells a commenter without access and keeps the question open', async () => {
    const { fixture } = await asked();

    fixture.access.mockReturnValue(false);

    const before = api.calls.length;

    await say({ fixture, body: '/answer 1', person: mallory });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(notices(before)).toEqual(["`@mallory` doesn't have access to answer this question."]);
    expect(record(fixture)).toMatchObject({ revision: 0 });
    expect(record(fixture).settled).toBeUndefined();
  });

  it('tells a late answer who already answered, without sending it to the agent', async () => {
    const { fixture } = await asked();

    await say({ fixture, body: '/answer 1' });

    const before = api.calls.length;

    await say({ fixture, body: '/answer 2', person: octocat });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(notices(before)).toEqual(['`@octocat` This question was already answered by `@hubot`.']);
    expect(fixture.streamMessage).toHaveBeenCalledOnce();
  });
});
