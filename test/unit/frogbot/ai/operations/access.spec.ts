import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { embedOperation } from '../../../../../packages/frogbot/src/ai/operations/embed.js';
import { embedManyOperation } from '../../../../../packages/frogbot/src/ai/operations/embedMany.js';
import { evaluateOperation } from '../../../../../packages/frogbot/src/ai/operations/evaluate.js';
import { generateImageOperation } from '../../../../../packages/frogbot/src/ai/operations/generateImage.js';
import { generateSpeechOperation } from '../../../../../packages/frogbot/src/ai/operations/generateSpeech.js';
import { generateTextOperation } from '../../../../../packages/frogbot/src/ai/operations/generateText.js';
import { generateVideoOperation } from '../../../../../packages/frogbot/src/ai/operations/generateVideo.js';
import { rerankOperation } from '../../../../../packages/frogbot/src/ai/operations/rerank.js';
import { streamTextOperation } from '../../../../../packages/frogbot/src/ai/operations/streamText.js';
import { transcribeOperation } from '../../../../../packages/frogbot/src/ai/operations/transcribe.js';

describe('AI operation access', () => {
  const operations = [
    embedOperation,
    embedManyOperation,
    evaluateOperation,
    generateImageOperation,
    generateSpeechOperation,
    generateTextOperation,
    generateVideoOperation,
    rerankOperation,
    streamTextOperation,
    transcribeOperation,
  ];

  it.each(operations.map((operation) => [operation.name, operation] as const))(
    '%s passes the requested router slug to access and rejects with its error',
    async (_, operation) => {
      const error = Object.assign(new Error('Model not allowed'), {
        status: 403,
        code: 'model_not_allowed',
      });

      const deny = vi.fn((_: { req: unknown; model: string }): boolean => {
        throw error;
      });

      const config = {
        routers: { smart: { model: 'openai/gpt-4o' } },
        access: { generate: deny, embed: deny, transcribe: deny, rerank: deny, evaluate: deny },
      };

      const req = { user: { id: 'user-1' } };

      await expect(operation({ config } as never, { model: 'smart', req } as never)).rejects.toBe(
        error,
      );
      expect(deny).toHaveBeenCalledExactlyOnceWith({ req, model: 'smart' });
    },
  );
});

describe('direct tool context', () => {
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };

  function setup() {
    let step = 0;
    const model = new MockLanguageModelV4({
      doGenerate: () =>
        Promise.resolve(
          step++ === 0
            ? {
                content: [
                  { type: 'tool-call', toolCallId: 'call-1', toolName: 'lookup', input: '{}' },
                ],
                finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                usage,
                warnings: [],
              }
            : {
                content: [{ type: 'text', text: 'done' }],
                finishReason: { unified: 'stop', raw: 'stop' },
                usage,
                warnings: [],
              },
        ) as never,
    });

    const execute = vi.fn((_input: unknown, ctx: { overrideAccess: boolean }) => ({
      trusted: ctx.overrideAccess,
    }));

    const req = { user: { id: 'user-1' } };
    const deps = {
      gateway: {
        operation: () => ({
          start: async () => {},
          finish: async () => {},
          chatModel: () => model,
        }),
      },
      config: { routers: {}, access: { generate: () => true } },
      frogbot: { createRequest: (value: unknown) => Promise.resolve(value) },
    };

    const tools = [{ slug: 'lookup', description: 'Look up', inputSchema: z.object({}), execute }];

    return { deps, execute, req, tools };
  }

  it.each([
    [undefined, false],
    [false, false],
    [true, true],
  ] as const)('gives tools overrideAccess %s as %s', async (overrideAccess, expected) => {
    const { deps, execute, req, tools } = setup();

    await generateTextOperation(
      deps as never,
      {
        model: 'openai/gpt-4o',
        prompt: 'Hello',
        req,
        tools,
        ...(overrideAccess === undefined ? {} : { overrideAccess }),
      } as never,
    );

    expect(execute).toHaveBeenCalledExactlyOnceWith(
      {},
      expect.objectContaining({ overrideAccess: expected }),
    );
  });
});
