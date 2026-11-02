import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  registrationFile,
  serviceId,
} from '../../../../../packages/frogbot/src/bin/service/paths.js';
import {
  listRegistrations,
  readRegistration,
  type Registration,
  removeRegistration,
  watchOwnership,
  writeRegistration,
} from '../../../../../packages/frogbot/src/bin/service/registration.js';

const registration = (changes: Partial<Registration> = {}): Registration => ({
  id: 'abc123def456',
  dir: '/apps/one',
  url: 'http://127.0.0.1:3000',
  port: 3000,
  pid: 4242,
  frogbot: '0.38.0',
  startedAt: '2026-11-01T00:00:00.000Z',
  state: 'running',
  log: '/apps/one/.frogbot/service.log',
  autostart: false,
  ...changes,
});

describe('service registration', () => {
  let state: string;

  beforeEach(() => {
    state = mkdtempSync(join(tmpdir(), 'frogbot-registration-'));
    vi.stubEnv('XDG_STATE_HOME', state);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(state, { recursive: true, force: true });
  });

  it('lives at <XDG_STATE_HOME>/frogbot/services/<id>.json, the id hashing the folder', () => {
    expect(serviceId(state)).toMatch(/^[0-9a-f]{12}$/);
    expect(serviceId(state)).toBe(serviceId(`${state}/.`));
    expect(registrationFile('abc123def456')).toBe(
      join(state, 'frogbot', 'services', 'abc123def456.json'),
    );
  });

  it('writes atomically, readable only by the user, leaving no temp file', () => {
    const file = registrationFile('abc123def456');

    writeRegistration(file, registration());

    expect(readRegistration(file)).toEqual(registration());
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(state, 'frogbot', 'services')).mode & 0o777).toBe(0o700);
    expect(readdirSync(join(state, 'frogbot', 'services'))).toEqual(['abc123def456.json']);
  });

  it('lists every registration and skips unreadable files', () => {
    writeRegistration(registrationFile('b'), registration({ id: 'b', dir: '/apps/two' }));
    writeRegistration(registrationFile('a'), registration({ id: 'a', dir: '/apps/one' }));
    writeFileSync(join(state, 'frogbot', 'services', 'broken.json'), '{');

    expect(listRegistrations().map(({ dir }) => dir)).toEqual(['/apps/one', '/apps/two']);
  });

  it('removes a registration only while it names the same id and pid', () => {
    const file = registrationFile('abc123def456');

    writeRegistration(file, registration({ pid: 1 }));

    expect(removeRegistration(file, { id: 'abc123def456', pid: 2 })).toBe(false);
    expect(readRegistration(file)).toBeDefined();
    expect(removeRegistration(file, { id: 'abc123def456', pid: 1 })).toBe(true);
    expect(readRegistration(file)).toBeUndefined();
  });

  it.each([
    ['deleted', (file: string) => rmSync(file)],
    ['given another id', (file: string) => writeRegistration(file, registration({ id: 'other' }))],
    ['given another pid', (file: string) => writeRegistration(file, registration({ pid: 99 }))],
  ])('stops its owner within 5 s once the file is %s', (_, change) => {
    vi.useFakeTimers();

    const file = registrationFile('abc123def456');
    const onLost = vi.fn();

    writeRegistration(file, registration());
    watchOwnership({ file, owner: registration(), onLost });

    writeRegistration(file, registration({ state: 'building' }));
    vi.advanceTimersByTime(5000);

    expect(onLost).not.toHaveBeenCalled();

    change(file);
    vi.advanceTimersByTime(5000);

    expect(onLost).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(20_000);

    expect(onLost).toHaveBeenCalledOnce();
  });
});
