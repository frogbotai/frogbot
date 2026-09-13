import { definePiece } from 'frogbot/pieces';

import { convertCsvToJson } from './actions/convertCsvToJson.js';
import { convertExcelToCsv } from './actions/convertExcelToCsv.js';
import { convertJsonToCsv } from './actions/convertJsonToCsv.js';

export const createCsv = definePiece({
  slug: 'csv',
  label: 'CSV',
  admin: { description: 'Convert CSV, JSON, and Excel data', group: 'Core' },
  actions: [convertCsvToJson, convertJsonToCsv, convertExcelToCsv],
});
