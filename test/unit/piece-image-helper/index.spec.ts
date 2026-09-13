import Jimp from 'jimp';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const convertHeic = vi.hoisted(() => vi.fn());

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));
vi.mock('heic-convert', () => ({ default: convertHeic }));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createImageHelper } from '../../../packages/pieces/piece-image-helper/src/index.js';

const imageHelper = createImageHelper();
const uploads: Array<{ data: Buffer; name: string; mimetype: string; size: number }> = [];

let source: Buffer;

beforeEach(async () => {
  source = await new Jimp(4, 2, 0xff0000ff).getBufferAsync(Jimp.MIME_PNG);
  uploads.length = 0;
  convertHeic.mockReset();
  convertHeic.mockImplementation(async () => source);

  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(source, { status: 200, headers: { 'content-type': 'image/png' } }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

function request({ mimeType = 'image/png' } = {}) {
  return {
    headers: new Headers({ authorization: 'Bearer test' }),
    url: 'https://frogbot.test/workflows',
    frogbot: {
      config: {
        files: { slug: 'files' },
        _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://frogbot.test' }) },
      },
      findByID: vi.fn(async () => ({
        id: 'source',
        filename: 'source.png',
        mimeType,
        url: '/api/files/source.png',
      })),
      create: vi.fn(async ({ file }: { file: (typeof uploads)[number] }) => {
        uploads.push(file);

        return { id: `saved-${uploads.length}`, url: `/api/files/${file.name}` };
      }),
    },
  } as never;
}

describe('image-helper definition', () => {
  it('registers every upstream action with semantic native names', () => {
    const definition = pieceFactoryDefinition(createImageHelper);

    expect(definition.actions.map((action) => action.slug)).toEqual([
      'imageToBase64',
      'getMetadata',
      'crop',
      'rotate',
      'resize',
      'compress',
      'convertFormat',
    ]);
  });
});

describe('image-helper execution', () => {
  it('converts an image to a data URL and supports a MIME override', async () => {
    const result = await imageHelper.imageToBase64({
      input: { image: 'source', mimeType: 'image/custom' },
      req: request(),
    });

    expect(result).toBe(`data:image/custom;base64,${source.toString('base64')}`);
  });

  it('reads real image metadata', async () => {
    const result = await imageHelper.getMetadata({
      input: { image: 'source' },
      req: request(),
    });

    expect(result).toMatchObject({
      'Image Width': { value: 4 },
      'Image Height': { value: 2 },
    });
  });

  it('crops an image and saves the resulting dimensions', async () => {
    const result = await imageHelper.crop({
      input: { image: 'source', left: 1, top: 0, width: 2, height: 1, resultFileName: 'crop' },
      req: request(),
    });
    const saved = await Jimp.read(uploads[0]!.data);

    expect(result).toMatchObject({ name: 'crop.png', mimeType: 'image/png' });
    expect([saved.bitmap.width, saved.bitmap.height]).toEqual([2, 1]);
  });

  it('rotates an image clockwise and saves it', async () => {
    const result = await imageHelper.rotate({
      input: { image: 'source', degrees: 90 },
      req: request(),
    });
    const saved = await Jimp.read(uploads[0]!.data);

    expect(result.name).toBe('image.png');
    expect([saved.bitmap.width, saved.bitmap.height]).toEqual([2, 4]);
  });

  it('resizes an image with and without preserving aspect ratio', async () => {
    await imageHelper.resize({
      input: { image: 'source', width: 8, height: 8, maintainAspectRatio: true },
      req: request(),
    });
    await imageHelper.resize({
      input: { image: 'source', width: 8, height: 8, maintainAspectRatio: false },
      req: request(),
    });

    const proportional = await Jimp.read(uploads[0]!.data);
    const fixed = await Jimp.read(uploads[1]!.data);

    expect([proportional.bitmap.width, proportional.bitmap.height]).toEqual([8, 4]);
    expect([fixed.bitmap.width, fixed.bitmap.height]).toEqual([8, 8]);
  });

  it('compresses an image to the requested format', async () => {
    const compressed = await imageHelper.compress({
      input: { image: 'source', quality: 60, format: 'jpg', resultFileName: 'small' },
      req: request(),
    });

    expect(compressed).toMatchObject({ name: 'small.jpg', mimeType: 'image/jpeg' });
    expect(uploads[0]!.data.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it.each([
    ['JPEG', 'jpg', 'image/jpeg'],
    ['PNG', 'png', 'image/png'],
    ['TIFF', 'tiff', 'image/tiff'],
    ['BMP', 'bmp', 'image/bmp'],
  ] as const)('converts an image to %s', async (outputFormat, extension, mimeType) => {
    const result = await imageHelper.convertFormat({
      input: { image: 'source', outputFormat, resultFileName: 'converted' },
      req: request(),
    });
    const converted = await Jimp.read(uploads[0]!.data);

    expect(result).toMatchObject({
      sourceMimeType: 'image/png',
      file: { name: `converted.${extension}`, mimeType },
    });
    expect([converted.bitmap.width, converted.bitmap.height]).toEqual([4, 2]);
  });

  it('converts an image to AVIF', async () => {
    const result = await imageHelper.convertFormat({
      input: { image: 'source', outputFormat: 'AVIF' },
      req: request(),
    });
    const metadata = await sharp(uploads[0]!.data).metadata();

    expect(result.file).toMatchObject({ name: 'image.avif', mimeType: 'image/avif' });
    expect(metadata).toMatchObject({ format: 'heif', width: 4, height: 2 });
  });

  it.each(['image/heic', 'image/heif'])('decodes %s before conversion', async (mimeType) => {
    const result = await imageHelper.convertFormat({
      input: { image: 'source', outputFormat: 'PNG' },
      req: request({ mimeType }),
    });

    expect(convertHeic).toHaveBeenCalledWith({ buffer: source, format: 'PNG' });
    expect(result).toMatchObject({
      sourceMimeType: mimeType,
      file: { name: 'image.png', mimeType: 'image/png' },
    });
  });

  it('rejects corrupt image input without saving a file', async () => {
    source = Buffer.from('not an image');

    await expect(
      imageHelper.resize({
        input: { image: 'source', width: 8, height: 8, maintainAspectRatio: false },
        req: request(),
      }),
    ).rejects.toThrow();

    expect(uploads).toEqual([]);
  });

  it('requires the configured files collection', async () => {
    const req = request() as never as { frogbot: { config: { files?: unknown } } };
    delete req.frogbot.config.files;

    await expect(
      imageHelper.imageToBase64({ input: { image: 'source' }, req: req as never }),
    ).rejects.toThrow('requires the files collection');
  });
});
