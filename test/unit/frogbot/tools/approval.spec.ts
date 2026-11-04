import { describe, expect, it, vi } from 'vitest';

import type { ToolApprovalOption } from '../../../../packages/frogbot/src/tools/approval.js';
import {
  assertToolApproval,
  NOT_APPROVABLE,
  resolveToolApproval,
  toApprovalStatus,
} from '../../../../packages/frogbot/src/tools/approval.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const req = { user: { id: 'user-1' } } as unknown as FrogBotRequest;
const agent = { slug: 'support', runId: 'run-1', chatId: 'chat-1' };

async function status(
  approval: ToolApprovalOption,
  run: { autoApprove: boolean; canAsk: boolean },
  input: unknown = {},
) {
  const logger = { error: vi.fn() };
  const resolved = await resolveToolApproval({
    approval,
    input,
    req,
    agent,
    tool: { slug: 'refund' },
    logger,
  });

  return { status: toApprovalStatus({ ...resolved, ...run }), logger };
}

const chat = { autoApprove: false, canAsk: true };
const autoChat = { autoApprove: true, canAsk: true };
const nobody = { autoApprove: false, canAsk: false };
const nobodyAuto = { autoApprove: true, canAsk: false };

describe('tool approval preview table', () => {
  it.each([
    [false, chat, { type: 'not-applicable' }],
    [false, autoChat, { type: 'not-applicable' }],
    [false, nobody, { type: 'not-applicable' }],
    ['ask', chat, { type: 'user-approval' }],
    ['ask', autoChat, { type: 'approved' }],
    ['ask', nobody, { type: 'denied', reason: NOT_APPROVABLE }],
    ['ask', nobodyAuto, { type: 'approved' }],
    ['required', chat, { type: 'user-approval' }],
    ['required', autoChat, { type: 'user-approval' }],
    ['required', nobody, { type: 'denied', reason: NOT_APPROVABLE }],
    ['required', nobodyAuto, { type: 'denied', reason: NOT_APPROVABLE }],
  ] as const)('%s with %o gives %o', async (approval, run, expected) => {
    expect((await status(approval, run)).status).toEqual(expected);
  });

  it('follows a function per call and shows its reason', async () => {
    const approval: ToolApprovalOption = ({ input }) =>
      (input as { amount: number }).amount > 1000
        ? { mode: 'required', reason: 'Refund $5000' }
        : false;

    expect((await status(approval, chat, { amount: 10 })).status).toEqual({
      type: 'not-applicable',
    });
    expect((await status(approval, chat, { amount: 5000 })).status).toEqual({
      type: 'user-approval',
      reason: 'Refund $5000',
    });
    expect((await status(approval, autoChat, { amount: 5000 })).status).toEqual({
      type: 'user-approval',
      reason: 'Refund $5000',
    });
    expect((await status(approval, nobody, { amount: 5000 })).status).toEqual({
      type: 'denied',
      reason: NOT_APPROVABLE,
    });
  });

  it('passes the call to the rule', async () => {
    const approval = vi.fn(() => Promise.resolve('ask' as const));

    expect((await status(approval, autoChat, { amount: 1 })).status).toEqual({ type: 'approved' });
    expect(approval).toHaveBeenCalledExactlyOnceWith({
      input: { amount: 1 },
      req,
      agent,
      tool: { slug: 'refund' },
    });
  });

  it('asks and logs when the rule throws', async () => {
    const { status: result, logger } = await status(() => {
      throw new Error('boom');
    }, autoChat);

    expect(result).toEqual({ type: 'user-approval' });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('asks and logs when the rule returns junk', async () => {
    const { status: result, logger } = await status(
      (() => 'maybe') as unknown as ToolApprovalOption,
      autoChat,
    );

    expect(result).toEqual({ type: 'user-approval' });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe('assertToolApproval', () => {
  it.each([undefined, false, 'ask', 'required', () => false])('accepts %s', (value) => {
    expect(() => assertToolApproval(value, "Tool 'refund'")).not.toThrow();
  });

  it.each([true, 'always', 1, {}])('rejects %s', (value) => {
    expect(() => assertToolApproval(value, "Tool 'refund'")).toThrow(
      "[frogbot] Tool 'refund' `approval` must be false, 'ask', 'required' or a function.",
    );
  });
});
