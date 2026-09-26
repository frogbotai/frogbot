import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { text } from 'node:stream/consumers';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingCall } from '../../../../packages/frogbot/src/chat/turn/types.js';
import { question } from '../../../../packages/frogbot/src/tools/question.js';
import { createSlackAdapter } from '../../../../packages/pieces/piece-slack/node_modules/@chat-adapter/slack/dist/index.js';
import { slackQuestions } from '../../../../packages/pieces/piece-slack/src/questions/index.js';
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

const signingSecret = 'test-signing-secret';
const cardTs = '2.000001';
const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
const failures = new Map<string, string>();

const server = createServer(async (req, res) => {
  const method = req.url!.slice(1);
  const raw = await text(req);
  const body = raw.startsWith('{') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  const error = failures.get(method);

  calls.push({ method, body });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify(
      error ? { ok: false, error } : { ok: true, ts: cardTs, channel: 'C1', message: {} },
    ),
  );
});

function apiURL() {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}

function sign(body: string, contentType: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex');

  return new Request('http://localhost/webhook', {
    method: 'POST',
    body,
    headers: {
      'content-type': contentType,
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': `v0=${signature}`,
    },
  });
}

function mention() {
  return sign(
    JSON.stringify({
      type: 'event_callback',
      event_id: 'Ev1',
      team_id: 'T1',
      event: { type: 'app_mention', channel: 'C1', ts: '1.000001', text: 'Hi', user: 'U1' },
    }),
    'application/json',
  );
}

function interaction(payload: Record<string, unknown>) {
  return sign(
    `payload=${encodeURIComponent(JSON.stringify(payload))}`,
    'application/x-www-form-urlencoded',
  );
}

function blockAction({
  actionId,
  channel = 'C1',
  state,
  user = 'U2',
  value,
}: {
  actionId: string;
  channel?: string;
  state?: object;
  user?: string;
  value?: string;
}) {
  return interaction({
    type: 'block_actions',
    trigger_id: 'trigger-1',
    user: { id: user, username: 'toad', name: 'Toad' },
    channel: { id: channel },
    container: { type: 'message', channel_id: channel, message_ts: cardTs },
    message: { ts: cardTs, thread_ts: '1.000001' },
    actions: [{ action_id: actionId, ...(value === undefined ? {} : { value }) }],
    ...(state ? { state } : {}),
  });
}

function viewSubmission({ metadata, text: answer }: { metadata: string; text: string }) {
  return interaction({
    type: 'view_submission',
    user: { id: 'U2', username: 'toad', name: 'Toad' },
    view: {
      id: 'V1',
      callback_id: 'frogbot:question:custom',
      private_metadata: metadata,
      state: {
        values: {
          'frogbot:question:custom:call-1:0': {
            answer: { type: 'plain_text_input', value: answer },
          },
        },
      },
    },
  });
}

function pendingCall(input: Partial<PendingCall['input'] & object> = {}): PendingCall {
  return {
    toolCallId: 'call-1',
    toolName: 'question',
    input: {
      questions: [
        {
          header: 'Color',
          question: 'Pick a color',
          options: [{ label: 'Red' }, { label: 'Blue' }],
          custom: true,
        },
      ],
      ...input,
    },
    messageId: 'assistant-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-25T00:00:00.000Z',
  };
}

function lastCall(method: string) {
  return calls.filter((call) => call.method === method).at(-1)?.body;
}

