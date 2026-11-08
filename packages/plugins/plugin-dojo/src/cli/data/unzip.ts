import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw } from 'node:zlib';

export type ZipFile = {
  name: string;
  size: number;
  method: number;
  /** Where the local header starts. */
  offset: number;
  compressedSize: number;
};

const max32 = 0xffffffff;

class ZipError extends Error {}

/** A path inside the folder: no absolute path, `..`, `.`, empty part, backslash or control character. */
export function isSafeEntry(name: string): boolean {
  // eslint-disable-next-line no-control-regex -- a zip entry name with a control character is refused
  if (!name || name.startsWith('/') || /[\\\u0000-\u001f]/.test(name)) return false;

  return name.split('/').every((part) => part && part !== '.' && part !== '..');
}

async function readAt(path: string, start: number, length: number): Promise<Buffer> {
  const file = await open(path, 'r');

  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, start);

    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

function zip64Fields(extra: Buffer): bigint[] {
  for (let at = 0; at + 4 <= extra.length;) {
    const id = extra.readUInt16LE(at);
    const size = extra.readUInt16LE(at + 2);

    if (id === 0x0001) {
      const fields: bigint[] = [];

      for (let i = 0; i + 8 <= size; i += 8) fields.push(extra.readBigUInt64LE(at + 4 + i));

      return fields;
    }

    at += 4 + size;
  }

  return [];
}

/** The zip's files, from its central directory, zip64 included. */
export async function listZip(path: string, size: number): Promise<ZipFile[]> {
  const tailLength = Math.min(size, 22 + 0xffff + 20);
  const tail = await readAt(path, size - tailLength, tailLength);
  const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));

  if (end < 0) throw new ZipError('it is not a zip file');

  let count = tail.readUInt16LE(end + 10);
  let directorySize = tail.readUInt32LE(end + 12);
  let directoryStart = tail.readUInt32LE(end + 16);

  if (count === 0xffff || directorySize === max32 || directoryStart === max32) {
    const locator = end - 20;

    if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50) {
      throw new ZipError('its zip64 end record is missing');
    }

    const record = await readAt(path, Number(tail.readBigUInt64LE(locator + 8)), 56);

    if (record.readUInt32LE(0) !== 0x06064b50) {
      throw new ZipError('its zip64 end record is invalid');
    }

    count = Number(record.readBigUInt64LE(32));
    directorySize = Number(record.readBigUInt64LE(40));
    directoryStart = Number(record.readBigUInt64LE(48));
  }

  const directory = await readAt(path, directoryStart, directorySize);
  const files: ZipFile[] = [];

  for (let at = 0, i = 0; i < count; i++) {
    if (directory.readUInt32LE(at) !== 0x02014b50) throw new ZipError('its directory is invalid');

    const method = directory.readUInt16LE(at + 10);
    let compressedSize = directory.readUInt32LE(at + 20);
    let fileSize = directory.readUInt32LE(at + 24);
    const nameLength = directory.readUInt16LE(at + 28);
    const extraLength = directory.readUInt16LE(at + 30);
    const commentLength = directory.readUInt16LE(at + 32);
    let offset = directory.readUInt32LE(at + 42);
    const name = directory.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const extra = zip64Fields(
      directory.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength),
    );

    let next = 0;

    if (fileSize === max32) fileSize = Number(extra[next++]);
    if (compressedSize === max32) compressedSize = Number(extra[next++]);
    if (offset === max32) offset = Number(extra[next++]);

    files.push({ name, size: fileSize, method, offset, compressedSize });
    at += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

/**
 * Writes each file of the zip at `path` into `folder` through `place`, which returns its
 * destination relative to `folder` or `undefined` to skip it. Folders in the zip are skipped; a
 * name that would leave the folder is refused before anything is written.
 */
export async function unzipTo({
  path,
  size,
  folder,
  place = (name) => name,
}: {
  path: string;
  size: number;
  folder: string;
  place?: (name: string) => string | undefined;
}): Promise<ZipFile[]> {
  const files = (await listZip(path, size)).filter((file) => !file.name.endsWith('/'));
  const unsafe = files.find((file) => !isSafeEntry(file.name));

  if (unsafe) throw new ZipError(`it names a file outside the folder: ${unsafe.name}`);

  const written: ZipFile[] = [];

  for (const file of files) {
    const target = place(file.name);

    if (target === undefined) continue;
    if (file.method !== 0 && file.method !== 8) {
      throw new ZipError(`${file.name} uses a compression this CLI can't read`);
    }

    const header = await readAt(path, file.offset, 30);

    if (header.readUInt32LE(0) !== 0x04034b50) throw new ZipError(`${file.name} is damaged`);

    const start = file.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const destination = join(folder, target);

    await mkdir(dirname(destination), { recursive: true });

    const source =
      file.compressedSize === 0
        ? []
        : createReadStream(path, { start, end: start + file.compressedSize - 1 });

    await (file.method === 8
      ? pipeline(source, createInflateRaw(), createWriteStream(destination))
      : pipeline(source, createWriteStream(destination)));

    written.push(file);
  }

  return written;
}

export { ZipError };
