import { describe, expect, it } from 'vitest';

import { embedOperation } from './embed.js';
import { embedManyOperation } from './embedMany.js';
import { generateImageOperation } from './generateImage.js';
import { generateSpeechOperation } from './generateSpeech.js';
import { generateTextOperation } from './generateText.js';
import { generateVideoOperation } from './generateVideo.js';
import { rerankOperation } from './rerank.js';
import { streamTextOperation } from './streamText.js';
import { transcribeOperation } from './transcribe.js';

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
