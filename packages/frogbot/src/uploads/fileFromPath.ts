import path from 'node:path';

import { getFileByPath } from 'payload';

const mimeTypesByExtension: Record<string, string> = {
  csv: 'text/csv',
  htm: 'text/html',
  html: 'text/html',
  ics: 'text/calendar',
  js: 'text/javascript',
  json: 'application/json',
  jsonl: 'application/jsonl',
  md: 'text/markdown',
  mjs: 'text/javascript',
  svg: 'image/svg+xml',
  tsv: 'text/tab-separated-values',
  txt: 'text/plain',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
};

type UploadOptions = { file?: unknown; filePath?: string };

/**
 * Reads a local API `filePath` into the `file` Payload takes, with a MIME type from the extension
 * when Payload cannot detect one from the content, as with plain text. Payload 4.0.0-beta.9's
 * upload planner (`planUploadStages`) throws on an undefined MIME type; drop this once it does not.
 */
export async function withFileFromPath<T extends UploadOptions>(options: T): Promise<T> {
  if (!options || typeof options.filePath !== 'string' || options.file !== undefined) {
    return options;
  }

  const file = await getFileByPath(options.filePath);

  if (!file) return options;

  const { filePath: _filePath, ...rest } = options;
  const extension = path.extname(options.filePath).slice(1).toLowerCase();
  const mimetype = file.mimetype || mimeTypesByExtension[extension] || 'application/octet-stream';

  return { ...rest, file: { ...file, mimetype } } as T;
}
