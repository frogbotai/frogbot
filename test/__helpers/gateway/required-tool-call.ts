import type { LanguageModelV4CallOptions, LanguageModelV4Content } from '@ai-sdk/provider';

export function requiredToolCall(options: LanguageModelV4CallOptions): LanguageModelV4Content[] {
  const choice = options.toolChoice;

  if (choice?.type !== 'required' && choice?.type !== 'tool') return [];

  const tool =
    choice.type === 'tool'
      ? options.tools?.find((candidate) => candidate.name === choice.toolName)
      : options.tools?.[0];

  if (!tool) return [];

  return [
    {
      type: 'tool-call',
      toolCallId: 'mock-call-1',
      toolName: tool.name,
      input: '{}',
      ...(tool.type === 'provider' ? { providerExecuted: true } : {}),
    },
  ];
}
