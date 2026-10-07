import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { formatCliError } from '../../../../packages/frogbot/src/bin/formatCliError.js';

describe('formatCliError', () => {
  it('adds the `[frogbot]` prefix to an unprefixed message', () => {
    expect(formatCliError(new Error('boom'))).toBe('[frogbot] boom');
  });

  it('keeps a single prefix when the message already has one', () => {
    expect(formatCliError(new Error('[frogbot] `secret` is required and must be a string.'))).toBe(
      '[frogbot] `secret` is required and must be a string.',
    );
  });

  it('places context between the prefix and an unprefixed message', () => {
    expect(formatCliError(new Error('boom'), 'migrate:status failed')).toBe(
      '[frogbot] migrate:status failed: boom',
    );
  });

  it('drops the inner prefix when context is added to a prefixed message', () => {
    expect(
      formatCliError(new Error("[frogbot] Unknown admin icon 'hmoe'."), 'migrate failed'),
    ).toBe("[frogbot] migrate failed: Unknown admin icon 'hmoe'.");
  });

  it('formats non-Error values', () => {
    expect(formatCliError('[frogbot] stale')).toBe('[frogbot] stale');
  });
});

function withStack(message: string, stack: string | undefined): Error {
  const error = new Error(message);

  error.stack = stack;

  return error;
}

describe('formatCliError cause chain', () => {
  it('appends a Caused by block for an Error cause', () => {
    const error = new Error('[frogbot] failed to load x', {
      cause: new Error('Must set TYPE'),
    });

    const result = formatCliError(error);

    expect(result.startsWith('[frogbot] failed to load x\n  Caused by: Error: Must set TYPE')).toBe(
      true,
    );
  });

  it('indents continuation lines of a cause stack under Caused by', () => {
    const cause = withStack(
      'Must set TYPE',
      'Error: Must set TYPE\n    at new ConfigService (/app/src/config.service.ts:97:15)\n    at <anonymous> (/app/src/config.service.ts:141:30)',
    );

    const result = formatCliError(new Error('failed to load x', { cause }));

    expect(result).toBe(
      [
        '[frogbot] failed to load x',
        '  Caused by: Error: Must set TYPE',
        '      at new ConfigService (/app/src/config.service.ts:97:15)',
        '      at <anonymous> (/app/src/config.service.ts:141:30)',
      ].join('\n'),
    );
  });

  it('prints a two-level chain outermost first', () => {
    const root = withStack('root', 'Error: root');
    const middle = withStack('middle', 'Error: middle');

    middle.cause = root;

    const result = formatCliError(new Error('outer', { cause: middle }));

    expect(result).toBe(
      ['[frogbot] outer', '  Caused by: Error: middle', '  Caused by: Error: root'].join('\n'),
    );
  });

  it('keeps the command context on the first line when a cause is present', () => {
    const error = new Error('Failed query', { cause: withStack('no table', 'Error: no table') });

    const result = formatCliError(error, 'migrate:status failed');

    expect(result).toBe(
      '[frogbot] migrate:status failed: Failed query\n  Caused by: Error: no table',
    );
  });

  it('prints a string cause as its value', () => {
    const result = formatCliError(new Error('outer', { cause: 'database timed out' }));

    expect(result).toBe('[frogbot] outer\n  Caused by: database timed out');
  });

  it('prints a number cause as its value', () => {
    const result = formatCliError(new Error('outer', { cause: 42 }));

    expect(result).toBe('[frogbot] outer\n  Caused by: 42');
  });

  it('prints a null cause as its value', () => {
    const result = formatCliError(new Error('outer', { cause: null }));

    expect(result).toBe('[frogbot] outer\n  Caused by: null');
  });

  it('prints an object cause as its contents', () => {
    const result = formatCliError(new Error('outer', { cause: { code: 'ECONNREFUSED' } }));

    expect(result).toContain("code: 'ECONNREFUSED'");
    expect(result).not.toContain('[object Object]');
  });

  it('uses name and message when a cause has no stack', () => {
    const cause = withStack('no stack here', undefined);

    cause.name = 'TypeError';

    const result = formatCliError(new Error('outer', { cause }));

    expect(result).toBe('[frogbot] outer\n  Caused by: TypeError: no stack here');
  });

  it('stops after five causes and says more are not shown', () => {
    const chain = Array.from({ length: 7 }, (_, index) =>
      withStack(`e${index}`, `Error: e${index}`),
    );

    chain.forEach((error, index) => {
      error.cause = chain[index + 1];
    });

    const result = formatCliError(new Error('outer', { cause: chain[0] }));

    expect(result).toBe(
      [
        '[frogbot] outer',
        '  Caused by: Error: e0',
        '  Caused by: Error: e1',
        '  Caused by: Error: e2',
        '  Caused by: Error: e3',
        '  Caused by: Error: e4',
        '  … more causes not shown',
      ].join('\n'),
    );
  });

  it('stops a circular chain', () => {
    const a = withStack('a', 'Error: a');
    const b = withStack('b', 'Error: b');

    a.cause = b;
    b.cause = a;

    const result = formatCliError(a);

    expect(result).toBe(
      ['[frogbot] a', '  Caused by: Error: b', '  … more causes not shown'].join('\n'),
    );
  });

  it('stops an error that is its own cause', () => {
    const a = withStack('a', 'Error: a');

    a.cause = a;

    const result = formatCliError(a);

    expect(result).toBe('[frogbot] a\n  … more causes not shown');
  });

  it('treats an error from another realm as an Error', () => {
    const cause: unknown = runInNewContext('new Error("x")');

    const result = formatCliError(new Error('outer', { cause }));

    expect(result.startsWith('[frogbot] outer\n  Caused by: Error: x')).toBe(true);
  });

  it('prints nothing extra when cause is present but undefined', () => {
    expect(formatCliError(new Error('m', { cause: undefined }))).toBe('[frogbot] m');
  });
});

