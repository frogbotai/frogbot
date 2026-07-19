import type { z } from 'zod';

import type { Frogbot } from '../frogbot.js';
import type { FrogbotRequest } from './request.js';

export type ToolCtx = {
  req: FrogbotRequest;
  frogbot: Frogbot;
  agent: { slug: string; runId: string };
};

export type Tool<
  TSchema extends z.ZodType = z.ZodType,
  TResult = unknown,
> = {
  slug: string;
  description: string;
  inputSchema: TSchema;
  execute: (input: z.infer<TSchema>, ctx: ToolCtx) => TResult | Promise<TResult>;
};

export type AnyTool = Tool<z.ZodType, unknown>;
