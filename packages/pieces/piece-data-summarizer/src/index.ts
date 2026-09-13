import { definePiece } from 'frogbot/pieces';

import { calculateAverage } from './actions/calculateAverage.js';
import { calculateSum } from './actions/calculateSum.js';
import { countUniqueValues } from './actions/countUniqueValues.js';
import { findMinMax } from './actions/findMinMax.js';

export const createDataSummarizer = definePiece({
  slug: 'data-summarizer',
  label: 'Data Summarizer',
  admin: { description: 'Summarize numeric and unique values', group: 'Core' },
  actions: [calculateAverage, calculateSum, countUniqueValues, findMinMax],
});
