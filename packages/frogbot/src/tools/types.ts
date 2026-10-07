import type { z } from 'zod';

import type { FrogBotComponent } from '../admin/types.js';
import type { PendingCall } from '../chat/turn/types.js';
import type { FrogBot } from '../frogbot.js';
import type { FrogBotRequest } from '../types/request.js';

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

export type Tool<TSchema extends z.ZodType = z.ZodType, TResult = unknown> = BaseTool<TSchema> & {
  execute: (input: z.infer<TSchema>, ctx: ToolCtx) => TResult | Promise<TResult>;
};

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
  outputSchema: TOutputSchema;
  client: ClientToolConfig;
  execute?: never;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a type-erased container, like the AI SDK ToolSet
export type AnyTool = Tool<any, any> | AnyClientTool;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a type-erased container, like the AI SDK ToolSet
export type AnyClientTool = ClientTool<any, any>;

export function isClientTool(tool: AnyTool): tool is AnyClientTool {
  return 'client' in tool && tool.client !== undefined;
}
