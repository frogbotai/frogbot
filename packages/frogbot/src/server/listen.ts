// Start the Hono server and return a graceful shutdown function.

import { serve as honoServe } from '@hono/node-server';
import type { Hono } from 'hono';

/**
 * Starts the Hono app on the given port.
 * Returns a shutdown function that closes the server and any resources.
 */
export function listen(app: Hono, port: number): Promise<() => Promise<void>> {
  const server = honoServe({
    fetch: app.fetch,
    port,
  });

  return Promise.resolve(() => {
    return new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}
