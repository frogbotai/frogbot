import { type PieceRunArgs } from 'frogbot/pieces';
import Jimp from 'jimp';
import { z } from 'zod';

import { imageFile, loadImage, savedImage, saveImage } from '../files.js';

const inputSchema = z.object({
  image: imageFile.meta({ label: 'Image' }),
  left: z.number().int().nonnegative(),
  top: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  resultFileName: z.string().min(1).optional(),
});

export const crop = {
  slug: 'crop',
  label: 'Crop image',
  description: 'Crop a rectangular region from an image.',
  input: inputSchema,
  output: savedImage,
  async run({ input, req }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const source = await loadImage(req, input.image);
    const image = await Jimp.read(source.data);

    image.crop(input.left, input.top, input.width, input.height);

    const data = await image.getBufferAsync(image.getMIME());

    return saveImage({
      req,
      data,
      name: `${input.resultFileName ?? 'image'}.${image.getExtension()}`,
      mimeType: image.getMIME(),
    });
  },
};
