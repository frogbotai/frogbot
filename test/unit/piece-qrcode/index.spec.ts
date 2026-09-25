import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../packages/frogbot/src/getFrogBot.js', () => ({
  createDefaultRequest: vi.fn(),
}));
vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/pieces/definePiece.js'));

import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createQrCode } from '../../../packages/pieces/piece-qrcode/src/index.js';

function fixture(files: { slug: string } | null = { slug: 'media' }) {
  const create = vi.fn().mockResolvedValue({
    id: 'saved-qr-code',
    url: '/api/media/saved-qr-code/qr-code.png',
  });
  const req = {
    signal: undefined,
    frogbot: {
      config: { files },
      create,
    },
  } as never;

  return { create, qrCode: createQrCode(), req };
}

describe('QR Code', () => {
  it('exposes the complete native contract with a semantic action name', () => {
    const qrCode = createQrCode();
    const definition = pieceFactoryDefinition(createQrCode);

    expect(definition.actions.map(({ slug }) => slug)).toEqual(['createQrCode']);
    expect(pieceInstanceTools(qrCode)?.map(({ slug }) => slug)).toEqual(['qrcode_createQrCode']);
    expect(qrCode.triggers).toEqual({});
    expect(definition.auth).toBeUndefined();
    expect(definition.client).toBeUndefined();
  });

  it('generates a real PNG and saves it through the configured files collection', async () => {
    const { create, qrCode, req } = fixture();

    await expect(qrCode.createQrCode({ input: { text: 'FrogBot' }, req })).resolves.toEqual({
      id: 'saved-qr-code',
      name: 'qr-code.png',
      mimeType: 'image/png',
      size: expect.any(Number),
      url: '/api/media/saved-qr-code/qr-code.png',
    });

    expect(create).toHaveBeenCalledTimes(1);

    const call = create.mock.calls[0]![0];

    expect(call).toMatchObject({
      collection: 'media',
      data: {},
      req,
      overrideAccess: false,
      file: {
        name: 'qr-code.png',
        mimetype: 'image/png',
        size: expect.any(Number),
      },
    });
    expect(Buffer.isBuffer(call.file.data)).toBe(true);
    expect(call.file.data.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(call.file.size).toBe(call.file.data.length);
  });

  it('validates content before generating or saving a file', async () => {
    const { create, qrCode, req } = fixture();

    await expect(qrCode.createQrCode({ input: { text: '' }, req })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it('requires the FrogBot files collection', async () => {
    const { create, qrCode, req } = fixture(null);

    await expect(qrCode.createQrCode({ input: { text: 'FrogBot' }, req })).rejects.toThrow(
      '[frogbot] QR Code requires the files collection.',
    );
    expect(create).not.toHaveBeenCalled();
  });
});
