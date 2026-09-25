// Internal conversion from frogbot Tool[] → AI SDK ToolSet.
// Users never import this — the ToolSet record is an implementation detail.

import type { ModelMessage, ToolSet } from 'ai';
import { tool as aiTool } from 'ai';
import { z } from 'zod';

import type { AnyTool, ToolCtx } from '../tools/types.js';
import { isClientTool } from '../tools/types.js';

export const SKIPPED_FOR_CLIENT_INPUT = {
  skipped: true,
  reason:
    'Not run: this step also asked the user for input. Call the tool again after the answer if it is still needed.',
} as const;

export type ToAISDKToolsOptions = {
  skip?: (messages: ModelMessage[]) => boolean;
};

export function toAISDKTools(
  tools: readonly AnyTool[] | undefined,
  { skip }: ToAISDKToolsOptions = {},
): ToolSet {
  if (!tools || tools.length === 0) return {};

  return Object.fromEntries(
    tools.map((t) => [
      t.slug,
      isClientTool(t)
        ? aiTool({
            description: t.description,
            inputSchema: t.inputSchema,
            outputSchema: t.outputSchema,
          })
        : aiTool({
            description: t.description,
            inputSchema: t.inputSchema,
            contextSchema: z.custom<ToolCtx>(),
            execute: (input, { context, messages }) =>
              skip?.(messages) ? SKIPPED_FOR_CLIENT_INPUT : t.execute(input, context),
          }),
    ]),
  );
}

export function toAISDKToolsContext(
  tools: readonly AnyTool[] | undefined,
  ctx: ToolCtx,
): Record<string, ToolCtx> {
  return Object.fromEntries(
    (tools ?? []).filter((t) => !isClientTool(t)).map((t) => [t.slug, ctx]),
  );
}
