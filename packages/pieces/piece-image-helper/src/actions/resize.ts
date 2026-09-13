import { type PieceRunArgs } from 'frogbot/pieces';
import Jimp from 'jimp';
import { z } from 'zod';

import { imageFile, loadImage, savedImage, saveImage } from '../files.js';

const inputSchema = z.object({
  image: imageFile.meta({ label: 'Image' }),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  maintainAspectRatio: z.boolean().default(false),
  resultFileName: z.string().min(1).optional(),
});

export const resize = {
  slug: 'resize',
  label: 'Resize image',
  description: 'Resize an image to the requested dimensions.',
  input: inputSchema,
  output: savedImage,
  async run({ input, req }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const source = await loadImage(req, input.image);
    const image = await Jimp.read(source.data);

    image.resize(input.width, input.maintainAspectRatio ? Jimp.AUTO : input.height);

    const data = await image.getBufferAsync(image.getMIME());

    return saveImage({
      req,
      data,
      name: `${input.resultFileName ?? 'image'}.${image.getExtension()}`,
      mimeType: image.getMIME(),
    });
  },
};
