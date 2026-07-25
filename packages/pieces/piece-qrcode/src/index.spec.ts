import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it, vi } from 'vitest';
import { qrcode, qrcodeActions } from './index.js';

pieceContract({ piece: qrcode, service: 'qrcode', credentialType: 'none', actions: qrcodeActions });
describe('qrcode execution', () => { it('writes a QR code', async () => { const create = vi.fn().mockResolvedValue({ url: '/media/qr-code.png' }); const [tool] = qrcode.tools(); await expect(tool.execute({ text: 'FrogBot' }, { frogbot: { config: { pieceFiles: { collection: 'media' } }, create } } as never)).resolves.toBe('/media/qr-code.png'); }); });
