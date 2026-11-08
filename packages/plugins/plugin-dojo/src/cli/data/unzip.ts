import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Transform } from 'node:stream';
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
  if (!Number.isSafeInteger(start) || start < 0) throw new ZipError('it is damaged');

  const file = await open(path, 'r');

  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, start);

    if (bytesRead < length) throw new ZipError('it is damaged');

    return buffer;
  } finally {
    await file.close();
  }
}

function zip64Field(fields: bigint[], index: number): number {
  const value = fields[index];

  if (value === undefined || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ZipError('its directory is invalid');
  }

  return Number(value);
}

function zip64Fields(extra: Buffer): bigint[] {
  for (let at = 0; at + 4 <= extra.length;) {
    const id = extra.readUInt16LE(at);
    const size = Math.min(extra.readUInt16LE(at + 2), extra.length - at - 4);

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

  if (end < 0 || end + 22 > tail.length) throw new ZipError('it is not a zip file');

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

    const fields = [32, 40, 48].map((at) => record.readBigUInt64LE(at));

    [count, directorySize, directoryStart] = fields.map((_, i) => zip64Field(fields, i));
  }

  if (directoryStart + directorySize > size) throw new ZipError('its directory is invalid');

  const directory = await readAt(path, directoryStart, directorySize);
  const files: ZipFile[] = [];

  for (let at = 0, i = 0; i < count; i++) {
    if (at + 46 > directory.length || directory.readUInt32LE(at) !== 0x02014b50) {
      throw new ZipError('its directory is invalid');
    }

    const method = directory.readUInt16LE(at + 10);
    let compressedSize = directory.readUInt32LE(at + 20);
    let fileSize = directory.readUInt32LE(at + 24);
    const nameLength = directory.readUInt16LE(at + 28);
    const extraLength = directory.readUInt16LE(at + 30);
    const commentLength = directory.readUInt16LE(at + 32);
    let offset = directory.readUInt32LE(at + 42);

    if (at + 46 + nameLength + extraLength + commentLength > directory.length) {
      throw new ZipError('its directory is invalid');
    }

    const name = directory.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const extra = zip64Fields(
      directory.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength),
    );

    let next = 0;

    if (fileSize === max32) fileSize = zip64Field(extra, next++);
    if (compressedSize === max32) compressedSize = zip64Field(extra, next++);
    if (offset === max32) offset = zip64Field(extra, next++);
    if (offset + 30 + compressedSize > size) throw new ZipError(`${name} is damaged`);

    files.push({ name, size: fileSize, method, offset, compressedSize });
    at += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

function exactly(size: number, name: string): Transform {
  let seen = 0;

  return new Transform({
    transform(chunk: Buffer, _, callback) {
      seen += chunk.length;
      callback(seen > size ? new ZipError(`${name} is larger than it says`) : null, chunk);
    },
    flush(callback) {
      callback(seen < size ? new ZipError(`${name} is damaged`) : null);
    },
  });
}

function clash(names: string[]): string | undefined {
  const seen = new Set<string>();

  for (const name of names) {
    if (seen.has(name)) return name;
    seen.add(name);
  }

  return names.find((name) =>
    name
      .split('/')
      .slice(0, -1)
      .some((_, i, parts) => seen.has(parts.slice(0, i + 1).join('/'))),
  );
}

/**
 * Writes each file of the zip at `path` into `folder` through `place`, which returns its
 * destination relative to `folder` or `undefined` to skip it. Folders in the zip are skipped. A
 * name that would leave the folder, a name twice, or a destination that already exists is refused
 * with a `ZipError`, as is any damage; names are checked before anything is written.
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

  const twice = clash(files.map((file) => file.name));

  if (twice) throw new ZipError(`${twice} clashes with another name in it`);

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

    if (start + file.compressedSize > size) throw new ZipError(`${file.name} is damaged`);

    const destination = join(folder, target);
    const source =
      file.compressedSize === 0
        ? []
        : createReadStream(path, { start, end: start + file.compressedSize - 1 });

    try {
      await mkdir(dirname(destination), { recursive: true });

      await (file.method === 8
        ? pipeline(
            source,
            createInflateRaw(),
            exactly(file.size, file.name),
            createWriteStream(destination, { flags: 'wx' }),
          )
        : pipeline(
            source,
            exactly(file.size, file.name),
            createWriteStream(destination, { flags: 'wx' }),
          ));
    } catch (error) {
      if (error instanceof ZipError) throw error;

      const code = (error as { code?: string }).code;

      if (code === 'EEXIST' || code === 'ENOTDIR') {
        throw new ZipError(`${target} is already in the app`);
      }

      if (code?.startsWith('Z_')) throw new ZipError(`${file.name} is damaged`);

      throw error;
    }

    written.push(file);
  }

  return written;
}

export { ZipError };
