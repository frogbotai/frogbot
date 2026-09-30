import type { Author, Thread } from 'chat';
import { NotFound } from 'payload';

import { AgentServiceError, canUseAgent } from '../../agents/service.js';
import { actorFromRequest } from '../../chat/turn/actor.js';
import { TurnError } from '../../chat/turn/errors.js';
import type { ToolPart } from '../../chat/turn/messages.js';
import { settleClientToolCall } from '../../chat/turn/settle.js';
import type { TurnActor } from '../../chat/turn/types.js';
import type { FrogBot } from '../../frogbot.js';
import type { QuestionOutput } from '../../tools/question.js';
import { createChannelThreadAccess } from '../conversation.js';
import type { ChannelRequest } from '../createChannelRequest.js';
import { createChannelRequest, createInternalChannelRequest } from '../createChannelRequest.js';
import { deserializeThread } from '../deserializeThread.js';
import { queueChannelTask } from '../queueChannelTask.js';
import type { ChannelConversationBinding, ChannelQuestionsBinding } from '../types.js';
import { applyQuestionChange, toQuestionRecord } from './questionRecord.js';
import type {
  QuestionChange,
  QuestionInteraction,
  QuestionOutcome,
  QuestionParseResult,
  StoredQuestion,
} from './types.js';

export const PENDING_QUESTION_REASON =
  'The next question is still posting — try again in a moment.';

export type QuestionInteractionResult =
  | { status: 'ignored' }
  | { status: 'handled' }
  | { status: 'settled'; allSettled: boolean; dismissed: boolean; question: StoredQuestion };

export type AuthorizedChannelRequest = ChannelRequest & { allowed: boolean };

type NoticeHook = 'denied' | 'rejected' | 'stale';

export async function handleQuestionInteraction({
  author,
  binding,
  candidates,
  frogbot,
  interaction,
  request,
  target,
}: {
  author: Author;
  binding: ChannelConversationBinding;
  candidates: StoredQuestion[];
  frogbot: FrogBot;
  interaction: QuestionInteraction;
  request?: AuthorizedChannelRequest;
  target?: string;
}): Promise<QuestionInteractionResult> {
  const questions = binding.questions;

  if (!questions || candidates.length === 0) return { status: 'ignored' };

  const match = findMatch({ binding, candidates, frogbot, interaction, questions, target });

  if (!match) return { status: 'ignored' };

  const thread = deserializeThread({ binding, thread: match.thread });

  const notify = async (
    name: NoticeHook,
    question: StoredQuestion,
    channel: ChannelRequest,
    extra: object = {},
  ): Promise<void> => {
    const hook = questions.hooks[name] as ((args: object) => Promise<void>) | undefined;

    try {
      await hook?.({
        ...hookArgs({ channel, question, thread }),
        interaction,
        ...extra,
      });
    } catch (error) {
      logHookFailure({ binding, error, frogbot, name, question });
    }
  };

  if (match.settled || isStaleClick({ question: match, target })) {
    await notify('stale', match, await createInternalChannelRequest({ binding, frogbot }));

    return { status: 'handled' };
  }

  const channel = request ?? (await authorize({ author, binding, frogbot, thread }));

  if (!channel.allowed) {
    await notify('denied', match, channel);

    return { status: 'handled' };
  }

  const reference = { chatId: match.chatId, toolCallId: match.call.toolCallId };

  return questions.store.lock(reference, async () => {
    const current = await questions.store.find(reference);

    if (!current) return { status: 'handled' };

    if (current.settled || isStaleClick({ question: current, target })) {
      await notify('stale', current, channel);

      return { status: 'handled' };
    }

    if (current.pending === 'update') {
      await queueUpdate({ binding, frogbot, question: current });
      await notify('rejected', current, channel, { reason: PENDING_QUESTION_REASON });

      return { status: 'handled' };
    }

    const result = parse({ binding, frogbot, interaction, question: current, questions });

    if (result.kind === 'ignore') return { status: 'handled' };

    if (result.kind === 'stale') {
      await notify('stale', current, channel);

      return { status: 'handled' };
    }

    if (result.kind === 'rejected') {
      await notify('rejected', current, channel, { reason: result.reason });

      return { status: 'handled' };
    }

    if (result.kind === 'partial') {
      await advance({ binding, channel, frogbot, interaction, question: current, result, thread });

      return { status: 'handled' };
    }

    const outcome: QuestionOutcome =
      result.kind === 'answer' ? { output: result.output } : { dismissed: true };

    const actor = channelActor({ binding, req: channel.req });

    let settlement;

    try {
      settlement = await settleClientToolCall({
        req: channel.req,
        chatId: current.chatId,
        toolCallId: current.call.toolCallId,
        outcome,
        actor,
        channelAccess: createChannelThreadAccess({
          binding,
          chatId: current.chatId,
          req: channel.req,
          thread,
        }),
      });
    } catch (error) {
      const failure = settleFailure(error);

      if (failure.kind === 'stale') {
        await questions.store.settle({ question: current });
        await notify('stale', current, channel);
      } else if (failure.kind === 'denied') {
        await notify('denied', current, channel);
      } else {
        await notify('rejected', current, channel, { reason: failure.reason });
      }

      return { status: 'handled' };
    }

    const runSettled = async (args: {
      actor: TurnActor | null;
      outcome: QuestionOutcome;
    }): Promise<QuestionChange | void> => {
      try {
        return await questions.hooks.settled({
          ...hookArgs({ channel, question: current, thread }),
          ...args,
        });
      } catch (error) {
        logHookFailure({ binding, error, frogbot, name: 'settled', question: current });
      }
    };

    const settle = async (args: { actor: TurnActor | null; outcome: QuestionOutcome }) => {
      const change = await runSettled(args);
      const settled = applyQuestionChange({ change, question: current });

      await questions.store.settle({ question: settled });

      return settled;
    };

    if (settlement.status === 'already-settled') {
      const settled = await settle({ actor: null, outcome: outcomeFromPart(settlement.part) });

      await notify('stale', settled, channel);

      return { status: 'handled' };
    }

    return {
      status: 'settled',
      allSettled: settlement.allSettled,
      dismissed: 'dismissed' in outcome,
      question: await settle({ actor, outcome }),
    };
  });
}

