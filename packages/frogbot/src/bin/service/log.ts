import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export const MAX_LOG_BYTES = 10 * 1024 * 1024;

export type Log = {
  /** Writes each line of `text`, timestamped and tagged with `source`. */
  write: (source: string, text: string) => void;
  /** A writer for a stream's chunks, holding a partial line until its newline. */
  stream: (source: string) => (chunk: Buffer | string) => void;
};

/** Timestamped lines appended to `file`, which is renamed to `<file>.1` once it reaches `maxBytes`. */
export function createLog(
  file: string,
  { maxBytes = MAX_LOG_BYTES, now = () => new Date() } = {},
): Log {
  mkdirSync(dirname(file), { recursive: true });

  let size = sizeOf(file);

  function append(text: string) {
    if (size >= maxBytes) {
      try {
        renameSync(file, `${file}.1`);
      } catch {}

      size = 0;
    }

    try {
      appendFileSync(file, text);
      size += Buffer.byteLength(text);
    } catch {}
  }

  function write(source: string, text: string) {
    const stamp = now().toISOString();
    const lines = text.replace(/\n$/, '').split('\n');

    append(lines.map((line) => `${stamp} [${source}] ${line}\n`).join(''));
  }

  return {
    write,
    stream(source) {
      let partial = '';

      return (chunk) => {
        const text = partial + String(chunk);
        const end = text.lastIndexOf('\n');

        if (end === -1) {
          partial = text;

          return;
        }

        partial = text.slice(end + 1);
        write(source, text.slice(0, end));
      };
    },
  };
}

function sizeOf(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}
