import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateFiles } from '../../../packages/create-frogbot-app/src/lib/generate.js';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

const roots: string[] = [];

function app({ installed }: { installed: boolean }) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'create-frogbot-app-types-'));
  roots.push(dest);

  if (installed) {
    fs.mkdirSync(path.join(dest, 'node_modules', 'frogbot'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'node_modules', 'frogbot', 'bin.js'), '');
  }

  return dest;
}

afterEach(() => {
  vi.resetAllMocks();

  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('type generation after install', () => {
  it("runs the app's own frogbot with node, without a shell, for types then the import map", () => {
    const dest = app({ installed: true });
    const bin = path.join(dest, 'node_modules', 'frogbot', 'bin.js');
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

    expect(generateFiles(dest)).toBe(true);
    expect(vi.mocked(spawnSync).mock.calls).toEqual([
      [process.execPath, [bin, 'generate:types'], { cwd: dest, stdio: 'ignore' }],
      [process.execPath, [bin, 'generate:importmap'], { cwd: dest, stdio: 'ignore' }],
    ]);
  });

  it('reports a failed generation and stops at the first failure', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);

    expect(generateFiles(app({ installed: true }))).toBe(false);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('skips without spawning when frogbot is not installed', () => {
    expect(generateFiles(app({ installed: false }))).toBe(false);
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
