import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHAT_TURNS_SLUG } from '../../../../../packages/frogbot/src/chat/collections/turns.js';
import type { FrogBotRequest } from '../../../../../packages/frogbot/src/types/request.js';

const { compareAndSet } = vi.hoisted(() => ({ compareAndSet: vi.fn() }));

vi.mock('../../../../../packages/frogbot/src/database/compareAndSet.js', () => ({ compareAndSet }));

const { findTurnMessage, hasPendingCalls } = vi.hoisted(() => ({
  findTurnMessage: vi.fn(),
  hasPendingCalls: vi.fn(),
}));

vi.mock('../../../../../packages/frogbot/src/chat/turn/messages.js', () => ({
  findTurnMessage,
  hasPendingCalls,
}));

const { TURN_HEARTBEAT_INTERVAL, TURN_LEASE_DURATION, findTurnState, holdTurn } =
  await import('../../../../../packages/frogbot/src/chat/turn/state.js');

const claim = { chatId: 7, attempt: 'attempt-1' };

function makeReq({ turn = null }: { turn?: Record<string, unknown> | null } = {}) {
  const detached = { frogbot: {} };
  const error = vi.fn();
  const findByID = vi.fn().mockResolvedValue(turn);

  const req = {
    frogbot: {
      createRequest: vi.fn().mockResolvedValue(detached),
      findByID,
      logger: { error },
    },
  } as unknown as FrogBotRequest;

  return { req, detached, error, findByID };
}

describe('holdTurn', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-09-24T00:00:00.000Z') });

    compareAndSet.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renews the lease for its own attempt on a detached request every heartbeat', async () => {
    const { req, detached } = makeReq();
    const lease = holdTurn({ req, claim });

    await vi.advanceTimersByTimeAsync(TURN_HEARTBEAT_INTERVAL);

    expect(compareAndSet).toHaveBeenCalledExactlyOnceWith({
      req: detached,
      collection: CHAT_TURNS_SLUG,
      where: {
        and: [
          { id: { equals: '7' } },
          { state: { equals: 'running' } },
          { attempt: { equals: 'attempt-1' } },
        ],
      },
      data: {
        leaseUntil: new Date(Date.now() + TURN_LEASE_DURATION).toISOString(),
      },
    });
    expect(lease.signal.aborted).toBe(false);

    lease.stop();
  });

  it('aborts the turn once the lease can no longer be renewed', async () => {
    compareAndSet.mockResolvedValue(false);

    const { req } = makeReq();
    const lease = holdTurn({ req, claim });

    await vi.advanceTimersByTimeAsync(TURN_HEARTBEAT_INTERVAL);

    expect(lease.signal.aborted).toBe(true);
    expect(lease.signal.reason).toMatchObject({
      code: 'turn-in-progress',
      message: 'The turn lease was lost.',
    });

    lease.stop();
  });

  it('logs a failed renewal without aborting the turn', async () => {
    const failure = new Error('database unavailable');

    compareAndSet.mockRejectedValue(failure);

    const { req, error } = makeReq();
    const lease = holdTurn({ req, claim });

    await vi.advanceTimersByTimeAsync(TURN_HEARTBEAT_INTERVAL);

    expect(error).toHaveBeenCalledWith(
      { err: failure },
      '[frogbot] Failed to renew the chat turn lease.',
    );
    expect(lease.signal.aborted).toBe(false);

    lease.stop();
  });

  it('stops renewing once stopped', async () => {
    const { req } = makeReq();
    const lease = holdTurn({ req, claim });

    lease.stop();

    await vi.advanceTimersByTimeAsync(TURN_HEARTBEAT_INTERVAL * 3);

    expect(compareAndSet).not.toHaveBeenCalled();
  });
});

describe('findTurnState', () => {
  beforeEach(() => {
    compareAndSet.mockReset();
    findTurnMessage.mockReset();
    hasPendingCalls.mockReset();
  });

  it('reads the turn document keyed by the stringified chat id', async () => {
    const { req, findByID } = makeReq();

    await findTurnState({ req, chatId: 7 });

    expect(findByID).toHaveBeenCalledWith({
      collection: CHAT_TURNS_SLUG,
      id: '7',
      depth: 0,
      disableErrors: true,
      req,
      overrideAccess: true,
    });
  });

  it('treats a chat without a turn document as idle', async () => {
    const { req } = makeReq();

    await expect(findTurnState({ req, chatId: 7 })).resolves.toBe('idle');
  });

  it('treats a running turn with an expired lease and nothing pending as idle', async () => {
    findTurnMessage.mockResolvedValue(undefined);

    const { req } = makeReq({
      turn: { id: '7', state: 'running', leaseUntil: new Date(Date.now() - 1).toISOString() },
    });

    await expect(findTurnState({ req, chatId: 7 })).resolves.toBe('idle');
    expect(compareAndSet).not.toHaveBeenCalled();
  });

  it('recovers a running turn whose lease expired after its question was checkpointed', async () => {
    findTurnMessage.mockResolvedValue({ id: 'a1', parts: [] });
    hasPendingCalls.mockReturnValue(true);
    compareAndSet.mockResolvedValue(true);

    const { req } = makeReq({
      turn: {
        id: '7',
        state: 'running',
        attempt: 'crashed',
        leaseUntil: new Date(Date.now() - 1).toISOString(),
      },
    });

    await expect(findTurnState({ req, chatId: 7 })).resolves.toBe('awaiting');
    expect(compareAndSet).toHaveBeenCalledExactlyOnceWith({
      req,
      collection: CHAT_TURNS_SLUG,
      where: {
        and: [
          { id: { equals: '7' } },
          { state: { equals: 'running' } },
          { attempt: { equals: 'crashed' } },
        ],
      },
      data: { state: 'awaiting', attempt: expect.any(String), leaseUntil: null },
    });
  });

  it('reports a running turn while its lease is live', async () => {
    const { req } = makeReq({
      turn: { id: '7', state: 'running', leaseUntil: new Date(Date.now() + 60_000).toISOString() },
    });

    await expect(findTurnState({ req, chatId: 7 })).resolves.toBe('running');
  });

  it('reports an awaiting turn while its assistant message exists', async () => {
    findTurnMessage.mockResolvedValue({ id: 'a1', parts: [] });

    const { req } = makeReq({ turn: { id: '7', state: 'awaiting', leaseUntil: null } });

    await expect(findTurnState({ req, chatId: 7 })).resolves.toBe('awaiting');
    expect(compareAndSet).not.toHaveBeenCalled();
  });

  it('returns an awaiting turn to idle once its assistant message is gone', async () => {
    findTurnMessage.mockResolvedValue(undefined);
    compareAndSet.mockResolvedValue(true);

    const { req } = makeReq({
      turn: { id: '7', state: 'awaiting', attempt: 'held', leaseUntil: null },
    });

    await expect(findTurnState({ req, chatId: 7 })).resolves.toBe('idle');
    expect(compareAndSet).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: 'idle', attempt: expect.any(String), leaseUntil: null },
      }),
    );
  });
});
