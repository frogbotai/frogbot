import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { imageFile, loadImage } from '../files.js';

const inputSchema = z.object({
  image: imageFile.meta({ label: 'Image' }),
  mimeType: z.string().min(1).optional().meta({ label: 'Override MIME type' }),
});

export const imageToBase64 = {
  slug: 'imageToBase64',
  label: 'Convert image to Base64',
  description: 'Convert an image to a Base64 data URL.',
  input: inputSchema,
  output: z.string().regex(/^data:[^;,]+;base64,[A-Za-z0-9+/]*={0,2}$/),
  async run({ input, req }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const image = await loadImage(req, input.image);

    return `data:${input.mimeType ?? image.mimeType};base64,${image.data.toString('base64')}`;
  },
};
