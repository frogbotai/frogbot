import { type Zippable, zipSync } from 'fflate';
import { type Entry, fromBufferPromise, type ZipFile } from 'yauzl';

import { isOleFile, oleStreamNames } from './oleStreams.js';

export type OfficeFileErrorReason = 'invalid' | 'encrypted' | 'too-large';

type DataRange = {
  start: number;
  end: number;
};

const MESSAGES: Record<OfficeFileErrorReason, string> = {
  invalid: "The file isn't a valid Word or Excel file",
  encrypted: 'The file is password-protected',
  'too-large': 'The file is too large when expanded',
};

export class OfficeFileError extends Error {
  readonly reason: OfficeFileErrorReason;

  constructor(reason: OfficeFileErrorReason, options?: ErrorOptions) {
    super(MESSAGES[reason], options);

    this.name = 'OfficeFileError';
    this.reason = reason;
  }
}

const MAX_ENTRIES = 10_000;

const MAX_EXPANSION_BYTES = 50 * 1024 * 1024;

const ENCRYPTION_INFO = 'EncryptionInfo';

const UTF8_NAME_FLAG = 0x800;

const PROTOTYPE_KEY = '__proto__';

const UNSAFE_CHARACTERS = /[\\\0]/;

const utf8 = new TextDecoder();

function oleReason(bytes: Uint8Array): OfficeFileErrorReason {
  return oleStreamNames(bytes).includes(ENCRYPTION_INFO) ? 'encrypted' : 'invalid';
}

function expansion(entries: Entry[]): number {
  return entries.reduce(
    (total, entry) => total + Math.max(0, entry.uncompressedSize - entry.compressedSize),
    0,
  );
}

function declaredBytes(entries: Entry[]): number {
  return entries.reduce((total, entry) => total + entry.uncompressedSize, 0);
}

async function dataRanges({
  zip,
  entries,
}: {
  zip: ZipFile;
  entries: Entry[];
}): Promise<DataRange[]> {
  const ranges: DataRange[] = [];

  for (const entry of entries) {
    const { fileDataStart } = await zip.readLocalFileHeaderPromise(entry, { minimal: true });

    ranges.push({
      start: entry.relativeOffsetOfLocalHeader,
      end: fileDataStart + entry.compressedSize,
    });
  }

  return ranges.sort((left, right) => left.start - right.start);
}

function overlaps(ranges: DataRange[]): boolean {
  return ranges.some((range, index) => index > 0 && range.start < ranges[index - 1].end);
}

export function entryName(entry: Entry): string {
  const name = entry.fileNameRaw;

  return entry.generalPurposeBitFlag & UTF8_NAME_FLAG ? utf8.decode(name) : name.toString('latin1');
}

function isSafeName(name: string): boolean {
  if (name === '' || name === PROTOTYPE_KEY || UNSAFE_CHARACTERS.test(name)) return false;

  return !name.startsWith('/') && !name.split('/').includes('..');
}

function entryNames(entries: Entry[]): string[] {
  const names = entries.map(entryName);

  if (!names.every(isSafeName)) throw new OfficeFileError('invalid');

  if (new Set(names).size < names.length) throw new OfficeFileError('invalid');

  return names;
}

async function inflateEntry({ zip, entry }: { zip: ZipFile; entry: Entry }): Promise<Uint8Array> {
  const stream = await zip.openReadStreamPromise(entry);
  const data = new Uint8Array(entry.uncompressedSize);

  let bytes = 0;

  for await (const chunk of stream as AsyncIterable<Buffer>) {
    if (bytes + chunk.byteLength > entry.uncompressedSize) throw new OfficeFileError('too-large');

    data.set(chunk, bytes);

    bytes += chunk.byteLength;
  }

  return data.subarray(0, bytes);
}

async function checkEntries(zip: ZipFile): Promise<Zippable> {
  if (zip.entryCount > MAX_ENTRIES) throw new OfficeFileError('too-large');

  const entries: Entry[] = [];

  for await (const entry of zip.eachEntry()) entries.push(entry);

  const names = entryNames(entries);

  if (expansion(entries) > MAX_EXPANSION_BYTES) throw new OfficeFileError('too-large');

  if (declaredBytes(entries) > zip.fileSize + MAX_EXPANSION_BYTES) {
    throw new OfficeFileError('too-large');
  }

  if (overlaps(await dataRanges({ zip, entries }))) throw new OfficeFileError('too-large');

  const files: Zippable = {};

  for (const [index, entry] of entries.entries()) {
    const name = names[index];
    const isDirectory = name.endsWith('/');

    if (isDirectory && entry.uncompressedSize > 0) throw new OfficeFileError('invalid');

    const data = await inflateEntry({ zip, entry });

    if (!isDirectory) files[name] = data;
  }

  return files;
}

export async function checkOfficeZip(bytes: Uint8Array): Promise<Uint8Array> {
  if (isOleFile(bytes)) throw new OfficeFileError(oleReason(bytes));

  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const zip = await fromBufferPromise(buffer, {
    decodeStrings: false,
    validateEntrySizes: false,
  }).catch((error: unknown) => {
    throw new OfficeFileError('invalid', { cause: error });
  });

  try {
    return zipSync(await checkEntries(zip), { level: 0 });
  } catch (error) {
    if (error instanceof OfficeFileError) throw error;

    throw new OfficeFileError('invalid', { cause: error });
  } finally {
    zip.close();
  }
}
