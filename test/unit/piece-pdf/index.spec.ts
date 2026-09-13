import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@frogbotai/gateway', () => ({ calculateModelCostUSD: vi.fn() }));
vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceInstanceTools } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createPdf } from '../../../packages/pieces/piece-pdf/src/index.js';

const actions = [
  'extractPdfText',
  'createPdfFromText',
  'createPdfFromImage',
  'countPdfPages',
  'extractPdfPages',
  'mergePdfFiles',
  'stampPdfText',
  'stampPdfImages',
] as const;

const files = new Map<string, { data: Buffer; filename: string; mimeType: string }>();

const findByID = vi.fn(async ({ id }: { id: string }) => {
  const file = files.get(id);

  if (!file) throw new Error(`Missing fixture ${id}`);

  return { id, url: `/files/${id}`, filename: file.filename, mimeType: file.mimeType };
});

const create = vi.fn(
  async ({ file }: { file: { data: Buffer; name: string; mimetype: string } }) => {
    const id = `output-${create.mock.calls.length}`;

    files.set(id, { data: file.data, filename: file.name, mimeType: file.mimetype });

    return { id, url: `/files/${id}` };
  },
);
const req = {
  headers: new Headers({ authorization: 'Bearer test' }),
  signal: undefined,
  url: 'https://app.test/api',
  frogbot: {
    config: {
      files: { slug: 'files' },
      _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
    },
    findByID,
    create,
    connections: { resolvePieceCredential: vi.fn() },
  },
} as never;

async function pdf(pageCount = 1, text?: string) {
  const document = await PDFDocument.create();
  const font = text ? await document.embedFont(StandardFonts.Helvetica) : undefined;

  for (let index = 0; index < pageCount; index++) {
    const page = document.addPage();

    if (text && font) page.drawText(`${text} ${index + 1}`, { x: 20, y: 700, font });
  }

  return Buffer.from(await document.save());
}

beforeEach(async () => {
  vi.clearAllMocks();
  files.clear();
  files.set('one', {
    data: await pdf(1, 'hello'),
    filename: 'one.pdf',
    mimeType: 'application/pdf',
  });
  files.set('two', {
    data: await pdf(2),
    filename: 'two.pdf',
    mimeType: 'application/pdf',
  });
  files.set('image', {
    data: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
    filename: 'pixel.png',
    mimeType: 'image/png',
  });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL) => {
      const id = new URL(String(input)).pathname.split('/').pop()!;
      const file = files.get(id);

      return new Response(file?.data, { status: file ? 200 : 404 });
    }),
  );
});

describe('pdf', () => {
  it('registers every upstream action under semantic names', () => {
    const piece = createPdf();

    expect(pieceInstanceTools(piece)?.map(({ slug }) => slug)).toEqual(
      actions.map((action) => `pdf_${action}`),
    );
    expect(Object.keys(piece.triggers)).toEqual([]);
  });

  it('creates PDFs from text and images', async () => {
    const piece = createPdf();
    const text = await piece.createPdfFromText({ input: { text: 'first\nsecond' }, req });
    const image = await piece.createPdfFromImage({ input: { image: 'image' }, req });

    expect(await PDFDocument.load(files.get(text.id as string)!.data)).toHaveProperty(
      'getPageCount',
    );
    expect((await PDFDocument.load(files.get(image.id as string)!.data)).getPageCount()).toBe(1);
    expect(image.filename).toBe('pixel.png.pdf');
  });

  it('counts, extracts text, merges, and rearranges pages', async () => {
    const piece = createPdf();

    await expect(piece.countPdfPages({ input: { file: 'two' }, req })).resolves.toBe(2);
    await expect(piece.extractPdfText({ input: { file: 'one' }, req })).resolves.toContain(
      'hello 1',
    );

    const merged = await piece.mergePdfFiles({
      input: { files: ['one', 'two'], outputFileName: 'joined' },
      req,
    });
    const extracted = await piece.extractPdfPages({
      input: { file: 'two', pageRanges: [{ startPage: -1, endPage: -1 }] },
      req,
    });

    expect((await PDFDocument.load(files.get(merged.id as string)!.data)).getPageCount()).toBe(3);
    expect((await PDFDocument.load(files.get(extracted.id as string)!.data)).getPageCount()).toBe(
      1,
    );
  });

  it('stamps text and images while preserving a valid PDF', async () => {
    const piece = createPdf();
    const text = await piece.stampPdfText({
      input: {
        file: 'two',
        items: [
          {
            text: 'stamp',
            applyToAllPages: true,
            distanceFromLeft: 20,
            distanceFromTop: 20,
          },
        ],
      },
      req,
    });
    const image = await piece.stampPdfImages({
      input: {
        file: text.id,
        items: [{ image: 'image', distanceFromLeft: 20, distanceFromTop: 20, scale: 1 }],
      },
      req,
    });

    expect((await PDFDocument.load(files.get(image.id as string)!.data)).getPageCount()).toBe(2);
  });
});
