import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import type { Mock } from 'vitest';
import { vi } from 'vitest';

type DoGenerate = LanguageModelV4['doGenerate'];

type DoStream = LanguageModelV4['doStream'];

export function v4Usage(inputTokens: number, outputTokens: number): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: inputTokens,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: outputTokens, text: undefined, reasoning: undefined },
  };
}

export function generateResult(
  overrides: Partial<LanguageModelV4GenerateResult> = {},
): LanguageModelV4GenerateResult {
  return {
    content: [{ type: 'text', text: 'ok' }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: v4Usage(1, 1),
    warnings: [],
    ...overrides,
  };
}

export function mockDoGenerate(
  result: LanguageModelV4GenerateResult = generateResult(),
): Mock<DoGenerate> {
  return vi.fn<DoGenerate>(() => Promise.resolve(result));
}

export function mockDoStream(parts: LanguageModelV4StreamPart[]): Mock<DoStream> {
  return vi.fn<DoStream>(() =>
    Promise.resolve({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          for (const part of parts) controller.enqueue(part);

          controller.close();
        },
      }),
    }),
  );
}

export function firstCallOptions(
  fn: Mock<DoGenerate> | Mock<DoStream>,
): LanguageModelV4CallOptions {
  const call = fn.mock.calls[0];
  if (!call) throw new Error('the model was not called');

  return call[0];
}
