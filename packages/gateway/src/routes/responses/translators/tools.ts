import { jsonSchema, tool, type ToolSet } from 'ai';

import { UnsupportedModalityError } from '../../../errors/gatewayError.js';
import type { ResponsesFunctionTool } from '../schema.js';

// OpenAI hosted (built-in) tool types. These are executed by the OpenAI
// Responses upstream itself; the AI SDK forwards them as provider-defined
// tools (`{ type: 'provider', id: 'openai.<tool>', args }`), which
// openai-responses-prepare-tools.ts maps back onto the wire.
const HOSTED_TOOL_TYPES = new Set([
  'web_search',
  'web_search_preview',
  'file_search',
  'code_interpreter',
  'image_generation',
  'computer_use_preview',
  'local_shell',
  'mcp',
  'apply_patch',
]);

// OpenAI Responses tools use a flat shape (`{ type, name, parameters }`),
// unlike chat completions' nested `{ type, function: { name, ... } }`.
// Function tools become AI SDK tools; hosted tools become provider-defined
// tools (OpenAI upstream only). A hosted tool on a non-OpenAI upstream can
// never execute, so it is rejected rather than silently dropped.
export function toResponsesTools(
  tools: Array<ResponsesFunctionTool | { type: string }> | null | undefined,
  providerName: string,
): ToolSet | undefined {
  if (!tools || tools.length === 0) return undefined;
  const result: ToolSet = {};
  for (const t of tools) {
    if (t.type === 'function') {
      const fn = t as ResponsesFunctionTool;
      result[fn.name] = tool({
        description: fn.description ?? undefined,
        inputSchema: jsonSchema(fn.parameters ?? { type: 'object', properties: {} }),
      });
      continue;
    }

    if (HOSTED_TOOL_TYPES.has(t.type)) {
      if (providerName !== 'openai') {
        throw new UnsupportedModalityError({
          provider: providerName,
          modality: `hosted tool "${t.type}"`,
          param: 'tools',
        });
      }
      const { type, ...args } = t as { type: string } & Record<string, unknown>;
      result[type] = {
        type: 'provider',
        id: `openai.${type}`,
        args: args as Record<string, unknown>,
      } as unknown as ToolSet[string];
      continue;
    }

    throw new UnsupportedModalityError({
      provider: providerName,
      modality: `tool type "${t.type}"`,
      param: 'tools',
    });
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function toResponsesToolChoice(
  toolChoice: unknown,
): 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string } | undefined {
  if (toolChoice == null) return undefined;
  if (toolChoice === 'none') return 'none';
  if (toolChoice === 'auto') return 'auto';
  if (toolChoice === 'required') return 'required';
  if (typeof toolChoice === 'object') {
    const tc = toolChoice as { type?: string; name?: string; function?: { name?: string } };
    // Responses uses a flat `{ type: 'function', name }`; tolerate the nested
    // chat shape too.
    const name = tc.name ?? tc.function?.name;
    if (tc.type === 'function' && name) {
      return { type: 'tool', toolName: name };
    }
    // Hosted tool_choice (`{ type: 'web_search' }`, etc.) → the AI SDK
    // `{ type: 'tool', toolName }` shape, which openai-responses maps back to
    // `{ type: '<tool>' }` on the wire.
    if (tc.type && HOSTED_TOOL_TYPES.has(tc.type)) {
      return { type: 'tool', toolName: tc.type };
    }
  }
  return undefined;
}
