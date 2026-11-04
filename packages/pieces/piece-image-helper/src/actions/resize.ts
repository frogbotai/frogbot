import Jimp from 'jimp';
import { z } from 'zod';

import { defineAction } from '../define.js';
import { imageFile, loadImage, savedImage, saveImage } from '../files.js';

const inputSchema = z.object({
  image: imageFile.meta({ label: 'Image' }),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  maintainAspectRatio: z.boolean().default(false),
  resultFileName: z.string().min(1).optional(),
});

export const resize = defineAction({
  slug: 'resize',
  label: 'Resize image',
  description: 'Resize an image to the requested dimensions.',
  input: inputSchema,
  output: savedImage,
  async run({ input, req, overrideAccess }) {
    const source = await loadImage(req, input.image, overrideAccess);
    const image = await Jimp.read(source.data);

    image.resize(input.width, input.maintainAspectRatio ? Jimp.AUTO : input.height);

    const data = await image.getBufferAsync(image.getMIME());

    return saveImage({
      req,
      overrideAccess,
      data,
      name: `${input.resultFileName ?? 'image'}.${image.getExtension()}`,
      mimeType: image.getMIME(),
    });
  },
});
