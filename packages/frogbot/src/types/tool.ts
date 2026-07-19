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

// `any` (not `z.ZodType`/`unknown`) is intentional: this is the type-erased
// container used to hold a heterogeneous set of concrete `Tool<Schema, Result>`
// instances (e.g. `AgentConfig.tools`). `TSchema` and `TResult` appear in
// `execute`'s parameter/return positions, so a concrete `Tool<Schema>` is not
// assignable to `Tool<z.ZodType, unknown>` under TS's variance rules — the
// same reason the AI SDK's own `ToolSet` uses `Tool<any, any, any>` rather
// than a concrete default.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;
