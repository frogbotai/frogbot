import { randomUUID } from 'node:crypto';

import type { DocID } from '../../collections/config/types.js';
import { compareAndSet } from '../../database/compareAndSet.js';
import type { Where } from '../../types/payload.js';
import type { FrogBotRequest } from '../../types/request.js';
import { CHAT_TURNS_SLUG } from '../collections/turns.js';
import { TurnError } from './errors.js';
import { findTurnMessage, hasPendingCalls } from './messages.js';
import type { TurnClaim, TurnState } from './types.js';

export const TURN_LEASE_DURATION = 60_000;
export const TURN_HEARTBEAT_INTERVAL = 20_000;

type TurnDocument = {
  id: string;
  state: TurnState;
  attempt?: string | null;
  leaseUntil?: string | null;
};

export async function findTurnState({
  req,
  chatId,
}: {
  req: FrogBotRequest;
  chatId: DocID;
}): Promise<TurnState> {
  const turn = await findTurn({ req, chatId });

  if (!turn || turn.state === 'idle') return 'idle';

  if (turn.state === 'running' && !isExpired(turn.leaseUntil)) return 'running';

  const message = await findTurnMessage({ req, chatId });

  if (turn.state === 'awaiting' && message) return 'awaiting';

  if (turn.state === 'running' && !(message && hasPendingCalls(message))) return 'idle';

  const state = turn.state === 'running' ? 'awaiting' : 'idle';

  const recovered = await compareAndSet({
    req,
    collection: CHAT_TURNS_SLUG,
    where: rowWhere(turn),
    data: { state, attempt: randomUUID(), leaseUntil: null },
  });

  return recovered ? state : findTurnState({ req, chatId });
}

export async function claimTurn({
  req,
  chatId,
  from,
}: {
  req: FrogBotRequest;
  chatId: DocID;
  from: 'idle' | 'awaiting';
}): Promise<TurnClaim | undefined> {
  if ((await findTurnState({ req, chatId })) !== from) return undefined;

  const attempt = randomUUID();
  const data = { state: 'running', attempt, leaseUntil: leaseUntil() };

  const where: Where =
    from === 'awaiting'
      ? { and: [{ id: { equals: String(chatId) } }, { state: { equals: 'awaiting' } }] }
      : {
          and: [
            { id: { equals: String(chatId) } },
            {
              or: [
                { state: { equals: 'idle' } },
                {
                  and: [
                    { state: { equals: 'running' } },
                    { leaseUntil: { less_than: new Date().toISOString() } },
                  ],
                },
              ],
            },
          ],
        };

  if (await compareAndSet({ req, collection: CHAT_TURNS_SLUG, where, data })) {
    return { chatId, attempt };
  }

  if (from === 'awaiting') return undefined;

  try {
    await req.frogbot.create({
      collection: CHAT_TURNS_SLUG,
      data: { id: String(chatId), ...data },
      req,
      overrideAccess: true,
    });
  } catch (error) {
    if (await findTurn({ req, chatId })) return undefined;

    throw error;
  }

  return { chatId, attempt };
}

export async function renewTurn({
  req,
  claim,
}: {
  req: FrogBotRequest;
  claim: TurnClaim;
}): Promise<boolean> {
  return compareAndSet({
    req,
    collection: CHAT_TURNS_SLUG,
    where: runningWhere(claim),
    data: { leaseUntil: leaseUntil() },
  });
}

export function holdTurn({ req, claim }: { req: FrogBotRequest; claim: TurnClaim }): {
  signal: AbortSignal;
  stop: () => void;
} {
  const controller = new AbortController();
  const heartbeatReq = req.frogbot.createRequest({});

  const timer = setInterval(() => {
    void heartbeatReq
      .then((detached) => renewTurn({ req: detached, claim }))
      .then(
        (renewed) => {
          if (!renewed) {
            controller.abort(new TurnError('turn-in-progress', 'The turn lease was lost.'));
          }
        },
        (error: unknown) => {
          req.frogbot.logger.error(
            { err: error },
            '[frogbot] Failed to renew the chat turn lease.',
          );
        },
      );
  }, TURN_HEARTBEAT_INTERVAL);

  timer.unref?.();

  return { signal: controller.signal, stop: () => clearInterval(timer) };
}

export async function releaseTurn({
  req,
  claim,
  state,
}: {
  req: FrogBotRequest;
  claim: TurnClaim;
  state: 'idle' | 'awaiting';
}): Promise<boolean> {
  return compareAndSet({
    req,
    collection: CHAT_TURNS_SLUG,
    where: runningWhere(claim),
    data: { state, attempt: randomUUID(), leaseUntil: null },
  });
}

export async function closeAwaitingTurn({
  req,
  chatId,
}: {
  req: FrogBotRequest;
  chatId: DocID;
}): Promise<boolean> {
  return compareAndSet({
    req,
    collection: CHAT_TURNS_SLUG,
    where: { and: [{ id: { equals: String(chatId) } }, { state: { equals: 'awaiting' } }] },
    data: { state: 'idle', attempt: randomUUID(), leaseUntil: null },
  });
}

async function findTurn({
  req,
  chatId,
}: {
  req: FrogBotRequest;
  chatId: DocID;
}): Promise<TurnDocument | null> {
  return (await req.frogbot.findByID({
    collection: CHAT_TURNS_SLUG,
    id: String(chatId),
    depth: 0,
    disableErrors: true,
    req,
    overrideAccess: true,
  })) as TurnDocument | null;
}

function rowWhere({ id, state, attempt }: TurnDocument): Where {
  return {
    and: [
      { id: { equals: id } },
      { state: { equals: state } },
      ...(attempt ? [{ attempt: { equals: attempt } }] : []),
    ],
  };
}

function runningWhere({ chatId, attempt }: TurnClaim): Where {
  return {
    and: [
      { id: { equals: String(chatId) } },
      { state: { equals: 'running' } },
      { attempt: { equals: attempt } },
    ],
  };
}

function leaseUntil(): string {
  return new Date(Date.now() + TURN_LEASE_DURATION).toISOString();
}

function isExpired(value: string | null | undefined): boolean {
  return !value || new Date(value).getTime() <= Date.now();
}
