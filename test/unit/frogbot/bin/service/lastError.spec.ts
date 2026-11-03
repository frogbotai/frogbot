import { describe, expect, it } from 'vitest';

import { pickError, plainText } from '../../../../../packages/frogbot/src/bin/service/lastError.js';

const typeCheck = `   ▲ Next.js 16.4.2 (Turbopack)

   Creating an optimized production build ...
 ✓ Compiled successfully in 9.1s
   Running TypeScript ...
src/youtube/options.ts(50,14): error TS2322: Type 'number' is not assignable to type 'string'.
src/youtube/options.ts(61,3): error TS2322: Type 'number' is not assignable to type 'string'.
Failed to type check.
`;

const configThrows = `   ▲ Next.js 16.4.2 (Turbopack)
 ✓ Compiled successfully in 8.2s
   Collecting page data using 9 workers ...
Error: smoke: config blew up at boot
    at file:///apps/research-hub/src/frogbot.config.ts:14:9
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
    (6 internal frames hidden)
`;

const serverThrows = `\u001b[31m⨯\u001b[39m Error: wrapper failed
    at handler (.frogbot/builds/b/server/app/api/[...slug]/route.js:1:200)
  [cause]: TypeError: Cannot read properties of undefined (reading 'slug')
    at getRoute (.frogbot/builds/b/server/chunks/ssr/1.js:1:99)
 ELIFECYCLE  Command failed with exit code 1.
`;

describe('LAST ERROR', () => {
  it('picks the first TypeScript diagnostic over "Failed to type check."', () => {
    expect(pickError(typeCheck)).toBe(
      "src/youtube/options.ts(50,14): error TS2322: Type 'number' is not assignable to type 'string'.",
    );
  });

  it('picks the thrown error over its stack and "(N internal frames hidden)"', () => {
    expect(pickError(configThrows)).toBe('Error: smoke: config blew up at boot');
  });

  it('picks the deepest cause, without colour codes or the ELIFECYCLE line', () => {
    expect(pickError(serverThrows)).toBe(
      "TypeError: Cannot read properties of undefined (reading 'slug')",
    );
  });

  it("picks Next's own type error with its location", () => {
    expect(
      pickError(
        "./src/text.ts:1:27\nType error: Type 'number' is not assignable to type 'string'.\n",
      ),
    ).toBe("./src/text.ts:1:27: Type error: Type 'number' is not assignable to type 'string'.");
  });

  it('falls back to the last line that says something, capped at 200 characters', () => {
    expect(pickError('compiling\nmodule not found: ./gone\n    at x (y.js:1:1)\n')).toBe(
      'module not found: ./gone',
    );
    expect(pickError(`Error: ${'x'.repeat(300)}`)).toHaveLength(200);
    expect(pickError('\n\n')).toBeUndefined();
  });

  it('keeps the last frame of a spinner and drops colour codes', () => {
    expect(
      plainText(
        '\u001b[2K\u001b[1G[⣷] Pulling schema\u001b[2K\u001b[1G[✓] Pulling schema from database...\n\u001b[32mready\u001b[39m\r\n',
      ),
    ).toBe('[✓] Pulling schema from database...\nready\n');
  });
});
