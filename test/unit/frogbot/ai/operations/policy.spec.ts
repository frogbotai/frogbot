import { describe, expect, it } from 'vitest';

import { embedOperation } from '../../../../../packages/frogbot/src/ai/operations/embed.js';
import { embedManyOperation } from '../../../../../packages/frogbot/src/ai/operations/embedMany.js';
import { generateImageOperation } from '../../../../../packages/frogbot/src/ai/operations/generateImage.js';
import { generateSpeechOperation } from '../../../../../packages/frogbot/src/ai/operations/generateSpeech.js';
import { generateTextOperation } from '../../../../../packages/frogbot/src/ai/operations/generateText.js';
import { generateVideoOperation } from '../../../../../packages/frogbot/src/ai/operations/generateVideo.js';
import { rerankOperation } from '../../../../../packages/frogbot/src/ai/operations/rerank.js';
import { streamTextOperation } from '../../../../../packages/frogbot/src/ai/operations/streamText.js';
import { transcribeOperation } from '../../../../../packages/frogbot/src/ai/operations/transcribe.js';

describe('AI operation policy', () => {
  const operations = [
    embedOperation,
    embedManyOperation,
    generateImageOperation,
    generateSpeechOperation,
    generateTextOperation,
    generateVideoOperation,
    rerankOperation,
    streamTextOperation,
    transcribeOperation,
  ];

  it.each(operations)('rejects an unselected raw target before resolving it', async (operation) => {
    const req = {
      user: { id: 'user-1', modelAccess: 'selected', models: ['router'] },
    };
    await expect(
      operation({} as never, { model: 'openai/gpt-4o', req } as never),
    ).rejects.toMatchObject({ code: 'model_not_allowed', status: 403 });
  });
});
