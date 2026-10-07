import { jsonSchema, tool, type ToolSet } from 'ai';

import { UnsupportedModalityError } from '../../../errors/gatewayError.js';
import type { ResponsesFunctionTool } from '../schema.js';

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

const CLIENT_EXECUTED_TOOL_TYPES = new Set(['computer_use_preview', 'local_shell', 'apply_patch']);

const inputSchema = jsonSchema<Record<string, never>>({
  type: 'object',
  properties: {},
  additionalProperties: false,
});

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
      const hosted = { type: 'provider', id: `openai.${type}`, args, inputSchema } as const;

      result[type] = CLIENT_EXECUTED_TOOL_TYPES.has(type)
        ? { ...hosted, isProviderExecuted: false }
        : { ...hosted, isProviderExecuted: true };

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
    const name = tc.name ?? tc.function?.name;
    if (tc.type === 'function' && name) {
      return { type: 'tool', toolName: name };
    }

    if (tc.type && HOSTED_TOOL_TYPES.has(tc.type)) {
      return { type: 'tool', toolName: tc.type };
    }
  }

  return undefined;
}
