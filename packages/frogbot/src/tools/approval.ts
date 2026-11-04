import type { ToolApprovalStatus } from 'ai';

import type { Logger } from '../frogbot.js';
import type { FrogBotRequest } from '../types/request.js';
import { isRecord } from '../utilities/isRecord.js';
import type { ToolCtx } from './types.js';

/** `'ask'` pauses for a person unless the chat auto-approves; `'required'` always pauses. */
export type ToolApprovalMode = 'ask' | 'required';

export type ToolApprovalResult =
  false | ToolApprovalMode | { mode: false | ToolApprovalMode; reason?: string };

/** Decides per call whether a person approves it, with an optional reason shown to them. */
export type ToolApproval = (args: {
  input: unknown;
  req: FrogBotRequest;
  agent: ToolCtx['agent'];
  tool: { slug: string };
}) => ToolApprovalResult | Promise<ToolApprovalResult>;

export type ToolApprovalOption = false | ToolApprovalMode | ToolApproval;

export type ResolvedToolApproval = { mode: false | ToolApprovalMode; reason?: string };

/** What the model reads when a call needs a person and nobody can answer in this run. */
export const NOT_APPROVABLE =
  "Not run: this tool needs a person's approval, and nobody can approve it in this run.";

const modes: readonly unknown[] = [false, 'ask', 'required'];

/** Throws unless `value` is a valid `approval` option. */
export function assertToolApproval(value: unknown, label: string): void {
  if (value === undefined || typeof value === 'function' || modes.includes(value)) return;

  throw new Error(
    `[frogbot] ${label} \`approval\` must be false, 'ask', 'required' or a function.`,
  );
}

/** Runs a tool's `approval` option for one call. A rule that throws or returns junk asks. */
export async function resolveToolApproval({
  approval,
  input,
  req,
  agent,
  tool,
  logger,
}: {
  approval: ToolApprovalOption | undefined;
  input: unknown;
  req: FrogBotRequest;
  agent: ToolCtx['agent'];
  tool: { slug: string };
  logger: Pick<Logger, 'error'>;
}): Promise<ResolvedToolApproval> {
  if (typeof approval !== 'function') return { mode: approval ?? false };

  try {
    const result = await approval({ input, req, agent, tool });

    if (modes.includes(result)) return { mode: result as false | ToolApprovalMode };

    if (
      isRecord(result) &&
      modes.includes(result.mode) &&
      (result.reason === undefined || typeof result.reason === 'string')
    ) {
      return {
        mode: result.mode,
        ...(result.reason ? { reason: result.reason } : {}),
      };
    }

    logger.error(
      { tool: tool.slug, agent: agent.slug, result },
      `[frogbot] Tool '${tool.slug}' approval returned an invalid value; the call needs approval.`,
    );
  } catch (error) {
    logger.error(
      { err: error, tool: tool.slug, agent: agent.slug },
      `[frogbot] Tool '${tool.slug}' approval threw; the call needs approval.`,
    );
  }

  return { mode: 'required' };
}

/** Turns a resolved mode into the AI SDK status for this run. */
export function toApprovalStatus({
  mode,
  reason,
  autoApprove,
  canAsk,
}: ResolvedToolApproval & { autoApprove: boolean; canAsk: boolean }): Exclude<
  ToolApprovalStatus,
  string | undefined
> {
  if (mode === false) return { type: 'not-applicable' };

  if (mode === 'ask' && autoApprove) return { type: 'approved' };

  if (!canAsk) return { type: 'denied', reason: NOT_APPROVABLE };

  return { type: 'user-approval', ...(reason ? { reason } : {}) };
}
