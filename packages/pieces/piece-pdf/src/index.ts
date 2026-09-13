import { definePiece } from 'frogbot/pieces';

import {
  countPdfPages,
  createPdfFromImage,
  createPdfFromText,
  extractPdfPages,
  extractPdfText,
  mergePdfFiles,
  stampPdfImages,
  stampPdfText,
} from './actions.js';

export const createPdf = definePiece({
  slug: 'pdf',
  label: 'PDF',
  admin: {
    description: 'Create, inspect, combine, extract, and stamp PDF documents',
    group: 'Core',
  },
  actions: [
    extractPdfText,
    createPdfFromText,
    createPdfFromImage,
    countPdfPages,
    extractPdfPages,
    mergePdfFiles,
    stampPdfText,
    stampPdfImages,
  ],
});
