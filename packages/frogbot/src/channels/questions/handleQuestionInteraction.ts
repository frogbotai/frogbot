import type { Author } from 'chat';
import { NotFound } from 'payload';

import { AgentServiceError, hasAgentAccess } from '../../agents/service.js';
import { actorFromRequest } from '../../chat/turn/actor.js';
import { TurnError } from '../../chat/turn/errors.js';
import type { ToolPart } from '../../chat/turn/messages.js';
import { settleClientToolCall } from '../../chat/turn/settle.js';
import type { TurnActor } from '../../chat/turn/types.js';
import type { FrogBot } from '../../frogbot.js';
import { pieceInstanceRuntime } from '../../pieces/definePiece.js';
import type { QuestionOutput } from '../../tools/question.js';
import { createChannelThreadAccess } from '../conversation.js';
import type { ChannelRequest } from '../createChannelRequest.js';
import { createChannelRequest } from '../createChannelRequest.js';
import { deserializeThread } from '../deserializeThread.js';
import type { ChannelConversationBinding, ChannelQuestionsBinding } from '../types.js';
import type {
  QuestionDelivery,
  QuestionInteraction,
  QuestionOutcome,
  QuestionParseResult,
} from './types.js';

export type QuestionInteractionResult =
  | { status: 'ignored' }
  | { status: 'handled' }
  | { status: 'settled'; allSettled: boolean; delivery: QuestionDelivery; dismissed: boolean };

type AuthorizedRequest = ChannelRequest & { allowed: boolean };

type HookName = 'denied' | 'rejected' | 'settled' | 'stale' | 'updated';

export async function handleQuestionInteraction({
  author,
  binding,
  deliveries,
  frogbot,
  interaction,
  request,
}: {
  author: Author;
  binding: ChannelConversationBinding;
  deliveries: QuestionDelivery[];
  frogbot: FrogBot;
  interaction: QuestionInteraction;
  request?: AuthorizedRequest;
}): Promise<QuestionInteractionResult> {
  const questions = binding.questions;

  if (!questions) return { status: 'ignored' };

  const match = findMatch({ binding, deliveries, frogbot, interaction, questions });

  if (!match) return { status: 'ignored' };

  const thread = deserializeThread({ binding, thread: match.thread });

  const runHook = async (
    name: HookName,
    delivery: QuestionDelivery,
    channel: ChannelRequest,
    extra: object = {},
  ): Promise<{ messageId?: string } | void> => {
    const hook = questions.hooks[name] as ((args: object) => Promise<unknown>) | undefined;

    try {
      return (await hook?.({
        call: delivery.call,
        client: channel.client,
        interaction,
        messageId: delivery.messageId,
        req: channel.req,
        state: delivery.state,
        thread,
        ...extra,
      })) as { messageId?: string } | void;
    } catch (error) {
      frogbot.logger.error(
        { err: error, piece: binding.instance.slug, toolCallId: delivery.call.toolCallId },
        `[frogbot] Channel question '${name}' hook failed.`,
      );
    }
  };

  if (match.settled) {
    await runHook('stale', match, await internalRequest({ binding, frogbot }));

    return { status: 'handled' };
  }

  const channel = request ?? (await authorize({ author, binding, frogbot, thread }));

  if (!channel.allowed) {
    await runHook('denied', match, channel);

    return { status: 'handled' };
  }

  const reference = { chatId: match.chatId, toolCallId: match.call.toolCallId };

  return questions.deliveries.lock(reference, async () => {
    const current = await questions.deliveries.find(reference);

    if (!current) return { status: 'handled' };

    if (current.settled) {
      await runHook('stale', current, channel);

      return { status: 'handled' };
    }

    const result = parse({ binding, delivery: current, frogbot, interaction, questions });

    if (result.kind === 'ignore') return { status: 'handled' };

    if (result.kind === 'rejected') {
      await runHook('rejected', current, channel, { reason: result.reason });

      return { status: 'handled' };
    }

    if (result.kind === 'partial') {
      const next: QuestionDelivery =
        result.state === undefined ? current : { ...current, state: result.state };

      if (next !== current) await questions.deliveries.update(next, current);

      const moved = await runHook('updated', next, channel);

      if (moved?.messageId && moved.messageId !== next.messageId) {
        await questions.deliveries.update({ ...next, messageId: moved.messageId }, next);
      }

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
        await questions.deliveries.settle(current);
        await runHook('stale', current, channel);
      } else if (failure.kind === 'denied') {
        await runHook('denied', current, channel);
      } else {
        await runHook('rejected', current, channel, { reason: failure.reason });
      }

      return { status: 'handled' };
    }

    await questions.deliveries.settle(current);

    if (settlement.status === 'already-settled') {
      await runHook('settled', current, channel, {
        actor: null,
        outcome: outcomeFromPart(settlement.part),
      });
      await runHook('stale', current, channel);

      return { status: 'handled' };
    }

    await runHook('settled', current, channel, { actor, outcome });

    return {
      status: 'settled',
      allSettled: settlement.allSettled,
      delivery: current,
      dismissed: 'dismissed' in outcome,
    };
  });
}

function findMatch({
  binding,
  deliveries,
  frogbot,
  interaction,
  questions,
}: {
  binding: ChannelConversationBinding;
  deliveries: QuestionDelivery[];
  frogbot: FrogBot;
  interaction: QuestionInteraction;
  questions: ChannelQuestionsBinding;
}): QuestionDelivery | undefined {
  return deliveries.find(
    (delivery) => parse({ binding, delivery, frogbot, interaction, questions }).kind !== 'ignore',
  );
}

function parse({
  binding,
  delivery,
  frogbot,
  interaction,
  questions,
}: {
  binding: ChannelConversationBinding;
  delivery: QuestionDelivery;
  frogbot: FrogBot;
  interaction: QuestionInteraction;
  questions: ChannelQuestionsBinding;
}): QuestionParseResult {
  try {
    return questions.hooks.parse({
      call: delivery.call,
      interaction,
      settled: delivery.settled === true,
      state: delivery.state,
    });
  } catch (error) {
    frogbot.logger.error(
      { err: error, piece: binding.instance.slug, toolCallId: delivery.call.toolCallId },
      '[frogbot] Channel question parse failed; the interaction was ignored.',
    );

    return { kind: 'ignore' };
  }
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
}): Promise<AuthorizedRequest> {
  const channel = await createChannelRequest({ author, binding, frogbot, thread });
  const allowed = await hasAgentAccess({ req: channel.req, agent: binding.agent });

  if (!allowed) {
    frogbot.logger.info(
      { agent: binding.agent.slug, piece: binding.instance.slug, author: author.userId },
      '[frogbot] Channel question answer denied by agent access.',
    );
  }

  return { ...channel, allowed };
}

async function internalRequest({
  binding,
  frogbot,
}: {
  binding: ChannelConversationBinding;
  frogbot: FrogBot;
}): Promise<ChannelRequest> {
  const req = await frogbot.createRequest({});

  return { client: await pieceInstanceRuntime(binding.instance).client({ req }), req };
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

  if (error.code === 'forbidden') return { kind: 'denied' };

  if (error.code === 'call-not-found' || error.code === 'not-awaiting') return { kind: 'stale' };

  if (error.code === 'invalid-output') return { kind: 'rejected', reason: error.message };

  throw error;
}

function outcomeFromPart(part: ToolPart): QuestionOutcome {
  return part.state === 'output-available'
    ? { output: part.output as QuestionOutput }
    : { dismissed: true };
}
