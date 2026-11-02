import { createServer, type IncomingMessage, request, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';

import { HOST } from './ports.js';

export type Upstream = { port: number; inFlight: number; onIdle?: () => void };

function done(upstream: Upstream) {
  upstream.inFlight--;
  if (upstream.inFlight === 0) upstream.onIdle?.();
}

function rawHead(req: IncomingMessage): string {
  const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];

  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
  }

  return `${lines.join('\r\n')}\r\n\r\n`;
}

/**
 * Holds the public port and pipes each request, unbuffered, to the current server; WebSocket
 * upgrades are piped over raw sockets. A request keeps the server it started on, so a swap never
 * cuts one off.
 */
export function createProxy() {
  let current: Upstream | undefined;

  const server: Server = createServer((req, res) => {
    const upstream = current;

    if (!upstream) {
      res.writeHead(503, { 'content-type': 'text/plain', 'retry-after': '1' });
      res.end('FrogBot is starting this app; try again in a moment.\n');

      return;
    }

    upstream.inFlight++;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done(upstream);
    };

    const forward = request(
      {
        host: HOST,
        port: upstream.port,
        method: req.method,
        path: req.url,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.statusMessage, response.rawHeaders);
        res.flushHeaders();
        response.pipe(res);
        response.on('end', finish);
        response.on('error', () => res.destroy());
      },
    );

    forward.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('FrogBot could not reach this app’s server.\n');
      } else {
        res.destroy();
      }

      finish();
    });

    res.on('close', () => {
      forward.destroy();
      finish();
    });

    req.pipe(forward);
  });

  server.on('upgrade', (req, socket: Socket, head: Buffer) => {
    const upstream = current;

    if (!upstream) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');

      return;
    }

    upstream.inFlight++;

    const target = connect({ host: HOST, port: upstream.port }, () => {
      target.write(rawHead(req));
      if (head.length) target.write(head);
      target.pipe(socket);
      socket.pipe(target);
    });

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      target.destroy();
      socket.destroy();
      done(upstream);
    };

    target.on('error', close).on('close', close);
    socket.on('error', close).on('close', close);
  });

  server.requestTimeout = 0;
  server.headersTimeout = 60_000;

  return {
    server,
    listen(port: number): Promise<void> {
      return new Promise((resolve, reject) => {
        server.once('error', reject);

        server.listen({ port, host: HOST, exclusive: true }, () => {
          server.off('error', reject);
          resolve();
        });
      });
    },
    get current(): Upstream | undefined {
      return current;
    },
    switchTo(port: number): Upstream | undefined {
      const previous = current;

      current = { port, inFlight: 0 };

      return previous;
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}

/** Resolves once `upstream` has no request open, or after `timeout` ms. */
export function drained(upstream: Upstream, timeout = 30_000): Promise<void> {
  if (upstream.inFlight === 0) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeout);

    upstream.onIdle = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}
