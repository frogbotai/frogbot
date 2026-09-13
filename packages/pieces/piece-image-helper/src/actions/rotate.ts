import { type PieceRunArgs } from 'frogbot/pieces';
import Jimp from 'jimp';
import { z } from 'zod';

import { imageFile, loadImage, savedImage, saveImage } from '../files.js';

const inputSchema = z.object({
  image: imageFile.meta({ label: 'Image' }),
  degrees: z.union([z.literal(90), z.literal(180), z.literal(270)]),
  resultFileName: z.string().min(1).optional(),
});

export const rotate = {
  slug: 'rotate',
  label: 'Rotate image',
  description: 'Rotate an image clockwise.',
  input: inputSchema,
  output: savedImage,
  async run({ input, req }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const source = await loadImage(req, input.image);
    const image = await Jimp.read(source.data);

    image.rotate(-input.degrees);

    const data = await image.getBufferAsync(image.getMIME());

    return saveImage({
      req,
      data,
      name: `${input.resultFileName ?? 'image'}.${image.getExtension()}`,
      mimeType: image.getMIME(),
    });
  },
};
