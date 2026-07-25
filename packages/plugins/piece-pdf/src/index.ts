import * as module from '@activepieces/piece-pdf';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const pdfActions = ['textToPdf', 'imageToPdf', 'mergePdfs', 'extractText', 'pdfPageCount', 'convertToImage', 'extractPdfPages', 'addTextToPdf', 'addImageToPdf'] as const;
export const pdf = createActivepiecesPiece({ module, service: 'pdf', credentialType: 'none', defaultActions: pdfActions });
