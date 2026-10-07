import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PieceChannelQuestions } from '../../../../packages/frogbot/src/channels/questions/types.js';
import type { ChannelTaskInput } from '../../../../packages/frogbot/src/channels/types.js';
import type { PendingCall } from '../../../../packages/frogbot/src/chat/turn/types.js';
import { question } from '../../../../packages/frogbot/src/tools/question.js';
import { channelFixture } from './helpers.js';

const { listPendingCalls, settleClientToolCall } = vi.hoisted(() => ({
  listPendingCalls: vi.fn(),
  settleClientToolCall: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/src/chat/turn/settle.js', () => ({
  listPendingCalls,
  settleClientToolCall,
}));

const thread = 'channel:thread-1';

const card = { id: 'card-1', postedAt: '2026-09-26T00:00:00.000Z' };
const next = { id: 'card-2', postedAt: '2026-09-26T00:00:05.000Z' };

const recordKey = 'channels:support:slack:questions:call:chat-1:call-1';

const pendingCall: PendingCall = {
  toolCallId: 'call-1',
  toolName: 'question',
  input: {
    questions: [
      { header: 'Size', question: 'Pick a size', options: [{ label: 'S' }, { label: 'L' }] },
      { header: 'Color', question: 'Pick a color', options: [{ label: 'Red' }] },
    ],
  },
  messageId: 'assistant-1',
  chatId: 'chat-1',
  agentSlug: 'support',
  createdAt: '2026-09-26T00:00:00.000Z',
};

function questionHooks() {
  return {
    render: vi.fn<PieceChannelQuestions['render']>(({ calls }) =>
      Promise.resolve([{ messages: [card], calls: calls.map(({ toolCallId }) => toolCallId) }]),
    ),
    parse: vi.fn<PieceChannelQuestions['parse']>(({ interaction }) => {
      if (interaction.type !== 'action') return { kind: 'ignore' };

      if (interaction.event.actionId === 'next') return { kind: 'partial', state: { q: 1 } };

      return {
        kind: 'answer',
        output: {
          answers: [
            { header: 'Size', selected: ['S'] },
            { header: 'Color', selected: ['Red'] },
          ],
        },
      };
    }),
    settled: vi.fn<PieceChannelQuestions['settled']>(async () => {}),
    updated: vi.fn<NonNullable<PieceChannelQuestions['updated']>>(({ question }) =>
      Promise.resolve({ messages: [...question.messages, next] }),
    ),
    rejected: vi.fn<NonNullable<PieceChannelQuestions['rejected']>>(async () => {}),
    stale: vi.fn<NonNullable<PieceChannelQuestions['stale']>>(async () => {}),
  };
}

async function failedAdvance() {
  const hooks = questionHooks();
  const fixture = channelFixture({ questions: hooks });

  Object.assign(fixture.frogbot.agents.support.config, { tools: [question] });
  fixture.identity.mockResolvedValue({ id: 'user-1', collection: 'users' });

  await fixture.host.initialize(false);
  await fixture.deliver();

  listPendingCalls.mockResolvedValueOnce([pendingCall]);

  await fixture.host.run(fixture.inputs[0]);

  hooks.updated.mockRejectedValueOnce(new Error('Slack is down'));

  await fixture.interact(click('next', card.id));

  const update = fixture.inputs.find(
    (input): input is Extract<ChannelTaskInput, { kind: 'update' }> => input.kind === 'update',
  )!;

  return { fixture, hooks, update: JSON.parse(JSON.stringify(update)) as typeof update };
}

function click(actionId: string, messageId: string) {
  return { type: 'action', actionId, messageId, threadId: thread };
}

describe('channel question update job', () => {
  beforeEach(() => {
    listPendingCalls.mockReset().mockResolvedValue([]);

    settleClientToolCall.mockReset().mockResolvedValue({
      status: 'settled',
      part: {},
      allSettled: true,
    });
  });

  it('posts the next question without an interaction and clears the pending update', async () => {
    const { fixture, hooks, update } = await failedAdvance();

    await fixture.host.run(update);

    const args = hooks.updated.mock.calls.at(-1)![0];

    expect(args).not.toHaveProperty('interaction');
    expect(args).toMatchObject({
      call: { toolCallId: 'call-1' },
      question: { messages: [card], revision: 1, state: { q: 1 } },
      thread: { id: thread },
    });

    const saved = fixture.values.get(recordKey);

    expect(saved).toMatchObject({ messages: [card, next], revision: 1, state: { q: 1 } });
    expect(saved).not.toHaveProperty('pending');

    await fixture.host.shutdown();
  });

  it('lets the next question be answered once the job has posted it', async () => {
    const { fixture, hooks, update } = await failedAdvance();

    await fixture.host.run(update);
    await fixture.interact(click('answer', next.id));

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(hooks.settled).toHaveBeenCalledWith(
      expect.objectContaining({
        question: { messages: [card, next], revision: 1, state: { q: 1 } },
      }),
    );

    await fixture.host.shutdown();
  });

  it('does nothing when it runs again after the update succeeded', async () => {
    const { fixture, hooks, update } = await failedAdvance();

    await fixture.host.run(update);
    await fixture.host.run(update);

    expect(hooks.updated).toHaveBeenCalledTimes(2);

    await fixture.host.shutdown();
  });

  it('does nothing when the revision moved on', async () => {
    const { fixture, hooks, update } = await failedAdvance();

    await fixture.host.run({ ...update, revision: 0 });

    expect(hooks.updated).toHaveBeenCalledOnce();
    expect(fixture.values.get(recordKey)).toMatchObject({ pending: 'update', revision: 1 });

    await fixture.host.shutdown();
  });

  it('does nothing for a settled question', async () => {
    const { fixture, hooks, update } = await failedAdvance();
    const saved = fixture.values.get(recordKey) as object;

    fixture.values.set(recordKey, { ...saved, settled: { at: '2026-09-26T00:01:00.000Z' } });

    await fixture.host.run(update);

    expect(hooks.updated).toHaveBeenCalledOnce();

    await fixture.host.shutdown();
  });

  it('fails so the job retries while the platform is still down', async () => {
    const { fixture, hooks, update } = await failedAdvance();

    hooks.updated.mockRejectedValueOnce(new Error('Slack is still down'));

    await expect(fixture.host.run(update)).rejects.toThrow('Slack is still down');
    expect(fixture.values.get(recordKey)).toMatchObject({ messages: [card], pending: 'update' });

    await fixture.host.run(update);

    expect(fixture.values.get(recordKey)).toMatchObject({ messages: [card, next] });

    await fixture.host.shutdown();
  });
});
