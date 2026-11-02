import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registrationFile, serviceId } from '../../../../packages/frogbot/src/bin/service/paths.js';
import { writeRegistration } from '../../../../packages/frogbot/src/bin/service/registration.js';
import { parseUpArgs, up } from '../../../../packages/frogbot/src/bin/up.js';

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

    expect(lines).toEqual([`[frogbot] ${dir} is already up at http://127.0.0.1:3007`]);
    expect(spawnSupervisor).not.toHaveBeenCalled();
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

  it('reads --port and --autostart', () => {
    expect(parseUpArgs(['--port', '3100', '--autostart'])).toEqual({ port: 3100, autostart: true });
    expect(parseUpArgs(['--port=3101'])).toEqual({ port: 3101, autostart: false });
    expect(() => parseUpArgs(['--watch'])).toThrow(/usage: frogbot up/);
  });
});
