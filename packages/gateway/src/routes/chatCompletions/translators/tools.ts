import { jsonSchema, tool } from 'ai';
import type { OpenAITool } from './types.js';
import { RequestValidationError } from '../../../errors/gatewayError.js';

export function toAISDKTools(
  tools: OpenAITool[] | null | undefined,
): Record<string, ReturnType<typeof tool>> | undefined {
  if (!tools || tools.length === 0) return undefined;
  const result: Record<string, ReturnType<typeof tool>> = {};
  for (let i = 0; i < tools.length; i++) {
    const t = tools[i];
    if (t.type !== 'function') {
      throw new RequestValidationError({
        message: `Unsupported tool type: ${JSON.stringify(t.type)}. Only 'function' tools are supported.`,
        param: `tools[${i}].type`,
      });
    }
    if (!t.function) {
      throw new RequestValidationError({
        message: 'Function tools must include a `function` object.',
        param: `tools[${i}].function`,
      });
    }
    result[t.function.name] = tool({
      description: t.function.description ?? undefined,
      inputSchema: jsonSchema(t.function.parameters ?? { type: 'object', properties: {} }),
      strict: t.function.strict ?? undefined,
    });
  }
  return result;
}

export type AISDKToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'tool'; toolName: string };

export type AISDKToolChoiceResult = {
  toolChoice: AISDKToolChoice | undefined;
  activeTools: string[] | undefined;
};

export function toAISDKToolChoice(toolChoice: unknown): AISDKToolChoiceResult {
  if (toolChoice == null) return { toolChoice: undefined, activeTools: undefined };
  if (toolChoice === 'none') return { toolChoice: 'none', activeTools: undefined };
  if (toolChoice === 'auto') return { toolChoice: 'auto', activeTools: undefined };
  if (toolChoice === 'required') return { toolChoice: 'required', activeTools: undefined };
  if (typeof toolChoice === 'object' && toolChoice !== null) {
    const tc = toolChoice as {
      type?: string;
      function?: { name?: string };
      allowed_tools?: {
        mode?: string;
        tools?: Array<{ function?: { name?: string } }>;
      };
    };
    if (tc.type === 'function' && tc.function?.name) {
      return { toolChoice: { type: 'tool', toolName: tc.function.name }, activeTools: undefined };
    }
    // OpenAI `allowed_tools` → AI SDK `toolChoice` (the mode) + `activeTools`
    // (the list of tool names the model is allowed to call).
    if (tc.type === 'allowed_tools' && tc.allowed_tools) {
      const mode = tc.allowed_tools.mode;
      if (mode !== 'auto' && mode !== 'required') {
        throw new RequestValidationError({
          message: `Unsupported \`tool_choice.allowed_tools.mode\`: ${JSON.stringify(mode)}. Expected "auto" or "required".`,
          param: 'tool_choice',
        });
      }
      const activeTools = (tc.allowed_tools.tools ?? [])
        .map((toolRef) => toolRef.function?.name)
        .filter((name): name is string => typeof name === 'string');
      return { toolChoice: mode, activeTools };
    }
  }
  throw new RequestValidationError({
    message: `Unsupported \`tool_choice\` shape: ${JSON.stringify(toolChoice)}.`,
    param: 'tool_choice',
  });
}
