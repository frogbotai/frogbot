import { type PieceRunArgs } from 'frogbot/pieces';
import convertHeic from 'heic-convert';
import Jimp from 'jimp';
import sharp from 'sharp';
import { z } from 'zod';

import { imageFile, loadImage, savedImage, saveImage } from '../files.js';

const inputSchema = z.object({
  image: imageFile.meta({ label: 'Image' }),
  outputFormat: z.enum(['JPEG', 'PNG', 'TIFF', 'BMP', 'AVIF']),
  resultFileName: z.string().min(1).optional(),
});

const output = z.object({
  file: savedImage,
  sourceMimeType: z.string().min(1),
});

type RasterFormat = Exclude<z.output<typeof inputSchema>['outputFormat'], 'AVIF'>;

const formats: Record<RasterFormat, { extension: string; mimeType: string }> = {
  JPEG: { extension: 'jpg', mimeType: Jimp.MIME_JPEG },
  PNG: { extension: 'png', mimeType: Jimp.MIME_PNG },
  TIFF: { extension: 'tiff', mimeType: Jimp.MIME_TIFF },
  BMP: { extension: 'bmp', mimeType: Jimp.MIME_BMP },
};

export const convertFormat = {
  slug: 'convertFormat',
  label: 'Convert image format',
  description: 'Convert an image to JPEG, PNG, TIFF, BMP, or AVIF.',
  input: inputSchema,
  output,
  async run({ input, req }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const source = await loadImage(req, input.image);
    const sourceData = ['image/heic', 'image/heif'].includes(source.mimeType)
      ? Buffer.from(await convertHeic({ buffer: source.data, format: 'PNG' }))
      : source.data;

    let data: Buffer;
    let extension: string;
    let mimeType: string;

    if (input.outputFormat === 'AVIF') {
      data = await sharp(sourceData).avif().toBuffer();
      extension = 'avif';
      mimeType = 'image/avif';
    } else {
      const format = formats[input.outputFormat];
      const image = await Jimp.read(sourceData);

      data = await image.getBufferAsync(format.mimeType);
      extension = format.extension;
      mimeType = format.mimeType;
    }

    const file = await saveImage({
      req,
      data,
      name: `${input.resultFileName ?? 'image'}.${extension}`,
      mimeType,
    });

    return { file, sourceMimeType: source.mimeType };
  },
};
