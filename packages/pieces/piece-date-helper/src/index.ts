import { definePiece } from 'frogbot/pieces';

import { addSubtractDate } from './actions/addSubtractDate.js';
import { dateDifference } from './actions/dateDifference.js';
import { extractDateParts } from './actions/extractDateParts.js';
import { firstDayOfPreviousMonth } from './actions/firstDayOfPreviousMonth.js';
import { formatDate } from './actions/formatDate.js';
import { getCurrentDate } from './actions/getCurrentDate.js';
import { lastDayOfPreviousMonth } from './actions/lastDayOfPreviousMonth.js';
import { nextDayOfWeek } from './actions/nextDayOfWeek.js';
import { nextDayOfYear } from './actions/nextDayOfYear.js';

export const dateHelperActions = [
  'getCurrentDate',
  'formatDate',
  'extractDateParts',
  'dateDifference',
  'addSubtractDate',
  'nextDayOfWeek',
  'nextDayOfYear',
  'firstDayOfPreviousMonth',
  'lastDayOfPreviousMonth',
] as const;
export const dateHelperScopes = [] as const;

export const createDateHelper = definePiece({
  slug: 'date-helper',
  label: 'Date Helper',
  admin: {
    description: 'Manipulate, format, and extract dates and times',
    group: 'Core',
  },
  actions: [
    getCurrentDate,
    formatDate,
    extractDateParts,
    dateDifference,
    addSubtractDate,
    nextDayOfWeek,
    nextDayOfYear,
    firstDayOfPreviousMonth,
    lastDayOfPreviousMonth,
  ],
});
