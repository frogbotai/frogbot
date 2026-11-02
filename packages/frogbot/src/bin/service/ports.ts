import { createServer } from 'node:net';

export const HOST = '127.0.0.1';
const FIRST_PORT = 3000;
const LAST_PORT = 3999;

function canListen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', (error: NodeJS.ErrnoException) =>
      resolve(error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT'),
    );

    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** Free on `127.0.0.1` and on IPv6's wildcard, where `next dev` listens and `localhost` can resolve. */
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

/**
 * `requested` when free, else failing; otherwise `saved` (the app's last port) when free, else the first
 * free port from 3000 that no other registered app holds.
 */
export async function choosePort({
  requested,
  saved,
  taken = new Set(),
  isFree = isPortFree,
}: {
  requested?: number;
  saved?: number;
  taken?: Set<number>;
  isFree?: (port: number) => Promise<boolean>;
}): Promise<number> {
  if (requested !== undefined) {
    if (await isFree(requested)) return requested;

    throw new PortTakenError(`[frogbot] port ${requested} is taken; pick another with --port`);
  }

  if (saved !== undefined && !taken.has(saved) && (await isFree(saved))) return saved;

  for (let port = FIRST_PORT; port <= LAST_PORT; port++) {
    if (!taken.has(port) && (await isFree(port))) return port;
  }

  throw new PortTakenError(
    `[frogbot] no free port from ${FIRST_PORT} to ${LAST_PORT}; pick one with --port`,
  );
}

export function parsePort(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[frogbot] "${value}" isn't a port; use a number from 1 to 65535`);
  }

  return port;
}
