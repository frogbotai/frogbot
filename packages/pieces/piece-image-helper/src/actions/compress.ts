import Jimp from 'jimp';
import { z } from 'zod';

import { defineAction } from '../define.js';
import { imageFile, loadImage, savedImage, saveImage } from '../files.js';

const inputSchema = z.object({
  image: imageFile.meta({ label: 'Image' }),
  quality: z.union([z.literal(90), z.literal(60)]),
  format: z.enum(['jpg', 'png']),
  resultFileName: z.string().min(1).optional(),
});

export const compress = defineAction({
  slug: 'compress',
  label: 'Compress image',
  description: 'Compress an image with the selected quality.',
  input: inputSchema,
  output: savedImage,
  async run({ input, req, overrideAccess }) {
    const source = await loadImage(req, input.image, overrideAccess);
    const image = await Jimp.read(source.data);
    const mimeType = input.format === 'jpg' ? Jimp.MIME_JPEG : Jimp.MIME_PNG;

    image.quality(input.quality);

    const data = await image.getBufferAsync(mimeType);

    return saveImage({
      req,
      overrideAccess,
      data,
      name: `${input.resultFileName ?? 'image'}.${input.format}`,
      mimeType,
    });
  },
});
