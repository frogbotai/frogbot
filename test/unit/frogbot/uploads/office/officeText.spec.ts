import { strToU8, unzipSync, zipSync } from 'fflate';
import mammoth from 'mammoth';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  officeKind,
  officeText,
} from '../../../../../packages/frogbot/src/uploads/office/officeText.js';
import { checkSheetSize } from '../../../../../packages/frogbot/src/uploads/office/sheetGuard.js';
import { xlsxText } from '../../../../../packages/frogbot/src/uploads/office/xlsxText.js';
import {
  docxFile,
  encryptedOfficeFile,
  oleFile,
  sharedDataEntries,
  withCommentDirectory,
  withHiddenEntry,
  xlsxFile,
  zipBomb,
} from '../../../../__helpers/shared/office.js';

vi.mock(
  '../../../../../packages/frogbot/src/uploads/office/xlsxText.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../../packages/frogbot/src/uploads/office/xlsxText.js')
      >();

    return { ...actual, xlsxText: vi.fn(actual.xlsxText) };
  },
);

vi.mock(
  '../../../../../packages/frogbot/src/uploads/office/sheetGuard.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../../packages/frogbot/src/uploads/office/sheetGuard.js')
      >();

    return { ...actual, checkSheetSize: vi.fn(actual.checkSheetSize) };
  },
);

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const SHEET_NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

