import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it, vi } from 'vitest';
import { createFileHelper, fileHelperActions } from './index.js';

const fileHelper = createFileHelper();

pieceContract({ piece: fileHelper, service: 'file_helper', credentialType: 'none', actions: fileHelperActions });
describe('file helper execution', () => { it('writes a file', async () => { const create = vi.fn().mockResolvedValue({ url: '/media/result.txt' }); const tool = fileHelper.createFile; await expect(tool.execute({ content: 'FrogBot', fileName: 'result.txt', encoding: 'utf8' }, { frogbot: { config: { files: { slug: 'media' } }, create } } as never)).resolves.toEqual({ fileName: 'result.txt', url: '/media/result.txt' }); }); });
