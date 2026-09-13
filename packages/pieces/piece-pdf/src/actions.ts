import type { PieceRunArgs } from 'frogbot/pieces';
import { degrees, PageSizes, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';

import { fileId, loadFile, savedFile, saveFile } from './files.js';

const pdfOutput = savedFile;
const pdfFile = fileId.meta({ label: 'PDF file' });
const imageFile = fileId.meta({ label: 'PNG or JPEG image' });

type RunArgs<T extends z.ZodType> = PieceRunArgs<z.output<T>, object, undefined>;

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function pageIndexes(startPage: number, endPage: number, totalPages: number) {
  if (startPage > endPage) {
    throw new Error(`Range start (${startPage}) has to be less than range end (${endPage})`);
  }

  if (startPage === 0 || endPage === 0) {
    throw new Error('Range start/end has to be a non-zero number');
  }

  if (startPage > totalPages || endPage > totalPages) {
    throw new Error('Range start/end has to be less or equal to the total number of pages');
  }

  if (startPage < 0 && endPage > 0) {
    throw new Error('Range start cannot be negative when end is positive');
  }

  const start = startPage < 0 ? totalPages + startPage : startPage - 1;
  const end = endPage < 0 ? totalPages + endPage : endPage - 1;

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function targetPages<T>(pages: T[], all: boolean, pageNumber: number, item: string) {
  if (all) return pages;

  const page = pages[pageNumber - 1];

  if (!page) {
    throw new Error(
      `You requested Page ${pageNumber} for ${item}, but this document only has ${pages.length} page(s).`,
    );
  }

  return [page];
}

function coordinates(
  left: number,
  anchorY: number,
  visualWidth: number,
  visualHeight: number,
  rotation: number,
) {
  if (rotation === 90) return { x: visualHeight - anchorY, y: left, rotation: 90 };
  if (rotation === 180) return { x: visualWidth - left, y: visualHeight - anchorY, rotation: 180 };
  if (rotation === 270) return { x: anchorY, y: visualWidth - left, rotation: -90 };

  return { x: left, y: anchorY, rotation: 0 };
}

const createPdfFromTextInput = z.object({ text: z.string().meta({ label: 'Text' }) });

export const createPdfFromText = {
  slug: 'createPdfFromText',
  label: 'Create PDF from text',
  description: 'Create an A4 PDF document from text.',
  input: createPdfFromTextInput,
  output: pdfOutput,
  async run({ input, req }: RunArgs<typeof createPdfFromTextInput>) {
    try {
      const document = await PDFDocument.create();
      const font = await document.embedFont(StandardFonts.Helvetica);
      const pageSize: [number, number] = [595, 842];
      const margin = 50;
      const fontSize = 12;
      const lineHeight = font.heightAtSize(fontSize) + 5;
      let page = document.addPage(pageSize);
      let y = 772;

      for (const paragraph of input.text.split('\n')) {
        let line = '';

        for (const word of paragraph.split(' ')) {
          const candidate = `${line}${word} `;

          if (font.widthOfTextAtSize(candidate, fontSize) > pageSize[0] - margin * 2 && line) {
            page.drawText(line.trim(), { x: margin, y, size: fontSize, font });
            y -= lineHeight;
            line = `${word} `;

            if (y < margin + lineHeight) {
              page = document.addPage(pageSize);
              y = 772;
            }
          } else {
            line = candidate;
          }
        }

        if (line.trim()) {
          page.drawText(line.trim(), { x: margin, y, size: fontSize, font });
          y -= lineHeight;
        }

        y -= 8;

        if (y < margin + lineHeight) {
          page = document.addPage(pageSize);
          y = 772;
        }
      }

      return saveFile({
        req,
        data: await document.save(),
        name: 'text.pdf',
        mimeType: 'application/pdf',
      });
    } catch (error) {
      throw new Error(`Failed to convert text to PDF: ${message(error)}`);
    }
  },
};

const createPdfFromImageInput = z.object({ image: imageFile });

export const createPdfFromImage = {
  slug: 'createPdfFromImage',
  label: 'Create PDF from image',
  description: 'Create an A4 PDF from a PNG or JPEG image.',
  input: createPdfFromImageInput,
  output: pdfOutput,
  async run({ input, req }: RunArgs<typeof createPdfFromImageInput>) {
    try {
      const image = await loadFile(req, input.image);
      const document = await PDFDocument.create();
      const embedded =
        image.mimeType === 'image/png'
          ? await document.embedPng(image.data)
          : image.mimeType === 'image/jpeg'
            ? await document.embedJpg(image.data)
            : undefined;

      if (!embedded) throw new Error(`Unsupported image format: ${image.mimeType}`);

      const page = document.addPage(PageSizes.A4);
      const scaled = embedded.scaleToFit(page.getWidth() - 60, page.getHeight() - 60);

      page.drawImage(embedded, {
        x: 30,
        y: page.getHeight() - 30 - scaled.height,
        width: scaled.width,
        height: scaled.height,
      });

      return saveFile({
        req,
        data: await document.save(),
        name: `${image.name}.pdf`,
        mimeType: 'application/pdf',
      });
    } catch (error) {
      throw new Error(`Failed to convert image to PDF: ${message(error)}`);
    }
  },
};

const mergePdfFilesInput = z.object({
  files: z.array(pdfFile).min(2).meta({ label: 'PDF files' }),
  outputFileName: z.string().default('merged-document').meta({ label: 'Output file name' }),
});

export const mergePdfFiles = {
  slug: 'mergePdfFiles',
  label: 'Merge PDF files',
  description: 'Merge two or more PDF documents in order.',
  input: mergePdfFilesInput,
  output: pdfOutput,
  async run({ input, req }: RunArgs<typeof mergePdfFilesInput>) {
    try {
      const merged = await PDFDocument.create();

      for (const reference of input.files) {
        const file = await loadFile(req, reference);
        const source = await PDFDocument.load(file.data);
        const pages = await merged.copyPages(source, source.getPageIndices());

        for (const page of pages) merged.addPage(page);
      }

      return saveFile({
        req,
        data: await merged.save(),
        name: `${input.outputFileName}.pdf`,
        mimeType: 'application/pdf',
      });
    } catch (error) {
      throw new Error(`Failed to merge PDFs: ${message(error)}`);
    }
  },
};

const extractPdfTextInput = z.object({ file: pdfFile });

export const extractPdfText = {
  slug: 'extractPdfText',
  label: 'Extract PDF text',
  description: 'Extract text from all pages of a PDF.',
  input: extractPdfTextInput,
  output: z.string(),
  async run({ input, req }: RunArgs<typeof extractPdfTextInput>) {
    const file = await loadFile(req, input.file);
    const document = await getDocumentProxy(new Uint8Array(file.data));
    const result = await extractText(document, { mergePages: true });

    return result.text;
  },
};

const countPdfPagesInput = z.object({ file: pdfFile });

export const countPdfPages = {
  slug: 'countPdfPages',
  label: 'Count PDF pages',
  description: 'Count the pages in a PDF document.',
  input: countPdfPagesInput,
  output: z.number().int().nonnegative(),
  async run({ input, req }: RunArgs<typeof countPdfPagesInput>) {
    try {
      const file = await loadFile(req, input.file);
      const document = await PDFDocument.load(file.data);

      return document.getPageCount();
    } catch (error) {
      throw new Error(`Failed to get page count: ${message(error)}`);
    }
  },
};

const extractPdfPagesInput = z.object({
  file: pdfFile,
  pageRanges: z.array(z.object({ startPage: z.number().int(), endPage: z.number().int() })).min(1),
});

export const extractPdfPages = {
  slug: 'extractPdfPages',
  label: 'Extract PDF pages',
  description: 'Extract or rearrange inclusive page ranges.',
  input: extractPdfPagesInput,
  output: pdfOutput,
  async run({ input, req }: RunArgs<typeof extractPdfPagesInput>) {
    try {
      const file = await loadFile(req, input.file);
      const source = await PDFDocument.load(file.data);
      const indexes = input.pageRanges.flatMap(({ startPage, endPage }) =>
        pageIndexes(startPage, endPage, source.getPageCount()),
      );
      const extracted = await PDFDocument.create();
      const pages = await extracted.copyPages(source, indexes);

      for (const page of pages) extracted.addPage(page);

      return saveFile({
        req,
        data: await extracted.save(),
        name: file.name,
        mimeType: 'application/pdf',
      });
    } catch (error) {
      throw new Error(`Failed to extract pages: ${message(error)}`);
    }
  },
};

const textItem = z.object({
  text: z.string(),
  applyToAllPages: z.boolean().default(false),
  pageNumber: z.number().int().positive().default(1),
  distanceFromLeft: z.number(),
  distanceFromTop: z.number(),
  font: z.nativeEnum(StandardFonts).default(StandardFonts.Helvetica),
  fontSize: z.number().positive().default(11),
  lineSpacing: z.number().positive().default(1.15),
});

const stampPdfTextInput = z.object({ file: pdfFile, items: z.array(textItem).min(1) });

export const stampPdfText = {
  slug: 'stampPdfText',
  label: 'Stamp text on PDF',
  description: 'Place text at exact distances from the visual top-left corner.',
  input: stampPdfTextInput,
  output: pdfOutput,
  async run({ input, req }: RunArgs<typeof stampPdfTextInput>) {
    try {
      const file = await loadFile(req, input.file);
      const document = await PDFDocument.load(file.data);
      const pages = document.getPages();
      const fonts = new Map<string, Awaited<ReturnType<typeof document.embedFont>>>();

      for (const item of input.items) {
        let font = fonts.get(item.font);

        if (!font) {
          font = await document.embedFont(item.font);
          fonts.set(item.font, font);
        }

        for (const page of targetPages(pages, item.applyToAllPages, item.pageNumber, 'text')) {
          const rotation = ((page.getRotation().angle % 360) + 360) % 360;
          const landscape = rotation === 90 || rotation === 270;
          const visualWidth = landscape ? page.getHeight() : page.getWidth();
          const visualHeight = landscape ? page.getWidth() : page.getHeight();
          const anchorY = visualHeight - item.distanceFromTop;
          const position = coordinates(
            item.distanceFromLeft,
            anchorY,
            visualWidth,
            visualHeight,
            rotation,
          );

          page.drawText(item.text.replace(/\r\n|\r/g, '\n'), {
            x: position.x,
            y: position.y,
            size: item.fontSize,
            lineHeight: item.fontSize * item.lineSpacing,
            font,
            color: rgb(0, 0, 0),
            rotate: degrees(position.rotation),
          });
        }
      }

      return saveFile({
        req,
        data: await document.save(),
        name: `text_stamped_${file.name}`,
        mimeType: 'application/pdf',
      });
    } catch (error) {
      throw new Error(`Failed to add text to PDF: ${message(error)}`);
    }
  },
};

const imageItem = z.object({
  image: imageFile,
  applyToAllPages: z.boolean().default(false),
  pageNumber: z.number().int().positive().default(1),
  distanceFromLeft: z.number(),
  distanceFromTop: z.number(),
  scale: z.number().positive().default(1),
});

const stampPdfImagesInput = z.object({ file: pdfFile, items: z.array(imageItem).min(1) });

export const stampPdfImages = {
  slug: 'stampPdfImages',
  label: 'Stamp images on PDF',
  description: 'Place PNG or JPEG images at exact distances from the visual top-left corner.',
  input: stampPdfImagesInput,
  output: pdfOutput,
  async run({ input, req }: RunArgs<typeof stampPdfImagesInput>) {
    try {
      const file = await loadFile(req, input.file);
      const document = await PDFDocument.load(file.data);
      const pages = document.getPages();

      for (const [index, item] of input.items.entries()) {
        const image = await loadFile(req, item.image);
        const embedded =
          image.mimeType === 'image/png'
            ? await document.embedPng(image.data)
            : image.mimeType === 'image/jpeg'
              ? await document.embedJpg(image.data)
              : undefined;

        if (!embedded) throw new Error(`Unsupported image format for '${image.name}'.`);

        const dimensions = embedded.scale(item.scale);

        for (const page of targetPages(
          pages,
          item.applyToAllPages,
          item.pageNumber,
          `image item ${index + 1}`,
        )) {
          const rotation = ((page.getRotation().angle % 360) + 360) % 360;
          const landscape = rotation === 90 || rotation === 270;
          const visualWidth = landscape ? page.getHeight() : page.getWidth();
          const visualHeight = landscape ? page.getWidth() : page.getHeight();
          const anchorY = visualHeight - item.distanceFromTop - dimensions.height;
          const position = coordinates(
            item.distanceFromLeft,
            anchorY,
            visualWidth,
            visualHeight,
            rotation,
          );

          page.drawImage(embedded, {
            x: position.x,
            y: position.y,
            width: dimensions.width,
            height: dimensions.height,
            rotate: degrees(position.rotation),
          });
        }
      }

      return saveFile({
        req,
        data: await document.save(),
        name: `image_stamped_${file.name}`,
        mimeType: 'application/pdf',
      });
    } catch (error) {
      throw new Error(`Failed to add image to PDF: ${message(error)}`);
    }
  },
};
