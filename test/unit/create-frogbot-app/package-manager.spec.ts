import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { installDependencies } from '../../../packages/create-frogbot-app/src/lib/package-manager.js';
import type { PackageManager } from '../../../packages/create-frogbot-app/src/types.js';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('dependency installation', () => {
  it.each(['npm', 'pnpm', 'yarn', 'bun'] as const)(
    'launches the fixed %s install command through cmd on Windows',
    (manager) => {
      vi.stubGlobal('process', { ...process, platform: 'win32' });
      vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

      expect(installDependencies('C:\\Projects\\app & other', manager)).toBe(true);
      expect(spawnSync).toHaveBeenCalledExactlyOnceWith(
        'cmd.exe',
        ['/d', '/s', '/c', `${manager} install`],
        { cwd: 'C:\\Projects\\app & other', stdio: 'inherit' },
      );
    },
  );

  it.each(['npm & whoami', 'npm\nwhoami', '__proto__', 'toString'])(
    'rejects an untrusted manager before spawning: %s',
    (manager) => {
      vi.stubGlobal('process', { ...process, platform: 'win32' });

      expect(() => installDependencies('app', manager as PackageManager)).toThrow(
        'Unknown package manager',
      );
      expect(spawnSync).not.toHaveBeenCalled();
    },
  );

  it('launches directly without a shell on Unix', () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

    expect(installDependencies('/projects/app & other', 'npm')).toBe(true);
    expect(spawnSync).toHaveBeenCalledExactlyOnceWith('npm', ['install'], {
      cwd: '/projects/app & other',
      stdio: 'inherit',
    });
  });

  it.each([1, null])('reports unsuccessful process status %s', (status) => {
    vi.mocked(spawnSync).mockReturnValue({ status } as ReturnType<typeof spawnSync>);

    expect(installDependencies('app', 'npm')).toBe(false);
  });
});
