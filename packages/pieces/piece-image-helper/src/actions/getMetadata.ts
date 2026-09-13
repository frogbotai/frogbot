import ExifReader from 'exifreader';
import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { imageFile, loadImage } from '../files.js';

const inputSchema = z.object({ image: imageFile.meta({ label: 'Image' }) });

export const getMetadata = {
  slug: 'getMetadata',
  label: 'Get image metadata',
  description: 'Read metadata embedded in an image.',
  input: inputSchema,
  output: z.record(
    z.string(),
    z.object({
      value: z.unknown(),
      description: z.string().optional(),
    }),
  ),
  async run({ input, req }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const image = await loadImage(req, input.image);

    return ExifReader.load(image.data);
  },
};
