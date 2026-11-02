import { createServer, type Server } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import {
  choosePort,
  freePort,
  isPortFree,
  parsePort,
} from '../../../../../packages/frogbot/src/bin/service/ports.js';

const servers: Server[] = [];

function hold(port: number): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer();

    servers.push(server);
    server.listen(port, '127.0.0.1', () => resolve());
  });
}

describe('port choice', () => {
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
  });

  it('sees a port held on 127.0.0.1 as taken', async () => {
    const port = await freePort();

    expect(await isPortFree(port)).toBe(true);

    await hold(port);

    expect(await isPortFree(port)).toBe(false);
  });

  it('uses --port when free and fails when it is taken', async () => {
    const port = await freePort();

    expect(await choosePort({ requested: port })).toBe(port);

    await hold(port);

    await expect(choosePort({ requested: port })).rejects.toThrow(`port ${port} is taken`);
  });

  it("prefers the app's last port, then the first free from 3000 no other app holds", async () => {
    const free = new Set([3000, 3001, 3002, 3003, 3005]);
    const isFree = (port: number) => Promise.resolve(free.has(port));

    expect(await choosePort({ saved: 3005, isFree })).toBe(3005);
    expect(await choosePort({ saved: 3004, isFree })).toBe(3000);
    expect(await choosePort({ saved: 3001, taken: new Set([3001]), isFree })).toBe(3000);
    expect(await choosePort({ taken: new Set([3000, 3001]), isFree })).toBe(3002);
  });

  it('rejects a port that is not a number from 1 to 65535', () => {
    expect(parsePort('3100')).toBe(3100);
    expect(parsePort(undefined)).toBeUndefined();
    expect(() => parsePort('abc')).toThrow(/isn't a port/);
    expect(() => parsePort('70000')).toThrow(/isn't a port/);
  });
});
