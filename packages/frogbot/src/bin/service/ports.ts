import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname } from 'node:path';

export const HOST = '127.0.0.1';
/** The proxy's hosts: `localhost` resolves to either. */
export const HOSTS = [HOST, '::1'] as const;
export const FIRST_PORT = 9696;
const LAST_PORT = FIRST_PORT + 999;

/** The app's port in `.frogbot/port`; `chosen` when it came from `--port`, so every later `up` keeps it. */
export type SavedPort = { port: number; chosen: boolean };

function canListen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EACCES') reject(listenError(port, error));
      else resolve(error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT');
    });

    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/**
 * Free on `127.0.0.1` and on IPv6's wildcard, where `next dev` listens and `localhost` can resolve;
 * throws when the port needs admin rights.
 */
export async function isPortFree(port: number): Promise<boolean> {
  return (await canListen(port, HOST)) && (await canListen(port, '::'));
}

/** A port the OS says is free now, for a server behind the proxy. */
export function freePort(host = HOST): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);

    server.listen({ port: 0, host }, () => {
      const { port } = server.address() as { port: number };

      server.close(() => resolve(port));
    });
  });
}

export class PortTakenError extends Error {}

/** `node (pid 123)` for the process listening on `port`, when `lsof` can tell. */
export function portHolder(port: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'],
      { timeout: 2000 },
      (error, stdout) => {
        const pid = /^p(\d+)$/m.exec(stdout ?? '')?.[1];
        const command = /^c(.+)$/m.exec(stdout ?? '')?.[1];

        resolve(error || !pid ? undefined : `${command ?? 'a process'} (pid ${pid})`);
      },
    );
  });
}

async function takenError(port: number, holder: (port: number) => Promise<string | undefined>) {
  const by = await holder(port);

  return new PortTakenError(
    `[frogbot] port ${port} is taken${by ? ` by ${by}` : ''}; pick another with --port`,
  );
}

/**
 * `requested` when free, else failing; a port saved by `--port` the same way. Otherwise the app's last
 * port when free, else the first free port from 9696 that no other registered app holds.
 */
export async function choosePort({
  requested,
  saved,
  taken = new Set(),
  isFree = isPortFree,
  holder = portHolder,
}: {
  requested?: number;
  saved?: SavedPort;
  taken?: Set<number>;
  isFree?: (port: number) => Promise<boolean>;
  holder?: (port: number) => Promise<string | undefined>;
}): Promise<number> {
  const fixed = requested ?? (saved?.chosen ? saved.port : undefined);

  if (fixed !== undefined) {
    if (!taken.has(fixed) && (await isFree(fixed))) return fixed;

    throw await takenError(fixed, holder);
  }

  if (saved && !taken.has(saved.port) && (await isFree(saved.port))) return saved.port;

  for (let port = FIRST_PORT; port <= LAST_PORT; port++) {
    if (!taken.has(port) && (await isFree(port))) return port;
  }

  throw new PortTakenError(
    `[frogbot] no free port from ${FIRST_PORT} to ${LAST_PORT}; pick one with --port`,
  );
}

/** A port from 1 to 65535, or `auto` for FrogBot's choice. */
export function parsePort(value: string | undefined): number | 'auto' | undefined {
  if (value === 'auto') return 'auto';

  return parsePortNumber(value);
}

export function parsePortNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[frogbot] "${value}" isn't a port; use a number from 1 to 65535, or auto`);
  }

  return port;
}

/** Reads `.frogbot/port`: JSON, or the bare number FrogBot 0.39 wrote. */
export function readSavedPort(file: string): SavedPort | undefined {
  let text: string;

  try {
    text = readFileSync(file, 'utf8').trim();
  } catch {
    return undefined;
  }

  try {
    const value = JSON.parse(text) as unknown;

    if (typeof value === 'number') return { port: parsePortNumber(String(value))!, chosen: false };

    const { port, chosen } = value as Partial<SavedPort>;
    const valid = parsePortNumber(String(port));

    return valid === undefined ? undefined : { port: valid, chosen: chosen === true };
  } catch {
    return undefined;
  }
}

export function writeSavedPort(file: string, saved: SavedPort): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(saved)}\n`);
}

/** The message for a listen error on the public port. */
export function listenError(port: number, error: NodeJS.ErrnoException): Error {
  if (error.code === 'EACCES') {
    return new PortTakenError(`[frogbot] port ${port} needs admin rights; pick one above 1023`);
  }

  if (error.code === 'EADDRINUSE') {
    return new PortTakenError(`[frogbot] port ${port} is taken; pick another with --port`);
  }

  return error;
}
