import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { checkSheetSize } from '../../../../../packages/frogbot/src/uploads/office/sheetGuard.js';
import {
  budgetXlsx,
  docxFile,
  farCellXlsx,
  oleFile,
  withoutUtf8Names,
  xlsxFile,
} from '../../../../__helpers/shared/office.js';

const SHEET_NS = [
  'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ');

const WORKSHEET = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';

const columnName = (index: number): string =>
  index === 0
    ? ''
    : `${columnName(Math.floor((index - 1) / 26))}${String.fromCharCode(65 + ((index - 1) % 26))}`;

const lastCell = (column: number) =>
  `<sheetData><row r="1"><c r="${columnName(column)}1"><v>1</v></c></row></sheetData>`;

const tallSheet = (rows: number) => `<sheetData><row r="${rows}"/></sheetData>`;

const workbook = (...xml: string[]) =>
  xlsxFile({ sheets: xml.map((sheet, index) => ({ name: `S${index + 1}`, xml: sheet })) });

describe('checkSheetSize', () => {
  it('accepts an ordinary workbook', async () => {
    await expect(checkSheetSize(budgetXlsx())).resolves.toBeUndefined();
  });

  it('refuses a workbook whose only cell is the last cell of the grid', async () => {
    await expect(checkSheetSize(farCellXlsx())).rejects.toMatchObject({
      name: 'OfficeFileError',
      reason: 'too-large',
    });
  });

  it('accepts a sheet that reaches the cell budget', async () => {
    await expect(checkSheetSize(workbook(lastCell(9_999_984)))).resolves.toBeUndefined();
  });

  it('refuses a sheet one column past the cell budget', async () => {
    await expect(checkSheetSize(workbook(lastCell(9_999_985)))).rejects.toMatchObject({
      reason: 'too-large',
    });
  });

  it('counts the cells of every sheet together', async () => {
    const sheets = workbook(tallSheet(624_999), tallSheet(624_999), tallSheet(1));

    await expect(checkSheetSize(sheets)).rejects.toMatchObject({ reason: 'too-large' });
  });

  it('counts rows that have no row number', async () => {
    const rows = '<row/>'.repeat(800_000);
    const sheet = `<sheetData><row r="1"><c r="J1"><v>1</v></c></row>${rows}</sheetData>`;

    await expect(checkSheetSize(workbook(sheet))).rejects.toMatchObject({ reason: 'too-large' });
  });

  it.each([
    [
      'prefixed names',
      '<x:sheetData><x:row x:r="1048576"><x:c x:r="XFD1048576"/></x:row></x:sheetData>',
    ],
    [
      'character references',
      '<sheetData><row r="&#49;048576"><c r="&#x58;FD1048576"/></row></sheetData>',
    ],
    ['single quotes', "<sheetData><row r='1048576'><c r='XFD1048576'/></row></sheetData>"],
    ['an endless row number', '<sheetData><row r="Infinity"/></sheetData>'],
    ['a row number in exponent form', '<sheetData><row r="1e9"/></sheetData>'],
  ])('refuses a far cell written with %s', async (_, sheet) => {
    await expect(checkSheetSize(workbook(sheet))).rejects.toMatchObject({ reason: 'too-large' });
  });

  it('finds a sheet named outside UTF-8 the way the Excel reader does', async () => {
    const files = unzipSync(farCellXlsx());
    const sheet = files['xl/worksheets/sheet1.xml'];

    delete files['xl/worksheets/sheet1.xml'];

    const zip = zipSync({
      ...files,
      'xl/worksheets/s\u00e9.xml': sheet,
      'xl/_rels/workbook.xml.rels': strToU8(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSheet1" Type="${WORKSHEET}" Target="worksheets/s\u00c3\u00a9.xml"/></Relationships>`,
      ),
    });

    await expect(checkSheetSize(withoutUtf8Names(zip))).rejects.toMatchObject({
      reason: 'too-large',
    });
  });

  it('finds a sheet linked by an absolute path', async () => {
    const files = unzipSync(farCellXlsx());

    const zip = zipSync({
      ...files,
      'xl/_rels/workbook.xml.rels': strToU8(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSheet1" Type="${WORKSHEET}" Target="/xl/worksheets/sheet1.xml"/></Relationships>`,
      ),
    });

    await expect(checkSheetSize(zip)).rejects.toMatchObject({ reason: 'too-large' });
  });

  it('ignores sheets the workbook does not link', async () => {
    const files = unzipSync(budgetXlsx());

    const zip = zipSync({
      ...files,
      'xl/worksheets/unlinked.xml': strToU8(
        `<worksheet ${SHEET_NS}><sheetData><row r="1048576"><c r="XFD1048576"/></row></sheetData></worksheet>`,
      ),
    });

    await expect(checkSheetSize(zip)).resolves.toBeUndefined();
  });

  it('accepts a Word document, which has no sheets', async () => {
    const document = docxFile({ body: '<w:p><w:r><w:t>Hello</w:t></w:r></w:p>' });

    await expect(checkSheetSize(document)).resolves.toBeUndefined();
  });

  it('refuses a file that is not a zip as invalid', async () => {
    await expect(checkSheetSize(oleFile({ streams: ['Workbook'] }))).rejects.toMatchObject({
      reason: 'invalid',
    });
  });
});
