import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createLog } from '../../../../../packages/frogbot/src/bin/service/log.js';

describe('service log', () => {
  let dir: string;
  const now = () => new Date('2026-11-01T12:00:00.000Z');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frogbot-log-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('timestamps and tags each line, holding a partial line until its newline', () => {
    const file = join(dir, '.frogbot', 'service.log');
    const log = createLog(file, { now });
    const build = log.stream('build');

    log.write('supervisor', 'up\nready');
    build('Compil');
    build('ing\nDone\n');

    expect(readFileSync(file, 'utf8')).toBe(
      [
        '2026-11-01T12:00:00.000Z [supervisor] up',
        '2026-11-01T12:00:00.000Z [supervisor] ready',
        '2026-11-01T12:00:00.000Z [build] Compiling',
        '2026-11-01T12:00:00.000Z [build] Done',
        '',
      ].join('\n'),
    );
  });

  it('moves the log to service.log.1 once it reaches its limit', () => {
    const file = join(dir, 'service.log');
    const log = createLog(file, { now, maxBytes: 100 });

    for (let i = 0; i < 3; i++) log.write('server', 'x'.repeat(40));

    expect(existsSync(`${file}.1`)).toBe(true);
    expect(statSync(`${file}.1`).size).toBeGreaterThanOrEqual(100);
    expect(readFileSync(file, 'utf8').split('\n')).toHaveLength(2);
  });
});
