import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it } from 'vitest';
import { dataSummarizer, dataSummarizerActions } from './index.js';

pieceContract({ piece: dataSummarizer, service: 'data_summarizer', credentialType: 'none', actions: dataSummarizerActions });
describe('data summarizer execution', () => { it('calculates a sum', async () => { const [tool] = dataSummarizer.tools({ actions: ['calculateSum'] }); await expect(tool.execute({ values: [2, 3] }, {} as never)).resolves.toEqual({ sum: 5 }); }); });
