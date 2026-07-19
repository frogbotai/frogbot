import { jsonSchema, tool, type JSONValue } from 'ai';

export type AnthropicToolDef = {
  name: string;
  description?: string | null;
  input_schema?: Record<string, unknown> | null;
  cache_control?: {
    type: 'ephemeral';
    ttl?: '5m' | '1h' | '24h' | null;
  } | null;
  strict?: boolean | null;
  type?: string | null;
};

export function toAISDKTools(
  tools: AnthropicToolDef[] | null | undefined,
): Record<string, ReturnType<typeof tool>> | undefined {
  if (!tools || tools.length === 0) return undefined;
  const result: Record<string, ReturnType<typeof tool>> = {};
  for (const t of tools) {
    if (t.type !== undefined && t.type !== null && t.type !== 'custom') {
      continue;
    }
    // Per-tool cache_control rides providerOptions.anthropic.cacheControl —
    // the key the AI SDK anthropic provider reads (anthropic-prepare-tools.ts
    // via get-cache-control.ts). Tool providerOptions are NOT walked by
    // forwardMessageProviderOptions, so the namespace is set directly.
    let providerOptions: Record<string, Record<string, JSONValue>> | undefined;
    if (t.cache_control) {
      const cacheControl: Record<string, JSONValue> = {
        type: t.cache_control.type,
      };
      if (t.cache_control.ttl) {
        cacheControl.ttl = t.cache_control.ttl;
      }
      providerOptions = { anthropic: { cacheControl } };
    }
    result[t.name] = tool({
      description: t.description ?? undefined,
      inputSchema: jsonSchema(t.input_schema ?? { type: 'object', properties: {} }),
      strict: t.strict ?? undefined,
      providerOptions,
    });
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Map Anthropic `tool_choice` to AI SDK's `toolChoice` parameter.
 *
 * Anthropic formats:
 *   - `{ type: 'auto' }` → 'auto'
 *   - `{ type: 'any' }` → 'required'
 *   - `{ type: 'none' }` → 'none'  (undocumented but used)
 *   - `{ type: 'tool', name: '...' }` → { type: 'tool', toolName: '...' }
 */
export function toAISDKToolChoice(
  toolChoice: unknown,
): 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string } | undefined {
  if (toolChoice == null) return undefined;
  if (typeof toolChoice !== 'object') return undefined;
  const tc = toolChoice as { type?: string; name?: string };
  switch (tc.type) {
    case 'auto':
      return 'auto';
    case 'any':
      return 'required';
    case 'none':
      return 'none';
    case 'tool': {
      if (tc.name) return { type: 'tool', toolName: tc.name };
      return 'auto';
    }
    default:
      return undefined;
  }
}
