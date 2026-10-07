import { createGoogleSheets } from '@frogbotai/piece-google-sheets';
import { expectTypeOf } from 'vitest';

const sheets = createGoogleSheets({ auth: { accessToken: 'token' } });

const exported = sheets.exportWorksheet({
  input: { spreadsheetId: 'sheet', sheetId: 0, returnAsText: true },
});

expectTypeOf<Parameters<typeof sheets.exportWorksheet>[0]['input']>().toEqualTypeOf<{
  spreadsheetId: string;
  sheetId: number;
  format?: 'csv' | 'tsv' | undefined;
  returnAsText?: boolean | undefined;
}>();

expectTypeOf(exported).toEqualTypeOf<
  Promise<
    | { text: string; format: 'csv' | 'tsv' }
    | {
        file: { id: string | number; filename: string; url?: string | undefined };
        format: 'csv' | 'tsv';
      }
  >
>();

const _exportWorksheetRejectsCreateSpreadsheetInput = () =>
  // @ts-expect-error exportWorksheet does not accept createSpreadsheet input
  sheets.exportWorksheet({ input: { title: 'Budget' } });
