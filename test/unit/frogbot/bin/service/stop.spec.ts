import { type ChildProcess, spawn } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { stopProcess } from '../../../../../packages/frogbot/src/bin/service/stop.js';

const children: ChildProcess[] = [];

function start(script: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['-e', `${script}; console.log('ready'); setInterval(() => {}, 1000);`],
      {
        detached: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );

    children.push(child);
    child.stdout.once('data', () => resolve(child.pid!));
  });
}

describe('stopProcess', () => {
  afterEach(() => {
    for (const child of children.splice(0)) child.kill('SIGKILL');
  });

  it('stops a process that exits on SIGTERM', async () => {
    const pid = await start('');

    expect(await stopProcess(pid)).toBe('stopped');
  });

  it('escalates to SIGKILL when SIGTERM is ignored', async () => {
    const pid = await start("process.on('SIGTERM', () => {})");

    expect(await stopProcess(pid, { timeout: 300 })).toBe('killed');
  });

  it('reports a process that is already gone', async () => {
    expect(await stopProcess(undefined)).toBe('not running');
    expect(await stopProcess(2 ** 22 + 12_345)).toBe('not running');
  });
});
