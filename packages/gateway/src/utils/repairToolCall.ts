// Scaffolding for AI SDK's `experimental_repairToolCall` — hardens the
// chat routes against models that emit invalid or unknown tool calls.
//
// Strategy: rather than surfacing a hard failure, redirect the malformed
// call to a synthetic `invalid` tool that the model can observe in the
// subsequent turn and self-correct from. This is the opencode pattern
// (`session/llm.ts:343-363`) applied at the gateway layer.
//
// The wrapper is defensive: if the AI SDK's experimental surface changes,
// we degrade gracefully and let the original error propagate.

import type { ToolCallRepairFunction, ToolSet } from 'ai';

/**
 * Build a `repairToolCall` function suitable for `generateText`/`streamText`.
 * The returned function rewrites the call to a no-op `invalid` tool so the
 * next step sees a legible tool-result and can retry with a valid call.
 *
 * Returns `undefined` if the AI SDK surface is unavailable — callers should
 * forward that as-is (AI SDK treats `undefined` as "no repair").
 */
export function createRepairToolCall<TOOLS extends ToolSet>(): ToolCallRepairFunction<TOOLS> | undefined {
  try {
    const repair: ToolCallRepairFunction<TOOLS> = async ({ toolCall }) => {
      return {
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: 'invalid',
        input: JSON.stringify({
          reason: `unknown or malformed tool call: "${toolCall.toolName}"`,
          original: toolCall,
        }),
        providerExecuted: false,
        providerMetadata: undefined,
        invalid: false,
      } as Awaited<ReturnType<ToolCallRepairFunction<TOOLS>>>;
    };
    return repair;
  } catch {
    return undefined;
  }
}