async function advance({
  binding,
  channel,
  frogbot,
  interaction,
  question,
  result,
  thread,
}: {
  binding: ChannelConversationBinding;
  channel: ChannelRequest;
  frogbot: FrogBot;
  interaction: QuestionInteraction;
  question: StoredQuestion;
  result: Extract<QuestionParseResult, { kind: 'partial' }>;
  thread: Thread;
}): Promise<void> {
  const { hooks, store } = binding.questions!;

  const staged: StoredQuestion = {
    ...question,
    revision: question.revision + 1,
    ...(result.state === undefined ? {} : { state: result.state }),
    ...(hooks.updated ? { pending: 'update' as const } : {}),
  };

  const saved = await store.change({ expected: question.revision, question: staged });

  if (!saved || !hooks.updated) return;

  try {
    const change = await hooks.updated({
      ...hookArgs({ channel, question: staged, thread }),
      interaction,
    });

    await store.change({
      expected: staged.revision,
      question: applyQuestionChange({ change, question: staged }),
    });
  } catch (error) {
    logHookFailure({ binding, error, frogbot, name: 'updated', question: staged });

    await queueUpdate({ binding, frogbot, question: staged });
  }
}

function queueUpdate({
  binding,
  frogbot,
  question,
}: {
  binding: ChannelConversationBinding;
  frogbot: FrogBot;
  question: StoredQuestion;
}): Promise<void> {
  return queueChannelTask({
    binding,
    frogbot,
    input: {
      kind: 'update',
      agentSlug: binding.agent.slug,
      instanceSlug: binding.instance.slug,
      chatId: question.chatId,
      toolCallId: question.call.toolCallId,
      revision: question.revision,
      thread: question.thread,
    },
  });
}

