import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const binURL = pathToFileURL(
  new URL('./index.ts', import.meta.url).pathname,
).href;
const tsxLoader = createRequire(import.meta.url).resolve('tsx/esm');

describe('frogbot generate:importmap', () => {
  it.todo('loads config from cwd via loadConfig');
  it.todo('generates the import map from the sanitized payload config');
  it.todo(
    'logs `[frogbot] import map written to <path>` when the file changed',
  );
  it.todo('logs `[frogbot] import map unchanged at <path>` when identical');
  it.todo('exits non-zero on any failure with a `[frogbot]` prefixed message');

  it('loads production env files before importing the config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'frogbot-importmap-env-'));

    await writeFile(join(dir, '.env'), 'FROGBOT_TEST_KEY=base\n');
    await writeFile(join(dir, '.env.local'), 'FROGBOT_TEST_KEY=local\n');
    await writeFile(
      join(dir, '.env.production'),
      'FROGBOT_TEST_KEY=production\n',
    );
    await writeFile(
      join(dir, '.env.production.local'),
      'FROGBOT_TEST_KEY=production-local\n',
    );
    await writeFile(
      join(dir, 'frogbot.config.mjs'),
      "import { writeFileSync } from 'node:fs'; writeFileSync('observed-env', process.env.FROGBOT_TEST_KEY ?? ''); export default {};\n",
    );

    try {
      const script = `process.argv = ['node', 'frogbot', 'generate:importmap']; const { bin } = await import(${JSON.stringify(binURL)}); await bin();`;
      const result = execFileAsync(
        process.execPath,
        ['--import', tsxLoader, '--input-type=module', '--eval', script],
        {
          cwd: dir,
          env: {
            ...process.env,
            FROGBOT_TEST_KEY: undefined,
            NODE_ENV: 'production',
            __NEXT_PROCESSED_ENV: undefined,
          },
        },
      );

      await expect(result).rejects.toBeDefined();
      await expect(readFile(join(dir, 'observed-env'), 'utf8')).resolves.toBe(
        'production-local',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
