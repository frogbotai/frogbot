// Internal conversion from frogbot Tool[] → AI SDK ToolSet.
// Users never import this — the ToolSet record is an implementation detail.

import { tool as aiTool } from 'ai';
import type { ToolSet } from 'ai';
import { z } from 'zod';

import type { AnyTool, ToolCtx } from '../types/tool.js';

export function toAISDKTools(tools: readonly AnyTool[] | undefined): ToolSet {
  if (!tools || tools.length === 0) return {};
  return Object.fromEntries(
    tools.map((t) => [
      t.slug,
      aiTool({
        description: t.description,
        inputSchema: t.inputSchema,
        contextSchema: z.custom<ToolCtx>(),
        execute: (input, { context }) => t.execute(input, context),
      }),
    ]),
  );
}

export function toAISDKToolsContext(
  tools: readonly AnyTool[] | undefined,
  ctx: ToolCtx,
): Record<string, ToolCtx> {
  return Object.fromEntries((tools ?? []).map((t) => [t.slug, ctx]));
}
