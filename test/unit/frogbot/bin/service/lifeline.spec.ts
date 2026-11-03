import { type ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { isAlive } from '../../../../../packages/frogbot/src/bin/service/registration.js';

describe('lifeline', () => {
  let parent: ChildProcess | undefined;

  afterEach(() => {
    parent?.kill('SIGKILL');
  });

  it('ends a child once the process that started it is killed with SIGKILL', async () => {
    const lifeline = pathToFileURL(
      join(import.meta.dirname, '../../../../../packages/frogbot/src/bin/service/lifeline.ts'),
    ).href;

    const script = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        env: { ...process.env, FROGBOT_LIFELINE_FD: '3', NODE_OPTIONS: '--import=${lifeline}' },
        stdio: ['ignore', 'ignore', 'inherit', 'pipe'],
        detached: true,
      });
      setTimeout(() => console.log(child.pid), 500);
      setInterval(() => {}, 1000);
    `;

    parent = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });

    const pid = Number(
      await new Promise<string>((resolve) =>
        parent!.stdout!.once('data', (d) => resolve(String(d))),
      ),
    );

    expect(isAlive(pid)).toBe(true);

    parent.kill('SIGKILL');

    await vi.waitFor(() => expect(isAlive(pid)).toBe(false), { timeout: 2000, interval: 50 });
  });
});
