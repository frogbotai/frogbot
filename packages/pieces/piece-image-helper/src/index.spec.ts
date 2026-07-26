import { createServer } from 'node:http';
import { once } from 'node:events';
import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it, vi } from 'vitest';
import { createImageHelper, imageHelperActions } from './index.js';

const imageHelper = createImageHelper();

pieceContract({ piece: imageHelper, service: 'image_helper', credentialType: 'none', actions: imageHelperActions });
describe('image helper execution', () => { it('downloads and writes an image', async () => { const image = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'); const server = createServer((_req, res) => res.end(image)); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture address.'); const create = vi.fn().mockResolvedValue({ url: '/media/image.gif' }); const tool = imageHelper.rotateImage; try { await expect(tool.execute({ image: `http://127.0.0.1:${address.port}/image.gif`, degree: 90 }, { frogbot: { config: { files: { slug: 'media' } }, create } } as never)).resolves.toBe('/media/image.gif'); } finally { await new Promise<void>((resolve) => server.close(() => resolve())); } }); });
