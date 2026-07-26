import * as module from '@activepieces/piece-pdf';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const pdfActions = ['textToPdf', 'imageToPdf', 'mergePdfs', 'extractText', 'pdfPageCount', 'convertToImage', 'extractPdfPages', 'addTextToPdf', 'addImageToPdf'] as const;
export const pdfScopes = [] as const;

export function createPdf(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "pdf",
    credentialType: "none",
    defaultActions: pdfActions,
    scopes: pdfScopes,
    config,
  });
  return Object.assign(piece, {
    /** Extract Text: Extract text from PDF file or url */
    extractText: piece.tool("extractText"),
    /** Convert to Image: Convert a PDF file or URL to an image */
    convertToImage: piece.tool("convertToImage"),
    /** Text to PDF: Convert text to PDF */
    textToPdf: piece.tool("textToPdf"),
    /** Image to PDF: Convert image to PDF */
    imageToPdf: piece.tool("imageToPdf"),
    /** PDF Page Count: Get page count of PDF file. */
    pdfPageCount: piece.tool("pdfPageCount"),
    /** Extract PDF Pages: Extract or rearrange page(s)from PDF File. */
    extractPdfPages: piece.tool("extractPdfPages"),
    /** Merge PDFs: Merges multiple PDF files into a single PDF document. */
    mergePdfs: piece.tool("mergePdfs"),
    /** Add Text to PDF: Stamps one or more text strings at exact pixel distances from the top-left corner. */
    addTextToPdf: piece.tool("addTextToPdf"),
    /** Add Image to PDF: Stamps one or more images (PNG or JPG) at exact pixel distances from the top-left corner. */
    addImageToPdf: piece.tool("addImageToPdf"),
  });
}