async function askedFixture(call = pendingCall()) {
  const request = async (method: string, body: Record<string, unknown>) => {
    const response = await fetch(`${apiURL()}${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as { ok: boolean; error?: string };

    if (!result.ok) throw new Error(`Slack API request failed: ${result.error}`);

    return result;
  };

  const fixture = channelFixture({
    adapter: createSlackAdapter({
      botToken: 'xoxb-test',
      botUserId: 'UBOT',
      signingSecret,
      apiUrl: apiURL(),
      nativeStreaming: false,
      webClientOptions: { retryConfig: { retries: 0 } },
    }),
    client: { request },
    questions: slackQuestions,
  });

  Object.assign(fixture.frogbot.agents.support.config, { tools: [question] });
  fixture.identity.mockResolvedValue({ id: 'user-2', collection: 'users' } as never);

  await fixture.host.initialize(false);
  await fixture.host.webhook('slack', mention());

  listPendingCalls.mockResolvedValueOnce([call]);

  await fixture.host.run(JSON.parse(JSON.stringify(fixture.inputs[0])));

  return fixture;
}

describe('Slack native questions', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(() => {
    calls.length = 0;
    failures.clear();
    listPendingCalls.mockReset().mockResolvedValue([]);
    settleClientToolCall.mockReset().mockResolvedValue({
      status: 'settled',
      part: {},
      allSettled: true,
    });
    continueTurn.mockReset();
  });

  it('posts the question card in the thread', async () => {
    const fixture = await askedFixture();
    const card = lastCall('chat.postMessage');

    expect(card).toMatchObject({ channel: 'C1', thread_ts: '1.000001' });
    expect(JSON.stringify(card?.blocks)).toContain('frogbot:question:choose:call-1:0:1');

    await fixture.host.shutdown();
  });

  it('settles a button click and shows the answer and responder', async () => {
    const fixture = await askedFixture();

    const response = await fixture.host.webhook(
      'slack',
      blockAction({ actionId: 'frogbot:question:choose:call-1:0:0', value: '0' }),
    );

    expect(response?.status).toBe(200);
    expect(settleClientToolCall.mock.calls[0]![0]).toMatchObject({
      outcome: { output: { answers: [{ header: 'Color', selected: ['Red'] }] } },
      actor: { channel: { piece: 'slack', id: 'U2', username: 'toad' } },
    });

    const update = lastCall('chat.update');

    expect(update).toMatchObject({ channel: 'C1', ts: cardTs });
    expect(JSON.stringify(update?.blocks)).toContain('Answered by <@U2>');
    expect(fixture.inputs[1]).toMatchObject({ kind: 'continue', responder: { userId: 'U2' } });

    await fixture.host.webhook(
      'slack',
      blockAction({ actionId: 'frogbot:question:choose:call-1:0:1', value: '1', user: 'U3' }),
    );

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(lastCall('chat.postEphemeral')).toMatchObject({
      user: 'U3',
      thread_ts: '1.000001',
      text: 'This question was already answered.',
    });

    await fixture.host.shutdown();
  });

  it('sends a denied responder an ephemeral notice', async () => {
    const fixture = await askedFixture();

    fixture.access.mockReturnValue(false);

    await fixture.host.webhook(
      'slack',
      blockAction({ actionId: 'frogbot:question:dismiss:call-1' }),
    );

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(lastCall('chat.postEphemeral')).toMatchObject({
      user: 'U2',
      text: "You don't have access to answer this question.",
    });

    await fixture.host.shutdown();
  });

  it('ignores a click on the same card timestamp in another channel', async () => {
    const fixture = await askedFixture();
    const before = calls.length;

    await fixture.host.webhook(
      'slack',
      blockAction({ actionId: 'frogbot:question:dismiss:call-1', channel: 'C2' }),
    );

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(calls.slice(before).map(({ method }) => method)).not.toContain('chat.postEphemeral');

    await fixture.host.shutdown();
  });

  it('opens a typed-answer modal and settles its submission', async () => {
    const fixture = await askedFixture();

    await fixture.host.webhook(
      'slack',
      blockAction({ actionId: 'frogbot:question:custom:call-1:0' }),
    );

    const open = lastCall('views.open') as {
      trigger_id: string;
      view: { private_metadata: string };
    };

    expect(open.trigger_id).toBe('trigger-1');

    const response = await fixture.host.webhook(
      'slack',
      viewSubmission({ metadata: open.view.private_metadata, text: 'Green' }),
    );

    expect(response?.status).toBe(200);
    expect(settleClientToolCall.mock.calls[0]![0].outcome).toEqual({
      output: { answers: [{ header: 'Color', selected: [], custom: 'Green' }] },
    });

    await fixture.host.shutdown();
  });

  it('asks the user to try again when the modal trigger expired', async () => {
    const fixture = await askedFixture();

    failures.set('views.open', 'expired_trigger_id');

    await fixture.host.webhook(
      'slack',
      blockAction({ actionId: 'frogbot:question:custom:call-1:0' }),
    );

    expect(lastCall('chat.postEphemeral')?.text).toContain('took too long');

    await fixture.host.shutdown();
  });

  it('submits a multi-select form from its state values', async () => {
    const fixture = await askedFixture(
      pendingCall({
        questions: [
          {
            header: 'Colors',
            question: 'Pick colors',
            options: [{ label: 'Red' }, { label: 'Blue' }],
            multiple: true,
            custom: false,
          },
        ],
      }),
    );

    await fixture.host.webhook(
      'slack',
      blockAction({ actionId: 'frogbot:question:choose:call-1:0' }),
    );

    expect(settleClientToolCall).not.toHaveBeenCalled();

    await fixture.host.webhook(
      'slack',
      blockAction({
        actionId: 'frogbot:question:submit:call-1',
        state: {
          values: {
            'frogbot:question:call-1:0': {
              'frogbot:question:choose:call-1:0': {
                type: 'checkboxes',
                selected_options: [{ value: '1' }, { value: '0' }],
              },
            },
          },
        },
      }),
    );

    expect(settleClientToolCall.mock.calls[0]![0].outcome).toEqual({
      output: { answers: [{ header: 'Colors', selected: ['Red', 'Blue'] }] },
    });

    await fixture.host.shutdown();
  });
});
