import type { AttachmentFile } from '../attachmentParts.js';
import { docxText } from './docxText.js';
import { limitText } from './limitText.js';
import { xlsxText } from './xlsxText.js';
import { checkOfficeZip, OfficeFileError } from './zipGuard.js';

export type OfficeKind = 'docx' | 'xlsx';

export type OfficeTextProps = {
  bytes: Uint8Array;
  filename: string;
  kind: OfficeKind;
};

const OFFICE_TYPES = new Map<string, OfficeKind>([
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
]);

const OTHER_OFFICE_EXTENSIONS = new Set([
  'doc',
  'docm',
  'dot',
  'dotm',
  'dotx',
  'odp',
  'ods',
  'odt',
  'ppt',
  'pptm',
  'pptx',
  'xls',
  'xlsb',
  'xlsm',
  'xlt',
  'xltm',
  'xltx',
]);

function fileExtension(filename = ''): string {
  const index = filename.lastIndexOf('.');

  return index === -1 ? '' : filename.slice(index + 1).toLowerCase();
}

export function officeKind({ mediaType, filename }: AttachmentFile): OfficeKind | undefined {
  const extension = fileExtension(filename);

  if (extension === 'docx' || extension === 'xlsx') return extension;

  if (OTHER_OFFICE_EXTENSIONS.has(extension)) return undefined;

  const type = mediaType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';

  return OFFICE_TYPES.get(type);
}

async function convert({ bytes, filename, kind }: OfficeTextProps): Promise<string> {
  const archive = await checkOfficeZip(bytes);

  const text =
    kind === 'docx' ? await docxText(archive) : await xlsxText({ bytes: archive, filename });

  return limitText({ text, filename });
}

export async function officeText(props: OfficeTextProps): Promise<string> {
  return convert(props).catch((error: unknown) => {
    if (error instanceof OfficeFileError) throw error;

    throw new OfficeFileError('invalid', { cause: error });
  });
}
