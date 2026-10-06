import { createPieceFile, definePiece, filesCollectionSlug } from 'frogbot/pieces';
import { toBuffer } from 'qrcode';
import { z } from 'zod';

import { defineAction } from './define.js';

const inputSchema = z.object({
  text: z.string().min(1).meta({ label: 'Content' }),
});

const outputSchema = z.object({
  id: z.union([z.string().min(1), z.number()]),
  name: z.literal('qr-code.png'),
  mimeType: z.literal('image/png'),
  size: z.number().int().positive(),
  url: z.string().min(1).optional(),
});

const createQrCodeAction = defineAction({
  slug: 'createQrCode',
  description: 'Create a QR code image from text.',
  input: inputSchema,
  output: outputSchema,
  idempotent: false,
  async run({ input, req }) {
    filesCollectionSlug(req, 'QR Code');

    req.signal?.throwIfAborted();

    const data = await toBuffer(input.text);
    const name = 'qr-code.png';
    const mimeType = 'image/png';

    req.signal?.throwIfAborted();

    const file = await createPieceFile(req, 'QR Code', {
      file: { data, name, mimetype: mimeType, size: data.length },
      req,
      overrideAccess: false,
    });

    return {
      id: file.id,
      name,
      mimeType,
      size: data.length,
      url: typeof file.url === 'string' ? file.url : undefined,
    };
  },
});

export const createQrCode = definePiece({
  slug: 'qrcode',
  label: 'QR Code',
  admin: {
    description: 'Create QR code images from text',
    group: 'Core',
  },
  actions: [createQrCodeAction],
});
