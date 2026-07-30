import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it, vi } from 'vitest';

import { createPdf, pdfActions } from './index.js';

const pdf = createPdf();

pieceContract({ piece: pdf, service: 'pdf', credentialType: 'none', actions: pdfActions });
describe('pdf execution', () => { it('writes a PDF', async () => { const create = vi.fn().mockResolvedValue({ url: '/media/text.pdf' }); const tool = pdf.textToPdf; await expect(tool.execute({ text: 'FrogBot' }, { frogbot: { config: { files: { slug: 'media' } }, create } } as never)).resolves.toBe('/media/text.pdf'); expect(create).toHaveBeenCalled(); }); });
