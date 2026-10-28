import { describe, expect, it, vi } from 'vitest';

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
