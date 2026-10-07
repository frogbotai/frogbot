import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { acquireSlot, LAND_LOCK, SLOT_DIR, SLOTS } from '../../../scripts/lib/slot.mjs';

const slotScript = fileURLToPath(new URL('../../../scripts/lib/slot.mjs', import.meta.url));

let dir: string;
let holder: ReturnType<typeof spawn>;

const slot = (index: number) => path.join(dir, `slot-${index}`);

const hold = (index: number, pid: number, label = `int · worktree-${index}`) =>
  writeFileSync(slot(index), `${pid} ${label}`);

const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'frogbot-slots-'));
  holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
});

afterEach(() => {
  holder.kill();
  rmSync(dir, { recursive: true, force: true });
});

describe('acquireSlot', () => {
  it('takes a free slot, writing its pid and label, and frees it on release', async () => {
    hold(0, holder.pid!);

    const release = await acquireSlot('int', { dir });

    expect(readFileSync(slot(1), 'utf8')).toBe(
      `${process.pid} int · ${path.basename(process.cwd())}`,
    );

    release();

    expect(existsSync(slot(1))).toBe(false);
    expect(existsSync(slot(0))).toBe(true);
  });

  it('takes one slot per process', async () => {
    const release = await acquireSlot('int', { dir });
    const again = await acquireSlot('e2e', { dir });

    expect(existsSync(slot(1))).toBe(false);

    again();

    expect(existsSync(slot(0))).toBe(true);

    release();
  });

  it('waits while every slot is live, then takes the first one freed', async () => {
    for (const index of [0, 1, 2]) hold(index, holder.pid!);

    const logged: string[] = [];
    const acquired = acquireSlot('int', { dir, interval: 10, log: (line) => logged.push(line) });

    await vi.waitFor(() => expect(logged).toHaveLength(1));

    expect(logged).toEqual([
      'waiting for a heavy-test slot (held by: int · worktree-0, int · worktree-1, int · worktree-2)',
    ]);

    rmSync(slot(1));
    const release = await acquired;

    expect(readFileSync(slot(1), 'utf8')).toMatch(new RegExp(`^${process.pid} `));

    release();
  });

  it('reclaims a slot whose owner is dead', async () => {
    hold(0, holder.pid!);
    hold(1, holder.pid!);
    hold(2, deadPid());

    const release = await acquireSlot('int', { dir, interval: 10, log: () => {} });

    expect(readFileSync(slot(2), 'utf8')).toMatch(new RegExp(`^${process.pid} `));

    release();
  });

  it('frees the slot when the process exits', () => {
    const script = `const { acquireSlot } = await import(${JSON.stringify(slotScript)});
      await acquireSlot('int', { dir: ${JSON.stringify(dir)} });
      console.log((await import('node:fs')).existsSync(${JSON.stringify(slot(0))}));`;

    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });

    expect(child.stdout.trim()).toBe('true');
    expect(existsSync(slot(0))).toBe(false);
  });
});

describe('LAND_LOCK', () => {
  it('is one slot in its own directory, beside the three heavy slots', () => {
    expect(SLOTS).toBe(3);
    expect(LAND_LOCK.slots).toBe(1);
    expect(LAND_LOCK.dir).not.toBe(SLOT_DIR);
  });

  it('lets one land through at a time, naming the holder to the next', async () => {
    const lock = { ...LAND_LOCK, dir };
    const first = await acquireSlot('land 256p', { ...lock, pid: holder.pid! });
    const logged: string[] = [];
    let second: (() => void) | undefined;
    const waiting = acquireSlot('land 256q', {
      ...lock,
      interval: 10,
      log: (line) => logged.push(line),
    }).then((release) => (second = release));

    await vi.waitFor(() => expect(logged).toHaveLength(1));

    expect(logged[0]).toMatch(/^waiting for the land lock \(held by: land 256p · /);
    expect(second).toBeUndefined();

    first();
    await waiting;

    expect(readFileSync(slot(0), 'utf8')).toMatch(new RegExp(`^${process.pid} land 256q`));

    second!();
  });
});
