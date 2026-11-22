import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { registrationFile, serviceId } from '../../../../packages/frogbot/src/bin/service/paths.js';
import { writeRegistration } from '../../../../packages/frogbot/src/bin/service/registration.js';
import { SETTINGS_SIGNAL } from '../../../../packages/frogbot/src/bin/service/supervisor.js';
import { up } from '../../../../packages/frogbot/src/bin/up.js';

const folders: string[] = [];
const olderSupervisor = () => {};

afterEach(() => {
  process.off(SETTINGS_SIGNAL, olderSupervisor);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();

  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

it('fails within seconds when a supervisor from an older FrogBot ignores the switch', async () => {
  const state = mkdtempSync(join(tmpdir(), 'frogbot-up-switch-state-'));
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'frogbot-up-switch-app-')));

  folders.push(state, dir);
  writeFileSync(join(dir, 'next.config.mjs'), 'export default {};\n');
  mkdirSync(join(dir, '.frogbot'));
  vi.stubEnv('XDG_STATE_HOME', state);
  vi.stubEnv('FROGBOT_SERVICE', '');
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  process.on(SETTINGS_SIGNAL, olderSupervisor);

  writeRegistration(registrationFile(serviceId(dir)), {
    id: serviceId(dir),
    dir,
    url: 'http://127.0.0.1:3007',
    port: 3007,
    pid: process.pid,
    frogbot: '0.41.0',
    startedAt: new Date().toISOString(),
    state: 'running',
    log: join(dir, '.frogbot', 'service.log'),
    autostart: false,
  });

  await expect(up(['--dev'], { log: () => {} })).rejects.toThrow(
    "supervisor didn't take the switch; one from an older FrogBot can't switch modes. Run `frogbot down`, then `frogbot up --dev`",
  );
  expect(existsSync(join(dir, '.frogbot', 'mode-request'))).toBe(false);
}, 20_000);