function hookArgs({
  channel,
  question,
  thread,
}: {
  channel: ChannelRequest;
  question: StoredQuestion;
  thread: Thread;
}) {
  return {
    call: question.call,
    client: channel.client,
    question: toQuestionRecord(question),
    req: channel.req,
    thread,
  };
}

function isStaleClick({ question, target }: { question: StoredQuestion; target?: string }) {
  return target !== undefined && question.messages.at(-1)?.id !== target;
}

function findMatch({
  binding,
  candidates,
  frogbot,
  interaction,
  questions,
  target,
}: {
  binding: ChannelConversationBinding;
  candidates: StoredQuestion[];
  frogbot: FrogBot;
  interaction: QuestionInteraction;
  questions: ChannelQuestionsBinding;
  target?: string;
}): StoredQuestion | undefined {
  const current = candidates.find(
    (question) =>
      !isStaleClick({ question, target }) &&
      parse({ binding, frogbot, interaction, question, questions }).kind !== 'ignore',
  );

  return current ?? candidates.find((question) => isStaleClick({ question, target }));
}

function parse({
  binding,
  frogbot,
  interaction,
  question,
  questions,
}: {
  binding: ChannelConversationBinding;
  frogbot: FrogBot;
  interaction: QuestionInteraction;
  question: StoredQuestion;
  questions: ChannelQuestionsBinding;
}): QuestionParseResult {
  try {
    return questions.hooks.parse({
      call: question.call,
      interaction,
      question: toQuestionRecord(question),
      settled: question.settled !== undefined,
    });
  } catch (error) {
    frogbot.logger.error(
      { err: error, piece: binding.instance.slug, toolCallId: question.call.toolCallId },
      '[frogbot] Channel question parse failed; the interaction was ignored.',
    );

    return { kind: 'ignore' };
  }
}

function logHookFailure({
  binding,
  error,
  frogbot,
  name,
  question,
}: {
  binding: ChannelConversationBinding;
  error: unknown;
  frogbot: FrogBot;
  name: string;
  question: StoredQuestion;
}): void {
  frogbot.logger.error(
    { err: error, piece: binding.instance.slug, toolCallId: question.call.toolCallId },
    `[frogbot] Channel question '${name}' hook failed.`,
  );
}

async function authorize({
  author,
  binding,
  frogbot,
  thread,
}: {
  author: Author;
  binding: ChannelConversationBinding;
  frogbot: FrogBot;
  thread: { id: string };
}): Promise<AuthorizedChannelRequest> {
  const channel = await createChannelRequest({ author, binding, frogbot, thread });

  const access = await canUseAgent({ req: channel.req, agent: binding.agent });

  if (!access.allowed) {
    frogbot.logger.info(
      { agent: binding.agent.slug, piece: binding.instance.slug, author: author.userId },
      access.denied === 'access'
        ? '[frogbot] Channel question answer denied by agent access.'
        : '[frogbot] Channel question answer denied by model access.',
    );
  }

  return { ...channel, allowed: access.allowed };
}

function channelActor({
  binding,
  req,
}: {
  binding: ChannelConversationBinding;
  req: ChannelRequest['req'];
}): TurnActor {
  const actor = actorFromRequest(req);

  return actor.channel
    ? { ...actor, channel: { ...actor.channel, account: binding.instance.slug } }
    : actor;
}

function settleFailure(
  error: unknown,
): { kind: 'denied' } | { kind: 'stale' } | { kind: 'rejected'; reason: string } {
  if (error instanceof NotFound) return { kind: 'denied' };

  if (error instanceof AgentServiceError && error.status === 403) return { kind: 'denied' };

  if (!(error instanceof TurnError)) throw error;

  if (error.code === 'forbidden' || error.code === 'channel-chat') return { kind: 'denied' };

  if (error.code === 'call-not-found' || error.code === 'not-awaiting') return { kind: 'stale' };

  if (error.code === 'invalid-output') return { kind: 'rejected', reason: error.message };

  throw error;
}

function outcomeFromPart(part: ToolPart): QuestionOutcome {
  return part.state === 'output-available'
    ? { output: part.output as QuestionOutput }
    : { dismissed: true };
}