describe('formatCliError frame trimming', () => {
  it('hides node: and node_modules frames and counts them', () => {
    const cause = withStack(
      'boom',
      [
        'Error: boom',
        '    at new ConfigService (/app/src/config.service.ts:97:15)',
        '    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)',
        '    at <anonymous> (/app/src/config.service.ts:141:30)',
        '    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:665:26)',
        '    at node:internal/main/run_main_module:33:47',
        '    at load (file:///app/node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/esm/index.mjs:2:1)',
        '    at async tsImport (/app/node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/esm/api/index.mjs:1:1)',
      ].join('\n'),
    );

    const result = formatCliError(new Error('failed to load x', { cause }));

    expect(result).toBe(
      [
        '[frogbot] failed to load x',
        '  Caused by: Error: boom',
        '      at new ConfigService (/app/src/config.service.ts:97:15)',
        '      at <anonymous> (/app/src/config.service.ts:141:30)',
        '      (5 internal frames hidden)',
      ].join('\n'),
    );
  });

  it('hides Windows node_modules frames', () => {
    const cause = withStack(
      'boom',
      'Error: boom\n    at C:\\app\\src\\service.ts:1:7\n    at failureErrorWithLog (C:\\app\\node_modules\\esbuild\\lib\\main.js:1:1)',
    );

    const result = formatCliError(new Error('outer', { cause }));

    expect(result).toBe(
      [
        '[frogbot] outer',
        '  Caused by: Error: boom',
        '      at C:\\app\\src\\service.ts:1:7',
        '      (1 internal frame hidden)',
      ].join('\n'),
    );
  });

  it('keeps frames without a file location', () => {
    const cause = withStack(
      'boom',
      'Error: boom\n    at <anonymous>\n    at new Promise (<anonymous>)',
    );

    const result = formatCliError(new Error('outer', { cause }));

    expect(result).toBe(
      [
        '[frogbot] outer',
        '  Caused by: Error: boom',
        '      at <anonymous>',
        '      at new Promise (<anonymous>)',
      ].join('\n'),
    );
  });

  it('keeps every line of a multi-line message', () => {
    const cause = withStack(
      'Transform failed',
      [
        'Error: Transform failed with 1 error:',
        '/app/frogbot.config.ts:1:16: ERROR: Unexpected end of file',
        '    at failureErrorWithLog (/app/node_modules/esbuild/lib/main.js:1467:15)',
        '    at /app/node_modules/esbuild/lib/main.js:736:50',
      ].join('\n'),
    );

    const result = formatCliError(new Error('failed to load x', { cause }));

    expect(result).toBe(
      [
        '[frogbot] failed to load x',
        '  Caused by: Error: Transform failed with 1 error:',
        '      /app/frogbot.config.ts:1:16: ERROR: Unexpected end of file',
        '      (2 internal frames hidden)',
      ].join('\n'),
    );
  });

  it('keeps a user path that only contains node_modules as part of a name', () => {
    const cause = withStack('boom', 'Error: boom\n    at run (/app/my_node_modules_tool/x.ts:3:9)');

    const result = formatCliError(new Error('outer', { cause }));

    expect(result).toContain('      at run (/app/my_node_modules_tool/x.ts:3:9)');
    expect(result).not.toContain('hidden');
  });

  it('omits the hidden-frames line when nothing was hidden', () => {
    const cause = withStack('boom', 'Error: boom\n    at run (/app/src/x.ts:3:9)');

    const result = formatCliError(new Error('outer', { cause }));

    expect(result).toBe(
      '[frogbot] outer\n  Caused by: Error: boom\n      at run (/app/src/x.ts:3:9)',
    );
  });

  it('uses the singular for one hidden frame', () => {
    const cause = withStack(
      'boom',
      'Error: boom\n    at run (/app/src/x.ts:3:9)\n    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)',
    );

    const result = formatCliError(new Error('outer', { cause }));

    expect(result).toBe(
      [
        '[frogbot] outer',
        '  Caused by: Error: boom',
        '      at run (/app/src/x.ts:3:9)',
        '      (1 internal frame hidden)',
      ].join('\n'),
    );
  });
});

