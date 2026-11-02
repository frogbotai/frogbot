import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registrationFile } from '../../../../packages/frogbot/src/bin/service/paths.js';
import {
  type Registration,
  writeRegistration,
} from '../../../../packages/frogbot/src/bin/service/registration.js';
import { status, statusRows } from '../../../../packages/frogbot/src/bin/status.js';

const registration = (changes: Partial<Registration>): Registration => ({
  id: 'one',
  dir: '/apps/one',
  url: 'http://127.0.0.1:3000',
  port: 3000,
  pid: process.pid,
  frogbot: '0.38.0',
  startedAt: '2026-11-01T12:00:00.000Z',
  state: 'running',
  log: '/apps/one/.frogbot/service.log',
  autostart: false,
  ...changes,
});

describe('frogbot status', () => {
  let state: string;

  beforeEach(() => {
    state = mkdtempSync(join(tmpdir(), 'frogbot-status-'));
    vi.stubEnv('XDG_STATE_HOME', state);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(state, { recursive: true, force: true });
  });

  it('lists every registered app from any folder, a dead supervisor as stopped', () => {
    writeRegistration(
      registrationFile('one'),
      registration({ startedAt: new Date().toISOString() }),
    );

    writeRegistration(
      registrationFile('two'),
      registration({
        id: 'two',
        dir: '/apps/two',
        url: 'http://127.0.0.1:3001',
        pid: 2 ** 22 + 12_345,
        state: 'update failed',
        lastError: 'build failed (exit 1)\nType error: x',
      }),
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    status();

    const lines = String(log.mock.calls[0][0]).split('\n');

    expect(lines[0]).toBe('FOLDER     URL                    STATE    UPTIME  LAST ERROR');
    expect(lines[1]).toMatch(/^\/apps\/one {2}http:\/\/127\.0\.0\.1:3000 {2}running {2}\d+s$/);
    expect(lines[2]).toBe('/apps/two  http://127.0.0.1:3001  stopped  -       Type error: x');
  });

  it('shows uptime in seconds, minutes, hours and days', () => {
    const now = Date.parse('2026-11-01T12:00:00.000Z');
    const at = (seconds: number) =>
      statusRows(
        [registration({ startedAt: new Date(now - seconds * 1000).toISOString() })],
        now,
      )[0][3];

    expect([at(5), at(125), at(3 * 3600 + 120), at(2 * 86_400 + 3600)]).toEqual([
      '5s',
      '2m',
      '3h 2m',
      '2d 1h',
    ]);
  });

  it('says how to start an app when none is up', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    status();

    expect(log).toHaveBeenCalledWith(
      '[frogbot] no apps are up; start one with `frogbot up` in its folder',
    );
  });
});
