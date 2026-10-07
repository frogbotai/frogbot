import { execFileSync, spawn } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { spawnServer, terminateProcess } from '../../e2e/process';
import { findOrphans } from '../../e2e/sweep';

const guardian = new URL('../../e2e/guardian.mjs', import.meta.url).pathname;

function groupMembers(pgid: number): number[] {
  try {
    return execFileSync('pgrep', ['-g', String(pgid)], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(Number);
  } catch {
    return [];
  }
}

const forkingServer = [
  '-e',
  "require('child_process').spawn('sleep', ['300'], { stdio: 'ignore' }); setInterval(() => {}, 1000);",
];

describe.skipIf(process.platform === 'win32')('test server process groups', () => {
  it('kills the whole group, grandchildren included, when the spawner is SIGKILLed', async () => {
    const worker = spawn(
      process.execPath,
      [
        '-e',
        `const c = require('child_process').spawn(process.execPath, [${JSON.stringify(guardian)}, process.execPath, ...${JSON.stringify(forkingServer)}], { detached: true, stdio: ['pipe', 'ignore', 'ignore'] });
         console.log(c.pid); setInterval(() => {}, 1000);`,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );

    const pgid = await new Promise<number>((resolve) =>
      worker.stdout.once('data', (chunk: Buffer) => resolve(Number(String(chunk).trim()))),
    );

    await expect.poll(() => groupMembers(pgid).length, { timeout: 5000 }).toBeGreaterThanOrEqual(3);

    worker.kill('SIGKILL');

    await expect.poll(() => groupMembers(pgid), { timeout: 5000 }).toEqual([]);
  });

  it('passes the server exit code through', async () => {
    const child = spawnServer(process.execPath, ['-e', 'process.exit(7)']);
    const [code] = await new Promise<[number | null]>((resolve) =>
      child.once('exit', (exitCode) => resolve([exitCode])),
    );

    expect(code).toBe(7);
  });

  it('reaps stragglers when the server exits on its own', async () => {
    const child = spawnServer(process.execPath, [
      '-e',
      "require('child_process').spawn('sleep', ['300'], { stdio: 'ignore' }); setTimeout(() => process.exit(0), 200);",
    ]);

    await new Promise((resolve) => child.once('exit', resolve));

    await expect.poll(() => groupMembers(child.pid!), { timeout: 5000 }).toEqual([]);
  });

  it('terminateProcess kills the group and waits for it', async () => {
    const child = spawnServer(process.execPath, forkingServer);

    await expect
      .poll(() => groupMembers(child.pid!).length, { timeout: 5000 })
      .toBeGreaterThanOrEqual(3);

    await terminateProcess(child);

    await expect.poll(() => groupMembers(child.pid!), { timeout: 5000 }).toEqual([]);
  });
});

describe('orphan sweep', () => {
  const root = '/repo';
  const next = `node ${root}/node_modules/next/dist/bin/next dev --port 4000`;

  it('matches orphaned repo next servers and their descendants only', () => {
    const rows = [
      { pid: 10, ppid: 1, rss: 1, command: next },
      { pid: 11, ppid: 10, rss: 1, command: 'next-server (v15.4.11)' },
      { pid: 12, ppid: 11, rss: 1, command: 'node worker.js' },
      { pid: 20, ppid: 1, rss: 1, command: 'node pnpm dev' },
      { pid: 21, ppid: 20, rss: 1, command: next },
      { pid: 30, ppid: 1, rss: 1, command: 'node /elsewhere/node_modules/next/dist/bin/next dev' },
      { pid: 40, ppid: 1, rss: 1, command: `node ${root}/test/e2e/guardian.mjs node x` },
    ];

    expect(
      findOrphans(rows, root)
        .map((row) => row.pid)
        .sort(),
    ).toEqual([10, 11, 12, 40]);
  });
});
