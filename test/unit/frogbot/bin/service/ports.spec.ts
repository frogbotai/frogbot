import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  choosePort,
  freePort,
  isPortFree,
  listenError,
  parsePort,
  readSavedPort,
  writeSavedPort,
} from '../../../../../packages/frogbot/src/bin/service/ports.js';

const servers: Server[] = [];
let dir: string | undefined;

function hold(port: number): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer();

    servers.push(server);
    server.listen(port, '127.0.0.1', () => resolve());
  });
}

describe('port choice', () => {
  afterEach(async () => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
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

  it("prefers the app's last port, then the first free from 9696 no other app holds", async () => {
    const free = new Set([9696, 9697, 9698, 9699, 9701]);
    const isFree = (port: number) => Promise.resolve(free.has(port));
    const auto = (port: number) => ({ port, chosen: false });

    expect(await choosePort({ isFree })).toBe(9696);
    expect(await choosePort({ saved: auto(9701), isFree })).toBe(9701);
    expect(await choosePort({ saved: auto(9700), isFree })).toBe(9696);
    expect(await choosePort({ saved: auto(9697), taken: new Set([9697]), isFree })).toBe(9696);
    expect(await choosePort({ taken: new Set([9696, 9697]), isFree })).toBe(9698);
  });

  it('keeps a port chosen with --port, naming what holds it instead of picking another', async () => {
    const isFree = (port: number) => Promise.resolve(port !== 4321);
    const holder = () => Promise.resolve('node (pid 123)');

    expect(await choosePort({ saved: { port: 4000, chosen: true }, isFree })).toBe(4000);
    await expect(
      choosePort({ saved: { port: 4321, chosen: true }, isFree, holder }),
    ).rejects.toThrow('[frogbot] port 4321 is taken by node (pid 123); pick another with --port');
    await expect(
      choosePort({ requested: 4321, isFree, holder: () => Promise.resolve(undefined) }),
    ).rejects.toThrow('[frogbot] port 4321 is taken; pick another with --port');
  });

  it('says a port below 1024 needs admin rights, and a taken one is taken', () => {
    const error = (code: string) => Object.assign(new Error(code), { code });

    expect(listenError(80, error('EACCES')).message).toBe(
      '[frogbot] port 80 needs admin rights; pick one above 1023',
    );
    expect(listenError(9696, error('EADDRINUSE')).message).toBe(
      '[frogbot] port 9696 is taken; pick another with --port',
    );
  });

  it('rejects a port that is not a number from 1 to 65535 or auto', () => {
    expect(parsePort('3100')).toBe(3100);
    expect(parsePort('auto')).toBe('auto');
    expect(parsePort(undefined)).toBeUndefined();
    expect(() => parsePort('abc')).toThrow(/isn't a port/);
    expect(() => parsePort('70000')).toThrow(/isn't a port/);
  });

  it('reads .frogbot/port as JSON, or as the bare number FrogBot 0.39 wrote', () => {
    dir = mkdtempSync(join(tmpdir(), 'frogbot-port-'));

    const file = join(dir, '.frogbot', 'port');

    expect(readSavedPort(file)).toBeUndefined();

    writeSavedPort(file, { port: 4000, chosen: true });

    expect(readSavedPort(file)).toEqual({ port: 4000, chosen: true });

    writeFileSync(file, '3000\n');

    expect(readSavedPort(file)).toEqual({ port: 3000, chosen: false });

    writeFileSync(file, 'nonsense');

    expect(readSavedPort(file)).toBeUndefined();
  });
});
