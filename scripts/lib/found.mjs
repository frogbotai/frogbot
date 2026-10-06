import { closeSync, existsSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';

const ID = /^- F-(\d+)\b/gm;

const LOCK_TRIES = 20;

export function findingIds(text) {
  return [...text.matchAll(ID)].map(([, id]) => Number(id));
}

export function nextFindingId(texts) {
  const highest = Math.max(0, ...texts.flatMap(findingIds));

  return `F-${String(highest + 1).padStart(3, '0')}`;
}

export function findingLine({ id, text, source }) {
  const body = text.trim().replace(/\s*\n\s*/g, ' ');

  return `- ${id} ${body}${source ? ` [source](${source})` : ''}`;
}

function withLock(file, callback) {
  const lock = `${file}.lock`;

  for (let attempt = 0; attempt < LOCK_TRIES; attempt++) {
    let fd;

    try {
      fd = openSync(lock, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      continue;
    }

    try {
      return callback();
    } finally {
      closeSync(fd);
      rmSync(lock, { force: true });
    }
  }

  throw new Error(`${lock} is held; remove it if no other "ticket found" is running`);
}

export function appendFinding({ file, archive, text, source }) {
  return withLock(file, () => {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const archived = archive && existsSync(archive) ? readFileSync(archive, 'utf8') : '';
    const id = nextFindingId([current, archived]);
    const line = findingLine({ id, text, source });
    const fd = openSync(file, 'a');

    try {
      writeSync(fd, `${current === '' || current.endsWith('\n') ? '' : '\n'}${line}\n`);
    } finally {
      closeSync(fd);
    }

    return { id, line };
  });
}
