import type { z } from 'zod';

import type { FrogBotComponent } from '../admin/types.js';
import type { PendingCall } from '../chat/turn/types.js';
import type { FrogBot } from '../frogbot.js';
import type { FrogBotRequest } from '../types/request.js';
import type { ToolApprovalOption } from './approval.js';

export type ToolCtx = {
  req: FrogBotRequest;
  frogbot: FrogBot;
  agent: { slug: string; runId: string; chatId?: number | string };
};

type BaseTool<TSchema extends z.ZodType> = {
  component?: FrogBotComponent;
  slug: string;
  description: string;
  inputSchema: TSchema;
};

/** How much of a tool's result the model sees. Results past either limit are cut to whole lines. */
export type ToolOutputLimits = {
  /** @default 2000 */
  lines?: number;
  /** UTF-8 bytes. @default 51200 (50 KiB) */
  bytes?: number;
};

export type Tool<TSchema extends z.ZodType = z.ZodType, TResult = unknown> = BaseTool<TSchema> & {
  /** The name people see, such as `Exa: Search`. Defaults to `slug`. */
  label?: string;
  execute: (input: z.infer<TSchema>, ctx: ToolCtx) => TResult | Promise<TResult>;
  /**
   * Limits on the result the model sees; `false` sends it whole. The chat keeps the full result.
   * @default { lines: 2000, bytes: 51200 }
   */
  maxOutput?: ToolOutputLimits | false;
  /**
   * Whether a person approves each call before `execute` runs: `'ask'` pauses unless the chat
   * auto-approves, `'required'` always pauses, and a function decides per call.
   * @default false
   */
  approval?: ToolApprovalOption;
  /**
   * Whether the run's user is offered this tool. Checked once per run, before the first model
   * call; a tool it denies, or whose rule throws, is left out and can't be called.
   */
  access?: ToolAccess;
};

/** Decides whether a run is offered a server tool. */
export type ToolAccess = (args: {
  req: FrogBotRequest;
  agent: ToolCtx['agent'];
  tool: { slug: string };
}) => boolean | Promise<boolean>;

export type ClientToolAccess = (args: {
  req: FrogBotRequest;
  call: PendingCall;
}) => boolean | Promise<boolean>;

export type ClientToolValidate = (args: { input: unknown; output: unknown }) => true | string;

export type ClientToolConfig = {
  kind: string;
  access?: ClientToolAccess;
  validate?: ClientToolValidate;
};

export type ClientTool<
  TSchema extends z.ZodType = z.ZodType,
  TOutputSchema extends z.ZodType = z.ZodType,
> = BaseTool<TSchema> & {
  /** The name people see, such as `Ask a question`. Defaults to `slug`. */
  label?: string;
  outputSchema: TOutputSchema;
  client: ClientToolConfig;
  execute?: never;
  approval?: never;
  access?: never;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a type-erased container, like the AI SDK ToolSet
export type AnyTool = Tool<any, any> | AnyClientTool;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a type-erased container, like the AI SDK ToolSet
export type AnyClientTool = ClientTool<any, any>;

export function isClientTool(tool: AnyTool): tool is AnyClientTool {
  return 'client' in tool && tool.client !== undefined;
}
