import type { JSONValue, ModelMessage, Tool, ToolSet } from 'ai';
import { tool as aiTool } from 'ai';
import { z } from 'zod';

import type { AnyTool, ToolCtx, ToolOutputLimits } from '../tools/types.js';
import { isClientTool } from '../tools/types.js';

export const MAX_TOOL_OUTPUT_LINES = 2000;

export const MAX_TOOL_OUTPUT_BYTES = 50 * 1024;

export const SKIPPED_FOR_CLIENT_INPUT = {
  skipped: true,
  reason:
    'Not run: this step also asked the user for input. Call the tool again after the answer if it is still needed.',
} as const;

type WithToolCtx<TOOL> =
  TOOL extends Tool<infer INPUT, infer OUTPUT> ? Tool<INPUT, OUTPUT, ToolCtx> : never;

export type AISDKTools = Record<
  string,
  WithToolCtx<ToolSet[string]> &
    Pick<
      ToolSet[string],
      'execute' | 'onInputAvailable' | 'onInputStart' | 'onInputDelta' | 'needsApproval'
    >
>;

export type ToAISDKToolsOptions = {
  skip?: (messages: ModelMessage[]) => boolean;
};

export function toAISDKTools(
  tools: readonly AnyTool[] | undefined,
  { skip }: ToAISDKToolsOptions = {},
): AISDKTools {
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
            ...(t.maxOutput !== false && {
              toModelOutput: ({ output }) => capToolOutput(output, t.maxOutput || {}),
            }),
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

function capToolOutput(
  output: unknown,
  {
    lines: maxLines = MAX_TOOL_OUTPUT_LINES,
    bytes: maxBytes = MAX_TOOL_OUTPUT_BYTES,
  }: ToolOutputLimits,
) {
  const text = typeof output === 'string' ? output : (JSON.stringify(output, null, 2) ?? 'null');
  const lines = text.split('\n');

  if (text.endsWith('\n')) lines.pop();

  if (lines.length <= maxLines && Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return typeof output === 'string'
      ? { type: 'text' as const, value: output }
      : { type: 'json' as const, value: JSON.parse(text) as JSONValue };
  }

  const kept: string[] = [];
  let bytes = 0;

  for (const line of lines.slice(0, maxLines)) {
    const size = Buffer.byteLength(line, 'utf8') + (kept.length > 0 ? 1 : 0);

    if (bytes + size > maxBytes) break;

    kept.push(line);
    bytes += size;
  }

  const shown = kept.length > 0 ? `lines 1-${kept.length}` : '0 lines';
  const marker = `[showing ${shown} of ${lines.length}; output truncated]`;

  return {
    type: 'text' as const,
    value: kept.length > 0 ? `${kept.join('\n')}\n${marker}` : marker,
  };
}
