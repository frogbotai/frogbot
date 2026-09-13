# `@frogbotai/piece-pdf`

Create, inspect, combine, extract, and stamp PDF documents with FrogBot files.

## Usage

```ts
import { createPdf } from '@frogbotai/piece-pdf';

export const pdf = createPdf();
```

## Actions

| Upstream action slug | Previous wrapper export | Native action            | Notes                                                                                  |
| -------------------- | ----------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| `extractText`        | `extractText`           | `extractPdfText`         |                                                                                        |
| `convertToImage`     | `convertToImage`        | Deliberately unsupported | Requires the `pdftoppm` system binary, so it is not part of the native action surface. |
| `textToPdf`          | `textToPdf`             | `createPdfFromText`      |                                                                                        |
| `imageToPdf`         | `imageToPdf`            | `createPdfFromImage`     |                                                                                        |
| `pdfPageCount`       | `pdfPageCount`          | `countPdfPages`          |                                                                                        |
| `extractPdfPages`    | `extractPdfPages`       | `extractPdfPages`        |                                                                                        |
| `mergePdfs`          | `mergePdfs`             | `mergePdfFiles`          |                                                                                        |
| `addTextToPdf`       | `addTextToPdf`          | `stampPdfText`           |                                                                                        |
| `addImageToPdf`      | `addImageToPdf`         | `stampPdfImages`         |                                                                                        |

The upstream piece registers no triggers.
