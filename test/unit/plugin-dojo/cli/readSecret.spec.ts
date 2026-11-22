import { PassThrough } from 'node:stream';

import type * as Clack from '@clack/prompts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const password = vi.hoisted(() => vi.fn());

vi.mock('@clack/prompts', async (original) => ({
  ...(await original<typeof Clack>()),
  password,
}));

const { processIO } = await import('../../../../packages/plugins/plugin-dojo/src/cli/io.js');

const ttys = { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY };
const stdin = Object.getOwnPropertyDescriptor(process, 'stdin');

function setTTY(stream: 'stdin' | 'stdout', value: boolean): void {
  Object.defineProperty(process[stream], 'isTTY', { value, configurable: true });
}

afterEach(() => {
  if (stdin) Object.defineProperty(process, 'stdin', stdin);
  setTTY('stdin', ttys.stdin);
  setTTY('stdout', ttys.stdout);
  password.mockReset();
});

describe('readSecret', () => {
  it('draws the hidden prompt on stderr, so a redirected stdout gets only the result', async () => {
    setTTY('stdin', true);
    setTTY('stdout', false);
    password.mockResolvedValue('glpat-secret');

    const secret = await processIO('frogbot').readSecret?.('gitlab access token:');

    expect(secret).toBe('glpat-secret');
    expect(password).toHaveBeenCalledWith({
      message: 'gitlab access token:',
      output: process.stderr,
    });
  });

  it('reads piped stdin whole without prompting', async () => {
    const piped = new PassThrough();

    Object.defineProperty(process, 'stdin', { value: piped, configurable: true });

    const reading = processIO('frogbot').readSecret?.('gitlab access token:');

    piped.end('glpat-piped\n');

    expect(await reading).toBe('glpat-piped\n');
    expect(password).not.toHaveBeenCalled();
  });
});
