import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it, onTestFinished } from 'vitest';

const execFileAsync = promisify(execFile);
const binURL = pathToFileURL(
  new URL('../../../../packages/frogbot/src/bin/index.ts', import.meta.url).pathname,
).href;
const tsxLoader = createRequire(import.meta.url).resolve('tsx/esm');

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'frogbot-generate-types-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return dir;
}

function runGenerateTypes(cwd: string): Promise<{ stdout: string; stderr: string }> {
  const script = `process.argv = ['node', 'frogbot', 'generate:types']; const { bin } = await import(${JSON.stringify(binURL)}); await bin();`;

  return execFileAsync(
    process.execPath,
    ['--import', tsxLoader, '--input-type=module', '--eval', script],
    { cwd },
  );
}

describe('frogbot generate:types', () => {
  it('prints the config error and where it was thrown when the config throws at import', async () => {
    const dir = await makeDir();

    await writeFile(
      join(dir, 'frogbot.config.ts'),
      "import './service.ts';\n\nexport default {};\n",
    );
    await writeFile(join(dir, 'service.ts'), "throw new Error('boom-from-config');\n");

    const result = runGenerateTypes(dir);

    await expect(result).rejects.toMatchObject({
      code: 1,
      stdout: '',
      stderr: expect.stringMatching(
        /^\[frogbot\] failed to load .*frogbot\.config\.ts\n {2}Caused by: Error: boom-from-config\n[\s\S]*service\.ts:\d+/,
      ),
    });
    await expect(result).rejects.toMatchObject({
      stderr: expect.not.stringContaining('node:internal'),
    });
  });

  it('prints the file, line, and esbuild error for a config syntax error', async () => {
    const dir = await makeDir();

    await writeFile(join(dir, 'frogbot.config.ts'), 'export default {\n');

    const result = runGenerateTypes(dir);

    await expect(result).rejects.toMatchObject({
      code: 1,
      stdout: '',
      stderr: expect.stringMatching(
        /^\[frogbot\] failed to load [\s\S]*\n {2}Caused by: Error: Transform failed[\s\S]*frogbot\.config\.ts:\d+:\d+: ERROR:/,
      ),
    });
  });
});