function throwingGetter(target: object, key: string): void {
  Object.defineProperty(target, key, {
    get() {
      throw new Error(`${key} getter failed`);
    },
  });
}

describe('formatCliError unusual causes', () => {
  it('prints a cause whose stack getter throws', () => {
    const cause = new Error('bad stack');

    throwingGetter(cause, 'stack');

    const result = formatCliError(new Error('outer', { cause }));

    expect(result).toMatch(/^\[frogbot\] outer\n {2}Caused by: .*bad stack/);
  });

  it('prints a cause without a stack whose message getter throws', () => {
    const cause = withStack('ignored', undefined);

    throwingGetter(cause, 'message');

    const result = formatCliError(new Error('outer', { cause }));

    expect(result.startsWith('[frogbot] outer\n  Caused by: ')).toBe(true);
  });

  it('stops the chain at a cause whose cause getter throws', () => {
    const cause = withStack('middle', 'Error: middle');

    throwingGetter(cause, 'cause');

    const result = formatCliError(new Error('outer', { cause }));

    expect(result).toBe('[frogbot] outer\n  Caused by: Error: middle');
  });

  it('prints only the first line when the top error cause getter throws', () => {
    const error = new Error('top');

    throwingGetter(error, 'cause');

    expect(formatCliError(error, 'migrate failed')).toBe('[frogbot] migrate failed: top');
  });

  it('prints a Proxy cause whose traps throw', () => {
    const fail = (): never => {
      throw new Error('trap failed');
    };

    const cause = new Proxy({}, { get: fail, getPrototypeOf: fail, ownKeys: fail });

    const result = formatCliError(new Error('outer', { cause }));

    expect(result.startsWith('[frogbot] outer\n  Caused by: ')).toBe(true);
  });

  it('prints a Proxy around an Error whose get trap throws', () => {
    const cause = new Proxy(withStack('wrapped', 'Error: wrapped'), {
      get() {
        throw new Error('trap failed');
      },
    });

    const result = formatCliError(new Error('outer', { cause }));

    expect(result).toMatch(/^\[frogbot\] outer\n {2}Caused by: .*wrapped/);
  });

  it('prints a revoked Proxy cause', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});

    revoke();

    const result = formatCliError(new Error('outer', { cause: proxy }));

    expect(result.startsWith('[frogbot] outer\n  Caused by: ')).toBe(true);
  });

  it('prints an AggregateError cause by its name and message', () => {
    const cause = new AggregateError(
      [new Error('a1'), new Error('a2')],
      'All promises were rejected',
    );

    const result = formatCliError(new Error('outer', { cause }));

    expect(
      result.startsWith('[frogbot] outer\n  Caused by: AggregateError: All promises were rejected'),
    ).toBe(true);
  });

  it('keeps a user frame in a folder whose name contains node:', () => {
    const cause = withStack(
      'boom',
      'Error: boom\n    at run (/app/node:x/src/a.ts:1:1)\n    at /app/node:x/b.ts:2:2',
    );

    const result = formatCliError(new Error('outer', { cause }));

    expect(result).toBe(
      [
        '[frogbot] outer',
        '  Caused by: Error: boom',
        '      at run (/app/node:x/src/a.ts:1:1)',
        '      at /app/node:x/b.ts:2:2',
      ].join('\n'),
    );
  });

  it('keeps a user frame given as a file URL', () => {
    const cause = withStack('boom', 'Error: boom\n    at run (file:///app/src/a.ts:1:1)');

    const result = formatCliError(new Error('outer', { cause }));

    expect(result).toBe(
      '[frogbot] outer\n  Caused by: Error: boom\n      at run (file:///app/src/a.ts:1:1)',
    );
  });
});
