import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { down } from '../../../../packages/frogbot/src/bin/down.js';
import { registrationFile, serviceId } from '../../../../packages/frogbot/src/bin/service/paths.js';
import {
  isAlive,
  readRegistration,
  type Registration,
  writeRegistration,
} from '../../../../packages/frogbot/src/bin/service/registration.js';

describe('frogbot down', () => {
  let state: string;
  let dir: string;
  let child: ChildProcess | undefined;
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);
  const uninstall = vi.fn(() => Promise.resolve(false));

  const registration = (pid: number): Registration => ({
    id: serviceId(dir),
    dir,
    url: 'http://127.0.0.1:3000',
    port: 3000,
    pid,
    frogbot: '0.38.0',
    startedAt: new Date().toISOString(),
    state: 'running',
    log: join(dir, '.frogbot', 'service.log'),
    autostart: false,
  });

  beforeEach(() => {
    state = mkdtempSync(join(tmpdir(), 'frogbot-down-state-'));
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'frogbot-down-app-')));
    vi.stubEnv('XDG_STATE_HOME', state);
    lines.length = 0;
  });

  afterEach(() => {
    child?.kill('SIGKILL');
    child = undefined;
    vi.unstubAllEnvs();
    rmSync(state, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  });

  it('prints "not running" for an app that is not up', async () => {
    await down([dir], { log, uninstall });

    expect(lines).toEqual([`[frogbot] ${dir} is not running`]);
  });

  it('removes the registration of a supervisor that is gone', async () => {
    const file = registrationFile(serviceId(dir));

    writeRegistration(file, registration(2 ** 22 + 12_345));
    await down([dir], { log, uninstall });

    expect(readRegistration(file)).toBeUndefined();
    expect(lines).toEqual([`[frogbot] ${dir} is not running`]);
  });

  it('stops the supervisor, then removes its registration and builds', async () => {
    child = spawn(process.execPath, ['-e', "console.log('ready'); setInterval(() => {}, 1000)"], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    await new Promise((resolve) => child!.stdout!.once('data', resolve));

    const file = registrationFile(serviceId(dir));

    writeRegistration(file, registration(child.pid!));
    mkdirSync(join(dir, '.frogbot', 'builds', 'a'), { recursive: true });

    await down([dir], { log, uninstall });

    expect(isAlive(child.pid)).toBe(false);
    expect(readRegistration(file)).toBeUndefined();
    expect(existsSync(join(dir, '.frogbot', 'builds'))).toBe(false);
    expect(lines).toEqual([`[frogbot] stopped ${dir}`]);
  });
});
