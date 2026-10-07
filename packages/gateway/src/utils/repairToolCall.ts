import type { ToolCallRepairFunction, ToolSet } from 'ai';

/**
 * Build a `repairToolCall` function suitable for `generateText`/`streamText`.
 * The returned function rewrites the call to a no-op `invalid` tool so the
 * next step sees a legible tool-result and can retry with a valid call.
 *
 * Returns `undefined` if the AI SDK surface is unavailable — callers should
 * forward that as-is (AI SDK treats `undefined` as "no repair").
 */
export function createRepairToolCall<TOOLS extends ToolSet>():
  ToolCallRepairFunction<TOOLS> | undefined {
  try {
    const repair: ToolCallRepairFunction<TOOLS> = ({ toolCall }) => {
      return Promise.resolve({
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
      } as Awaited<ReturnType<ToolCallRepairFunction<TOOLS>>>);
    };

    return repair;
  } catch {
    return undefined;
  }
}
