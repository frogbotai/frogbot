import ExifReader from 'exifreader';
import { z } from 'zod';

import { defineAction } from '../define.js';
import { imageFile, loadImage } from '../files.js';

const inputSchema = z.object({ image: imageFile.meta({ label: 'Image' }) });

export const getMetadata = defineAction({
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
  async run({ input, req }) {
    const image = await loadImage(req, input.image);

    return ExifReader.load(image.data);
  },
});