const text = (ref: string, value: string) =>
  `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;

const sheet = (values: string[]) =>
  `<sheetData>${values.map((value, index) => `<row r="${index + 1}">${text(`A${index + 1}`, value)}</row>`).join('')}</sheetData>`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('officeKind', () => {
  it.each([
    [{ filename: 'report.docx' }, 'docx'],
    [{ filename: 'REPORT.DOCX' }, 'docx'],
    [{ filename: 'budget.xlsx' }, 'xlsx'],
    [{ filename: 'budget.xlsx', mediaType: 'application/octet-stream' }, 'xlsx'],
    [{ filename: 'report', mediaType: DOCX_TYPE }, 'docx'],
    [{ mediaType: `${XLSX_TYPE}; charset=binary` }, 'xlsx'],
    [
      { filename: 'macros.docm', mediaType: 'application/vnd.ms-word.document.macroEnabled.12' },
      undefined,
    ],
    [
      { filename: 'macros.xlsm', mediaType: 'application/vnd.ms-excel.sheet.macroEnabled.12' },
      undefined,
    ],
    [{ filename: 'old.doc', mediaType: 'application/msword' }, undefined],
    [{ filename: 'old.xls', mediaType: 'application/vnd.ms-excel' }, undefined],
    [
      {
        filename: 'slides.pptx',
        mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
      undefined,
    ],
    [{ filename: 'notes.odt', mediaType: 'application/vnd.oasis.opendocument.text' }, undefined],
    [
      { filename: 'sheet.ods', mediaType: 'application/vnd.oasis.opendocument.spreadsheet' },
      undefined,
    ],
    [{ filename: 'notes.txt', mediaType: 'text/plain' }, undefined],
    [{ filename: 'docx' }, undefined],
    [{}, undefined],
  ])('classifies %o as %s', (file, kind) => {
    expect(officeKind(file)).toBe(kind);
  });
});

describe('officeText', () => {
  it('reads a Word document', async () => {
    const document = docxFile({ body: paragraph('Hello') });

    const result = await officeText({ bytes: document, filename: 'report.docx', kind: 'docx' });

    expect(result).toBe('Hello');
  });

  it('reads an Excel workbook', async () => {
    const workbook = xlsxFile({ sheets: [{ name: 'Q1', xml: sheet(['Region', 'North']) }] });

    const result = await officeText({ bytes: workbook, filename: 'budget.xlsx', kind: 'xlsx' });

    expect(result).toBe('Sheet "Q1":\nRegion\nNorth');
  });

  it('gives the Word reader a new archive holding only the checked entries', async () => {
    const convertToHtml = vi.spyOn(mammoth, 'convertToHtml');
    const hidden = docxFile({ body: paragraph('Hidden') });
    const document = withCommentDirectory({ zip: docxFile({ body: paragraph('Listed') }), hidden });

    const result = await officeText({ bytes: document, filename: 'report.docx', kind: 'docx' });

    const [input] = convertToHtml.mock.lastCall as [{ buffer: Buffer }];

    expect(result).toBe('Hidden');
    expect(Buffer.compare(input.buffer, document)).not.toBe(0);
    expect(unzipSync(input.buffer)).toEqual(unzipSync(hidden));
  });

  it('gives the Excel reader and its sheet check a new archive holding only the checked entries', async () => {
    const hidden = xlsxFile({ sheets: [{ name: 'Q1', xml: sheet(['Hidden']) }] });

    const workbook = withCommentDirectory({
      zip: xlsxFile({ sheets: [{ name: 'Q1', xml: sheet(['Listed']) }] }),
      hidden,
    });

    const result = await officeText({ bytes: workbook, filename: 'budget.xlsx', kind: 'xlsx' });

    const [{ bytes }] = vi.mocked(xlsxText).mock.lastCall!;
    const [checked] = vi.mocked(checkSheetSize).mock.lastCall!;

    expect(result).toBe('Sheet "Q1":\nHidden');
    expect(Buffer.compare(bytes, workbook)).not.toBe(0);
    expect(checked).toBe(bytes);
    expect(unzipSync(bytes)).toEqual(unzipSync(hidden));
  });

  it('refuses a zip bomb before Word parsing starts', async () => {
    const convertToHtml = vi.spyOn(mammoth, 'convertToHtml');

    const result = officeText({ bytes: zipBomb(), filename: 'report.docx', kind: 'docx' });

    await expect(result).rejects.toMatchObject({ name: 'OfficeFileError', reason: 'too-large' });
    expect(convertToHtml).not.toHaveBeenCalled();
  });

  it('refuses a zip bomb before Excel parsing starts', async () => {
    const bomb = zipBomb({ path: 'xl/worksheets/sheet1.xml', declaredBytes: 1_000 });

    const result = officeText({ bytes: bomb, filename: 'budget.xlsx', kind: 'xlsx' });

    await expect(result).rejects.toMatchObject({ reason: 'too-large' });
  });

  it('refuses a workbook whose entries share stored data before Excel parsing starts', async () => {
    const workbook = unzipSync(xlsxFile({ sheets: [{ name: 'Q1', xml: sheet(['Region']) }] }));

    const zip = zipSync({
      ...workbook,
      'xl/padding.xml': [new Uint8Array(1_000_000).fill(0x20), { level: 0 }],
    });

    const shared = sharedDataEntries({ zip, name: 'xl/padding.xml', copies: 200 });

    const result = officeText({ bytes: shared, filename: 'budget.xlsx', kind: 'xlsx' });

    await expect(result).rejects.toMatchObject({ name: 'OfficeFileError', reason: 'too-large' });
  });

  it('reports an unexpected converter failure as an invalid file', async () => {
    vi.spyOn(mammoth, 'convertToHtml').mockResolvedValue({
      value: undefined,
      messages: [],
    } as never);

    const document = docxFile({ body: paragraph('Hello') });

    const result = officeText({ bytes: document, filename: 'report.docx', kind: 'docx' });

    await expect(result).rejects.toMatchObject({
      name: 'OfficeFileError',
      reason: 'invalid',
      cause: expect.any(TypeError),
    });
  });

  it('reports an encrypted workbook as password-protected', async () => {
    const result = officeText({
      bytes: encryptedOfficeFile(),
      filename: 'budget.xlsx',
      kind: 'xlsx',
    });

    await expect(result).rejects.toMatchObject({ reason: 'encrypted' });
  });

  it('refuses an Excel 97-2003 workbook renamed .xlsx as invalid', async () => {
    const workbook = oleFile({ streams: ['Workbook'] });

    const result = officeText({ bytes: workbook, filename: 'budget.xlsx', kind: 'xlsx' });

    await expect(result).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('refuses a Word document sent as a workbook', async () => {
    const document = docxFile({ body: paragraph('Hello') });

    const result = officeText({ bytes: document, filename: 'budget.xlsx', kind: 'xlsx' });

    await expect(result).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('reads workbook entries listed in the zip directory, not hidden ones', async () => {
    const workbook = xlsxFile({ sheets: [{ name: 'Q1', xml: sheet(['listed']) }] });

    const tampered = withHiddenEntry({
      zip: workbook,
      name: 'xl/worksheets/sheet1.xml',
      data: strToU8(`<worksheet ${SHEET_NS}>${sheet(['hidden'])}</worksheet>`),
    });

    const result = await officeText({ bytes: tampered, filename: 'budget.xlsx', kind: 'xlsx' });

    expect(result).toBe('Sheet "Q1":\nlisted');
  });

  it('cuts the text of all sheets together at 60,000 characters', async () => {
    const line = 'x'.repeat(99);

    const workbook = xlsxFile({
      sheets: [
        { name: 'A', xml: sheet(Array(600).fill(line)) },
        { name: 'B', xml: sheet(['b']) },
      ],
    });

    const result = await officeText({ bytes: workbook, filename: 'budget.xlsx', kind: 'xlsx' });

    expect(result).toBe(
      `Sheet "A":\n${`${line}\n`.repeat(598)}${line}\n[budget.xlsx: showing the first 59,910 of 60,024 characters]`,
    );
  });
});
