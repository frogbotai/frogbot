import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

vi.mock('../../../packages/frogbot/src/getFrogBot.js', () => ({
  createDefaultRequest: vi.fn(),
}));
vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/pieces/definePiece.js'));

import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { loadFile } from '../../../packages/pieces/piece-csv/src/files.js';
import { createCsv } from '../../../packages/pieces/piece-csv/src/index.js';

const csv = createCsv();

function excelRequest({
  fileUrl = '/files/workbook.xlsx',
  signal,
}: {
  fileUrl?: string;
  signal?: AbortSignal;
} = {}) {
  return {
    headers: new Headers({ authorization: 'Bearer test', cookie: 'session=test' }),
    signal,
    url: 'https://app.test/api',
    frogbot: {
      config: {
        files: { slug: 'files' },
        _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
      },
      findByID: vi.fn().mockResolvedValue({ id: 'workbook', url: fileUrl }),
    },
  } as never;
}

describe('csv', () => {
  it('declares every registered action with semantic names', () => {
    const definition = pieceFactoryDefinition(createCsv);

    expect(definition.actions.map(({ slug }) => slug)).toEqual([
      'convertCsvToJson',
      'convertJsonToCsv',
      'convertExcelToCsv',
    ]);
    expect(pieceInstanceTools(csv)?.map(({ slug }) => slug)).toEqual([
      'csv_convertCsvToJson',
      'csv_convertJsonToCsv',
      'csv_convertExcelToCsv',
    ]);
    expect(Object.keys(csv.triggers)).toEqual([]);
  });

  it('converts CSV rows with and without headers', async () => {
    const withHeaders = await csv.convertCsvToJson({
      input: { csvText: 'name\tage\nFrogBot\t2', hasHeaders: true, delimiter: '\t' },
      req: {} as never,
    });
    const withoutHeaders = await csv.convertCsvToJson({
      input: { csvText: 'FrogBot,2', hasHeaders: false, delimiter: ',' },
      req: {} as never,
    });

    expect(withHeaders).toEqual([{ name: 'FrogBot', age: '2' }]);
    expect(withoutHeaders).toEqual([['FrogBot', '2']]);
  });

  it('flattens nested JSON and writes the selected delimiter', async () => {
    const result = await csv.convertJsonToCsv({
      input: {
        jsonArray: [{ name: 'FrogBot', address: { city: 'Pond' } }],
        delimiter: '\t',
      },
      req: {} as never,
    });

    expect(result).toBe('name\taddress.city\nFrogBot\tPond\n');
  });

  it('loads a workbook and converts the selected sheet', async () => {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['name', 'age'],
        ['FrogBot', 2],
      ]),
      'Frogs',
    );
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ignored']]), 'Other');

    const data = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const req = excelRequest();
    const fetch = vi.fn().mockResolvedValue(new Response(data));

    vi.stubGlobal('fetch', fetch);

    const result = await csv.convertExcelToCsv({
      input: { fileId: 'workbook', sheetName: ' Frogs ', delimiter: ';' },
      req,
    });

    expect(result).toEqual({
      csv: 'name;age\nFrogBot;2',
      sheetName: 'Frogs',
      availableSheets: ['Frogs', 'Other'],
    });
    expect(req.frogbot.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'files', id: 'workbook', overrideAccess: false }),
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://app.test/files/workbook.xlsx'),
      expect.objectContaining({
        headers: new Headers({ authorization: 'Bearer test', cookie: 'session=test' }),
        redirect: 'error',
      }),
    );
  });

  it('strips caller credentials from cross-origin file requests', async () => {
    const controller = new AbortController();
    const req = excelRequest({
      fileUrl: 'https://files.example/workbook.xlsx',
      signal: controller.signal,
    });
    const fetch = vi.fn().mockResolvedValue(new Response('file'));

    vi.stubGlobal('fetch', fetch);

    await loadFile(req, 'workbook');

    expect(req.frogbot.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'workbook', req, overrideAccess: false }),
    );
    expect(fetch).toHaveBeenCalledWith(new URL('https://files.example/workbook.xlsx'), {
      headers: new Headers(),
      signal: controller.signal,
      redirect: 'error',
    });
  });

  it.each(['file:///tmp/workbook.xlsx', 'https://user:secret@files.example/workbook.xlsx'])(
    'rejects unsafe file URL %s',
    async (fileUrl) => {
      const req = excelRequest({ fileUrl });
      const fetch = vi.fn();

      vi.stubGlobal('fetch', fetch);

      await expect(loadFile(req, 'workbook')).rejects.toThrow('Invalid file URL.');

      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('rejects content that is not an Excel workbook', async () => {
    const req = excelRequest();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not excel')));

    await expect(
      csv.convertExcelToCsv({ input: { fileId: 'workbook', delimiter: ',' }, req }),
    ).rejects.toThrow('does not appear to be a valid Excel file');
  });
});
