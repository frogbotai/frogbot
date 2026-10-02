import { strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import readXlsxFile from '../../../../../packages/frogbot/node_modules/read-excel-file/universal/index.js';
import { xlsxText } from '../../../../../packages/frogbot/src/uploads/office/xlsxText.js';
import {
  budgetText,
  budgetXlsx,
  docxFile,
  farCellXlsx,
  oleFile,
  xlsxFile,
} from '../../../../__helpers/shared/office.js';

vi.mock(
  '../../../../../packages/frogbot/node_modules/read-excel-file/universal/index.js',
  async (importOriginal) => {
    const actual = await importOriginal<typeof import('read-excel-file/universal')>();

    return { ...actual, default: vi.fn(actual.default) };
  },
);

const filename = 'budget.xlsx';

const SHEET_NS = [
  'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ');

const RELATIONSHIP_TYPES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const styles = [
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>',
  '<cellXfs count="5">',
  '<xf numFmtId="0"/>',
  '<xf numFmtId="14" applyNumberFormat="1"/>',
  '<xf numFmtId="22" applyNumberFormat="1"/>',
  '<xf numFmtId="10" applyNumberFormat="1"/>',
  '<xf numFmtId="164" applyNumberFormat="1"/>',
  '</cellXfs>',
].join('');

const DATE = 1;
const DATE_TIME = 2;
const PERCENT = 3;
const CURRENCY = 4;

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const text = (ref: string, value: string) =>
  `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;

const number = (ref: string, value: number | string, style?: number) =>
  `<c r="${ref}"${style === undefined ? '' : ` s="${style}"`}><v>${value}</v></c>`;

const formula = (ref: string, expression: string, cached?: string) =>
  `<c r="${ref}"><f>${expression}</f>${cached === undefined ? '' : `<v>${cached}</v>`}</c>`;

const boolean = (ref: string, value: boolean) => `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;

const error = (ref: string, value: string) => `<c r="${ref}" t="e"><f>1/0</f><v>${value}</v></c>`;

const row = (index: number, cells: string[]) => `<row r="${index}">${cells.join('')}</row>`;

const sheet = (rows: string[], extra = '') => `<sheetData>${rows.join('')}</sheetData>${extra}`;

const singleSheet = (rows: string[]) =>
  xlsxFile({ sheets: [{ name: 'Sheet1', xml: sheet(rows) }], styles });

const numberedRows = (count: number) =>
  Array.from({ length: count }, (_, index) => row(index + 1, [number(`A${index + 1}`, index + 1)]));

const relinked = ({ sheets, links }: { sheets: string[]; links: string[] }) => {
  const files = unzipSync(singleSheet([row(1, [number('A1', 1)])]));

  const sheetElements = sheets.map(
    (id, index) => `<sheet name="S${index + 1}" sheetId="${index + 1}" r:id="${id}"/>`,
  );

  files['xl/workbook.xml'] = strToU8(
    `<workbook ${SHEET_NS}><sheets>${sheetElements.join('')}</sheets></workbook>`,
  );

  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${links.join('')}</Relationships>`,
  );

  return zipSync(files);
};

const link = ({ id, type, target }: { id: string; type: string; target: string }) =>
  `<Relationship Id="${id}" Type="${RELATIONSHIP_TYPES}/${type}" Target="${target}"/>`;

const worksheet = link({ id: 'rId1', type: 'worksheet', target: 'worksheets/sheet1.xml' });

afterEach(() => {
  vi.mocked(readXlsxFile).mockReset();
});

describe('xlsxText', () => {
  it('writes each sheet with data as labelled CSV in workbook order', async () => {
    expect(await xlsxText({ bytes: budgetXlsx(), filename })).toBe(budgetText);
  });

  it('reads a workbook held in part of a larger Buffer', async () => {
    const workbook = budgetXlsx();
    const shared = new Uint8Array(workbook.byteLength + 16);

    shared.set(workbook, 16);

    const bytes = Buffer.from(shared.buffer, 16, workbook.byteLength);

    expect(await xlsxText({ bytes, filename })).toBe(budgetText);
  });

  it('leaves a formula with no saved result empty', async () => {
    const workbook = singleSheet([
      row(1, [number('A1', 1), formula('B1', 'A1*2')]),
      row(2, [number('A2', 2), number('B2', 4)]),
    ]);

    expect(await xlsxText({ bytes: workbook, filename })).toBe('Sheet "Sheet1":\n1,\n2,4');
  });

  it('sends stored values without number formats and leaves error cells empty', async () => {
    const workbook = singleSheet([
      row(1, [number('A1', 0.25, PERCENT), error('B1', '#DIV/0!'), number('C1', 1200, CURRENCY)]),
      row(2, [number('A2', '0.1000000000000000055511151231257827')]),
    ]);

    expect(await xlsxText({ bytes: workbook, filename })).toBe(
      'Sheet "Sheet1":\n0.25,,1200\n0.1000000000000000055511151231257827,,',
    );
  });

  it('writes booleans as TRUE and FALSE', async () => {
    const workbook = singleSheet([row(1, [boolean('A1', true), boolean('B1', false)])]);

    expect(await xlsxText({ bytes: workbook, filename })).toBe('Sheet "Sheet1":\nTRUE,FALSE');
  });

  it('writes dates in UTC with the time when it is not midnight', async () => {
    const workbook = singleSheet([
      row(1, [number('A1', 46037, DATE), number('B1', '46037.3958333333', DATE_TIME)]),
    ]);

    expect(await xlsxText({ bytes: workbook, filename })).toBe(
      'Sheet "Sheet1":\n2026-01-15,2026-01-15 09:30:00',
    );
  });

  it.each(['1e300', '-1e300'])(
    'reads or refuses a date cell holding %s, never failing with another error',
    async (value) => {
      const workbook = singleSheet([row(1, [number('A1', value, DATE)])]);

      const outcome = await xlsxText({ bytes: workbook, filename }).then(
        () => 'text',
        (error: unknown) => (error as Error).name,
      );

      expect(['text', 'OfficeFileError']).toContain(outcome);
    },
  );

  it('writes a date outside the years 0 to 9999 as its serial number', async () => {
    const workbook = singleSheet([
      row(1, [
        number('A1', 2958465, DATE),
        number('B1', 2958466, DATE),
        number('C1', -700000, DATE),
      ]),
    ]);

    expect(await xlsxText({ bytes: workbook, filename })).toBe(
      'Sheet "Sheet1":\n9999-12-31,2958466,-700000',
    );
  });

  it('leaves a date cell empty when its number is too large to convert', async () => {
    const workbook = singleSheet([row(1, [number('A1', '1e300', DATE), number('B1', 1)])]);

    expect(await xlsxText({ bytes: workbook, filename })).toBe('Sheet "Sheet1":\n,1');
  });

  it('refuses a sheet too large to lay out before reading it', async () => {
    vi.mocked(readXlsxFile).mockResolvedValueOnce([]);

    const result = xlsxText({ bytes: farCellXlsx(), filename });

    await expect(result).rejects.toMatchObject({ name: 'OfficeFileError', reason: 'too-large' });
    expect(readXlsxFile).not.toHaveBeenCalled();
  });

  it('refuses a workbook that lists one sheet twice as invalid', async () => {
    const workbook = relinked({ sheets: ['rId1', 'rId1'], links: [worksheet] });

    const result = xlsxText({ bytes: workbook, filename });

    await expect(result).rejects.toMatchObject({ name: 'OfficeFileError', reason: 'invalid' });
  });

  it('skips chart sheets', async () => {
    const chart = link({ id: 'rId2', type: 'chartsheet', target: 'chartsheets/sheet1.xml' });

    const workbook = relinked({ sheets: ['rId2', 'rId1'], links: [worksheet, chart] });

    expect(await xlsxText({ bytes: workbook, filename })).toBe('Sheet "S2":\n1');
  });

  it('includes hidden sheets', async () => {
    const workbook = xlsxFile({
      sheets: [
        { name: 'Visible', xml: sheet([row(1, [text('A1', 'shown')])]) },
        { name: 'Lookup', xml: sheet([row(1, [text('A1', 'hidden')])]), hidden: true },
      ],
    });

    expect(await xlsxText({ bytes: workbook, filename })).toBe(
      'Sheet "Visible":\nshown\n\nSheet "Lookup":\nhidden',
    );
  });

  it('keeps a sheet of exactly 1,000 rows whole', async () => {
    const result = await xlsxText({ bytes: singleSheet(numberedRows(1_000)), filename });

    const lines = result.split('\n');

    expect(lines).toHaveLength(1_001);
    expect(lines.at(-1)).toBe('1000');
  });

  it('keeps the first 1,000 rows of a longer sheet and says how many there were', async () => {
    const workbook = xlsxFile({
      sheets: [
        { name: 'Export', xml: sheet(numberedRows(1_001)) },
        { name: 'Summary', xml: sheet([row(1, [text('A1', 'ok')])]) },
      ],
    });

    const result = await xlsxText({ bytes: workbook, filename });

    const sections = result.split('\n\n');
    const first = sections[0].split('\n');

    expect(first).toHaveLength(1_002);
    expect(first.at(-2)).toBe('1000');
    expect(first.at(-1)).toBe(
      '[budget.xlsx: showing the first 1,000 of 1,001 rows of sheet Export]',
    );
    expect(sections[1]).toBe('Sheet "Summary":\nok');
  });

  it('quotes fields with commas, quotes and line breaks', async () => {
    const workbook = singleSheet([
      row(1, [
        text('A1', 'a,b'),
        text('B1', 'Say "hi"'),
        text('C1', 'Line 1\nLine 2'),
        text('D1', 'plain'),
      ]),
    ]);

    expect(await xlsxText({ bytes: workbook, filename })).toBe(
      'Sheet "Sheet1":\n"a,b","Say ""hi""","Line 1\nLine 2",plain',
    );
  });

  it('writes a sheet name with quotes as it is', async () => {
    const workbook = xlsxFile({
      sheets: [{ name: 'The "best" sheet', xml: sheet([row(1, [text('A1', 'x')])]) }],
    });

    expect(await xlsxText({ bytes: workbook, filename })).toBe('Sheet "The "best" sheet":\nx');
  });

  it('gives a workbook with only empty sheets no text', async () => {
    const workbook = singleSheet([]);

    expect(await xlsxText({ bytes: workbook, filename })).toBe('');
  });

  it('refuses a legacy .xls workbook as invalid', async () => {
    const workbook = oleFile({ streams: ['Workbook'] });

    await expect(xlsxText({ bytes: workbook, filename: 'old.xls' })).rejects.toMatchObject({
      name: 'OfficeFileError',
      reason: 'invalid',
    });
  });

  it('refuses a Word document as invalid', async () => {
    const document = docxFile({ body: '<w:p><w:r><w:t>Hello</w:t></w:r></w:p>' });

    await expect(xlsxText({ bytes: document, filename })).rejects.toMatchObject({
      reason: 'invalid',
    });
  });
});
