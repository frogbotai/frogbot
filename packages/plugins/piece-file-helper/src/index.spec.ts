import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it, vi } from 'vitest';
import { fileHelper, fileHelperActions } from './index.js';

pieceContract({ piece: fileHelper, service: 'file_helper', credentialType: 'none', actions: fileHelperActions });
describe('file helper execution', () => { it('writes a file', async () => { const create = vi.fn().mockResolvedValue({ url: '/media/result.txt' }); const [tool] = fileHelper.tools({ actions: ['createFile'] }); await expect(tool.execute({ content: 'FrogBot', fileName: 'result.txt', encoding: 'utf8' }, { frogbot: { config: { pieceFiles: { collection: 'media' } }, create } } as never)).resolves.toEqual({ fileName: 'result.txt', url: '/media/result.txt' }); }); });
