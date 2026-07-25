import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it, vi } from 'vitest';
import { pdf, pdfActions } from './index.js';

pieceContract({ piece: pdf, service: 'pdf', credentialType: 'none', actions: pdfActions });
describe('pdf execution', () => { it('writes a PDF', async () => { const create = vi.fn().mockResolvedValue({ url: '/media/text.pdf' }); const [tool] = pdf.tools({ actions: ['textToPdf'] }); await expect(tool.execute({ text: 'FrogBot' }, { frogbot: { config: { pieceFiles: { collection: 'media' } }, create } } as never)).resolves.toBe('/media/text.pdf'); expect(create).toHaveBeenCalled(); }); });
