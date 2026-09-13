import { BlobReader, BlobWriter, getMimeType, ZipReader, ZipWriter } from '@zip.js/zip.js';
import type { PieceRunArgs } from 'frogbot/pieces';
import { lookup } from 'mime-types';
import { z } from 'zod';

import { encoding } from './config.js';
import { fileId, loadFile, savedFile, saveFile } from './files.js';

type RunArgs<T extends z.ZodType> = PieceRunArgs<z.output<T>, object, undefined>;

const passwordOptions = z
  .object({
    password: z.string().min(1).meta({ label: 'Password' }),
    encryptionMethod: z.enum(['zipcrypto', 'aes-256']).default('zipcrypto').optional(),
  })
  .optional();

const createFileInput = z.object({
  content: z.string().meta({ label: 'Content' }),
  fileName: z.string().min(1).meta({ label: 'File name' }),
  encoding: encoding.default('utf8').meta({ label: 'Encoding' }),
});

const readFileInput = z.object({
  file: fileId.meta({ label: 'File' }),
  format: z.enum(['text', 'base64']).meta({ label: 'Output format' }),
});

const getFileNameInput = z.object({ file: fileId.meta({ label: 'File' }) });

const checkFileTypeInput = z.object({
  file: fileId.meta({ label: 'File to check' }),
  mimeType: z.string().min(1).meta({ label: 'MIME type' }),
});

const changeFileEncodingInput = z.object({
  inputFile: fileId.meta({ label: 'Source file' }),
  inputEncoding: encoding.meta({ label: 'Source encoding' }),
  outputFileName: z.string().min(1).meta({ label: 'Output file name' }),
  outputEncoding: encoding.meta({ label: 'Output encoding' }),
});

const zipFilesInput = z.object({
  files: z.array(z.object({ file: fileId, filePath: z.string().min(1).optional() })).min(1),
  outputFileName: z.string().min(1).meta({ label: 'Name of zipped file' }),
  usePassword: z.boolean().default(false).optional(),
  passwordOptions,
});

const unzipFileInput = z.object({
  file: fileId.meta({ label: 'ZIP file' }),
  maxResults: z.number().int().nonnegative().default(0).optional(),
  usePassword: z.boolean().default(false).optional(),
  passwordOptions: passwordOptions.transform((value) =>
    value ? { password: value.password } : undefined,
  ),
});

export const createFile = {
  slug: 'createFile',
  label: 'Create file',
  description: 'Create a file from content',
  input: createFileInput,
  output: savedFile,
  async run({ input, req }: RunArgs<typeof createFileInput>) {
    const data = Buffer.from(input.content, input.encoding);

    return saveFile({ req, data, filename: input.fileName });
  },
};

export const readFile = {
  slug: 'readFile',
  label: 'Read file',
  description: 'Read a file as text or Base64',
  input: readFileInput,
  output: z.union([
    z.object({ text: z.string() }),
    z.object({ base64: z.string(), base64WithMimeType: z.string() }),
  ]),
  async run({ input, req }: RunArgs<typeof readFileInput>) {
    const file = await loadFile({ req, id: input.file });

    if (input.format === 'text') return { text: file.data.toString('utf8') };

    const base64 = file.data.toString('base64');

    return { base64, base64WithMimeType: `data:${file.mimeType};base64,${base64}` };
  },
};

export const getFileName = {
  slug: 'getFileName',
  label: 'Get file name',
  description: 'Get the name of a file',
  input: getFileNameInput,
  output: z.object({ fileName: z.string() }),
  async run({ input, req }: RunArgs<typeof getFileNameInput>) {
    const file = await loadFile({ req, id: input.file });

    return { fileName: file.filename };
  },
};

export const checkFileType = {
  slug: 'checkFileType',
  label: 'Check file type',
  description: 'Check whether a file matches a MIME type',
  input: checkFileTypeInput,
  output: z.object({ mimeType: z.string(), isMatch: z.boolean() }),
  async run({ input, req }: RunArgs<typeof checkFileTypeInput>) {
    const file = await loadFile({ req, id: input.file });
    const mimeType = lookup(file.filename) || 'application/octet-stream';

    return { mimeType, isMatch: mimeType === input.mimeType };
  },
};

export const changeFileEncoding = {
  slug: 'changeFileEncoding',
  label: 'Change file encoding',
  description: 'Change the encoding of a file',
  input: changeFileEncodingInput,
  output: savedFile,
  async run({ input, req }: RunArgs<typeof changeFileEncodingInput>) {
    const file = await loadFile({ req, id: input.inputFile });
    const decoded = file.data.toString(input.inputEncoding);
    const data = Buffer.from(decoded, input.outputEncoding);

    return saveFile({ req, data, filename: input.outputFileName });
  },
};

export const zipFiles = {
  slug: 'zipFiles',
  label: 'Zip files',
  description: 'Create a compressed ZIP file from one or more files',
  input: zipFilesInput,
  output: savedFile,
  async run({ input, req }: RunArgs<typeof zipFilesInput>) {
    const writer = new BlobWriter('application/zip');
    const zip = new ZipWriter(writer);
    const options: { password?: string; zipCrypto?: boolean; encryptionStrength?: 3 } = {};

    if (input.usePassword) {
      if (!input.passwordOptions?.password) throw new Error('A password is required.');

      options.password = input.passwordOptions.password;

      if (input.passwordOptions.encryptionMethod === 'aes-256') options.encryptionStrength = 3;
      else options.zipCrypto = true;
    }

    try {
      for (const item of input.files) {
        const file = await loadFile({ req, id: item.file });
        const path = item.filePath ?? file.filename;

        await zip.add(path, new BlobReader(new Blob([file.data])), options);
      }

      await zip.close();
    } catch (error) {
      await zip.close().catch(() => undefined);

      throw error;
    }

    const data = Buffer.from(await (await writer.getData()).arrayBuffer());

    return saveFile({ req, data, filename: input.outputFileName, mimeType: 'application/zip' });
  },
};

export const unzipFile = {
  slug: 'unzipFile',
  label: 'Unzip file',
  description: 'Extract files from a compressed ZIP file',
  input: unzipFileInput,
  output: z.array(z.object({ file: savedFile, filePath: z.string() })),
  async run({ input, req }: RunArgs<typeof unzipFileInput>) {
    const file = await loadFile({ req, id: input.file });
    const reader = new ZipReader(new BlobReader(new Blob([file.data])));

    try {
      const entries = await reader.getEntries();
      const maxResults = input.maxResults ?? 0;

      if (maxResults !== 0 && entries.length > maxResults) {
        throw new Error(`Zip file contains more entries than allowed: ${entries.length}`);
      }

      if (input.usePassword && !input.passwordOptions?.password) {
        throw new Error('A password is required.');
      }

      const results: { file: z.output<typeof savedFile>; filePath: string }[] = [];

      for (const entry of entries) {
        if (entry.directory) continue;

        const blob = await entry.getData(new BlobWriter(getMimeType(entry.filename)), {
          password: input.usePassword ? input.passwordOptions?.password : undefined,
        });
        const data = Buffer.from(await blob.arrayBuffer());
        const filename = entry.filename.split('/').pop() || entry.filename;
        const saved = await saveFile({
          req,
          data,
          filename,
          mimeType: getMimeType(entry.filename),
        });

        results.push({ file: saved, filePath: entry.filename });
      }

      return results;
    } finally {
      await reader.close();
    }
  },
};
