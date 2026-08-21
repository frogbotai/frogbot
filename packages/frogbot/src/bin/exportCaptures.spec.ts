import { describe, expect, it } from 'vitest';

import { parseExportCapturesArgs } from './exportCapturesArgs.js';
import { writeCaptureLine } from './exportCapturesStream.js';

describe('frogbot export:captures', () => {
  it('parses capture filters', () => {
    expect(
      parseExportCapturesArgs([
        '--user=user-1',
        '--api-key',
        'key-1',
        '--from',
        '2026-08-01',
        '--to',
        '2026-08-20',
        '--operation',
        'responses',
        '--output',
        'captures.jsonl',
      ]),
    ).toEqual({
      user: 'user-1',
      apiKey: 'key-1',
      from: '2026-08-01',
      to: '2026-08-20',
      operation: 'responses',
      output: 'captures.jsonl',
    });
  });

  it('rejects invalid options and dates', () => {
    expect(() => parseExportCapturesArgs(['--wat', 'x'])).toThrow('unknown option');
    expect(() => parseExportCapturesArgs(['--from', 'never'])).toThrow('valid date');
  });

  it('waits for output completion before continuing', async () => {
    let callback: ((error?: Error | null) => void) | undefined;
    const output = {
      write: (_value: string, done: (error?: Error | null) => void) => {
        callback = done;
        return false;
      },
    };
    let complete = false;
    const writing = writeCaptureLine(output, '{"captureId":"capture-1"}').then(() => {
      complete = true;
    });
    await Promise.resolve();
    expect(complete).toBe(false);
    callback?.();
    await writing;
    expect(complete).toBe(true);
  });

  it('propagates output errors', async () => {
    const failure = new Error('disk full');
    const output = {
      write: (_value: string, done: (error?: Error | null) => void) => {
        done(failure);
        return false;
      },
    };
    await expect(writeCaptureLine(output, '{}')).rejects.toBe(failure);
  });
});
