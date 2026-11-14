import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { postgresAdapter } from '@frogbotai/db-postgres';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registrationFile, serviceId } from '../../../../packages/frogbot/src/bin/service/paths.js';
import { writeRegistration } from '../../../../packages/frogbot/src/bin/service/registration.js';
import { age, alreadyUp, parseUpArgs, up } from '../../../../packages/frogbot/src/bin/up.js';

const loaded = vi.hoisted(() => ({ config: undefined as unknown }));

vi.mock('../../../../packages/frogbot/src/config/load.js', () => ({
  loadConfig: () => Promise.resolve(loaded.config),
}));

function failingSupervisor(stderr: string) {
  return () => {
    const child = Object.assign(new EventEmitter(), {
      stderr: new PassThrough(),
      unref: () => {},
    });

    setImmediate(() => {
      child.stderr.write(stderr);
      child.emit('exit', 1, null);
    });

    return child as unknown as ChildProcess;
  };
}

describe('frogbot up', () => {
  let state: string;
  let dir: string;
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);

  beforeEach(() => {
    state = mkdtempSync(join(tmpdir(), 'frogbot-up-state-'));
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'frogbot-up-app-')));
    writeFileSync(join(dir, 'next.config.mjs'), 'export default {};\n');
    vi.stubEnv('XDG_STATE_HOME', state);
    vi.stubEnv('FROGBOT_SERVICE', '');
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    lines.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(state, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  });

  it('prints the URL of an app that is already up, starting nothing', async () => {
    const spawnSupervisor = vi.fn();

    writeRegistration(registrationFile(serviceId(dir)), {
      id: serviceId(dir),
      dir,
      url: 'http://127.0.0.1:3007',
      port: 3007,
      pid: process.pid,
      frogbot: '0.38.0',
      startedAt: new Date().toISOString(),
      state: 'running',
      log: join(dir, '.frogbot', 'service.log'),
      autostart: false,
    });

    await up([], { log, spawnSupervisor });

    expect(lines).toEqual([
      `[frogbot] ${dir} is already up at http://127.0.0.1:3007, watching for changes`,
    ]);
    expect(spawnSupervisor).not.toHaveBeenCalled();
  });

  it('exits 1 for --autostart on an app already up without it', async () => {
    writeRegistration(registrationFile(serviceId(dir)), {
      id: serviceId(dir),
      dir,
      url: 'http://127.0.0.1:9696',
      port: 9696,
      pid: process.pid,
      frogbot: '0.39.0',
      startedAt: new Date().toISOString(),
      state: 'running',
      log: join(dir, '.frogbot', 'service.log'),
      autostart: false,
    });

    await expect(up(['--autostart'], { log, platform: 'darwin' })).rejects.toThrow(
      /already up at http:\/\/127\.0\.0\.1:9696, without autostart; run `frogbot down`, then `frogbot up --autostart`/,
    );
  });

  it('refuses --autostart off macOS before anything else', async () => {
    const spawnSupervisor = vi.fn();
    const install = vi.fn();

    await expect(
      up(['--autostart'], { platform: 'linux', spawnSupervisor, install }),
    ).rejects.toThrow(/--autostart needs macOS/);
    expect(spawnSupervisor).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });

  it("prints the supervisor's error when the first build fails", async () => {
    await expect(
      up([], {
        log,
        spawnSupervisor: failingSupervisor(
          '[frogbot] up failed: build failed (exit 1)\nType error: nope\n',
        ),
      }),
    ).rejects.toThrow('[frogbot] up failed:\nbuild failed (exit 1)\nType error: nope');
    expect(lines).toEqual([]);
  });

  it('needs a Next app in the folder', async () => {
    rmSync(join(dir, 'next.config.mjs'));

    await expect(up([], { log })).rejects.toThrow(/no next\.config/);
  });

  it("runs a Postgres app's schema sync in the schema step, before the server starts", async () => {
    const db = postgresAdapter({ pool: { connectionString: 'postgres://p:p@127.0.0.1:1/deals' } });
    const config = { _internal: { payloadConfig: Promise.resolve({ db }) } };
    const syncSchema = vi.fn().mockResolvedValue({
      ok: true,
      applied: ['ALTER TABLE "deals" ADD COLUMN "stage" varchar;'],
      kept: [],
    });

    expect(db.syncSchema).toBeTypeOf('function');
    expect(postgresAdapter({ pool: {}, prodMigrations: [] }).syncSchema).toBeUndefined();

    loaded.config = config;
    Object.assign(db, { syncSchema });
    vi.stubEnv('FROGBOT_SERVICE', 'schema');

    const written: string[] = [];

    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));

      return true;
    });

    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await up([]);

    expect(syncSchema).toHaveBeenCalledWith({ config });
    expect(written.join('')).toBe('\n{"frogbot":"schema","ok":true,"applied":1,"kept":[]}\n');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('reads --port and --autostart', () => {
    expect(parseUpArgs(['--port', '3100', '--autostart'])).toEqual({ port: 3100, autostart: true });
    expect(parseUpArgs(['--port=3101'])).toEqual({ port: 3101, autostart: false });
    expect(parseUpArgs(['--port', 'auto'])).toEqual({ port: 'auto', autostart: false });
    expect(() => parseUpArgs(['--watch'])).toThrow(/usage: frogbot up/);
  });
});

describe('the already-up line', () => {
  const found = {
    id: 'abc',
    dir: '/apps/crm',
    url: 'http://127.0.0.1:9696',
    port: 9696,
    pid: 1,
    frogbot: '0.41.0',
    startedAt: '2026-11-12T10:00:00.000Z',
    state: 'running' as const,
    log: '/apps/crm/.frogbot/service.log',
    autostart: false,
  };

  const now = Date.parse('2026-11-12T12:00:00.000Z');

  it('says it is watching and when the last build landed', () => {
    expect(alreadyUp({ ...found, builtAt: '2026-11-12T11:57:30.000Z' }, now)).toEqual([
      '[frogbot] /apps/crm is already up at http://127.0.0.1:9696, watching for changes (last build 2 min ago)',
    ]);
  });

  it('adds the last error on its own line', () => {
    expect(
      alreadyUp(
        {
          ...found,
          state: 'update failed',
          builtAt: '2026-11-12T11:59:15.000Z',
          lastError: 'build failed (exit 1)',
        },
        now,
      ),
    ).toEqual([
      '[frogbot] /apps/crm is already up at http://127.0.0.1:9696, watching for changes (last build 45 s ago)',
      '[frogbot] last error: build failed (exit 1)',
    ]);
  });

  it('leaves out the build time for a supervisor that never recorded one', () => {
    expect(alreadyUp(found, now)).toEqual([
      '[frogbot] /apps/crm is already up at http://127.0.0.1:9696, watching for changes',
    ]);
  });

  it.each([
    [0, '0 s'],
    [59_999, '59 s'],
    [60_000, '1 min'],
    [3_599_999, '59 min'],
    [3_600_000, '1 h'],
    [86_399_999, '23 h'],
    [2 * 86_400_000, '2 d'],
    [-5000, '0 s'],
  ])('rounds %i ms down to %s', (ms, text) => {
    expect(age(now - ms, now)).toBe(text);
  });
});
