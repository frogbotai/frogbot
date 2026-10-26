import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { freeStalePorts } from '../../browser/__helpers/freeStalePorts';

const dirs: string[] = [];
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGKILL');

  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'free-stale-ports-')));

  dirs.push(dir);

  return dir;
}

async function listen(cwd: string): Promise<{ child: ChildProcess; port: number }> {
  const child = spawn(
    process.execPath,
    [
      '-e',
      "const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => console.log(s.address().port));",
    ],
    { cwd, stdio: ['ignore', 'pipe', 'ignore'] },
  );

  children.push(child);

  const port = await new Promise<number>((resolve, reject) => {
    child.stdout?.once('data', (chunk: Buffer) => resolve(Number(String(chunk).trim())));
    child.once('error', reject);
  });

  return { child, port };
}

const exited = (child: ChildProcess) =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise<void>((resolve) => child.once('exit', () => resolve()));

describe.skipIf(process.platform === 'win32')('freeStalePorts', () => {
  it('stops a listener started inside the checkout and leaves others running', async () => {
    const checkout = tempDir();
    const inside = await listen(checkout);
    const outside = await listen(tempDir());

    const stopped = freeStalePorts([1, inside.port, outside.port], checkout);

    expect(stopped).toEqual([inside.child.pid]);

    await exited(inside.child);

    expect(inside.child.signalCode).toBe('SIGTERM');
    expect(outside.child.exitCode).toBeNull();
    expect(outside.child.signalCode).toBeNull();
  });

  it('does nothing when no port is in use', () => {
    expect(freeStalePorts([1], tempDir())).toEqual([]);
  });
});
