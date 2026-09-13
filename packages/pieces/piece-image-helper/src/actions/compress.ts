import { type PieceRunArgs } from 'frogbot/pieces';
import Jimp from 'jimp';
import { z } from 'zod';

import { imageFile, loadImage, savedImage, saveImage } from '../files.js';

const inputSchema = z.object({
  image: imageFile.meta({ label: 'Image' }),
  quality: z.union([z.literal(90), z.literal(60)]),
  format: z.enum(['jpg', 'png']),
  resultFileName: z.string().min(1).optional(),
});

export const compress = {
  slug: 'compress',
  label: 'Compress image',
  description: 'Compress an image with the selected quality.',
  input: inputSchema,
  output: savedImage,
  async run({ input, req }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const source = await loadImage(req, input.image);
    const image = await Jimp.read(source.data);
    const mimeType = input.format === 'jpg' ? Jimp.MIME_JPEG : Jimp.MIME_PNG;

    image.quality(input.quality);

    const data = await image.getBufferAsync(mimeType);

    return saveImage({
      req,
      data,
      name: `${input.resultFileName ?? 'image'}.${input.format}`,
      mimeType,
    });
  },
};
