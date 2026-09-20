import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageDirectory = resolve(import.meta.dirname, '../../../../packages/frogbot');
const consumerRoot = resolve(import.meta.dirname, '../../../../test/.tmp');

describe('frogbot internal exports', () => {
  let consumerDirectory: string;

  beforeAll(async () => {
    await mkdir(consumerRoot, { recursive: true });

    consumerDirectory = await mkdtemp(join(consumerRoot, 'frogbot-internal-consumer-'));

    const packDirectory = join(consumerDirectory, 'pack');
    const nodeModulesDirectory = join(consumerDirectory, 'node_modules');

    await mkdir(packDirectory);

    const { stdout } = await execFileAsync('npm', [
      'pack',
      packageDirectory,
      '--pack-destination',
      packDirectory,
    ]);
    const archive = join(packDirectory, stdout.trim().split('\n').at(-1)!);

    await execFileAsync('tar', ['-xzf', archive], { cwd: packDirectory });
    await symlink(
      join(packageDirectory, 'node_modules'),
      join(packDirectory, 'package', 'node_modules'),
      'dir',
    );
    await mkdir(nodeModulesDirectory);
    await symlink(join(packDirectory, 'package'), join(nodeModulesDirectory, 'frogbot'), 'dir');
  });

  afterAll(async () => {
    await rm(consumerDirectory, { recursive: true, force: true });
  });

  it('resolves the internal runtime from a packed consumer', async () => {
    const script = [
      "import { getPayloadConfig } from 'frogbot/internal';",
      "const payloadConfig = { marker: 'packed' };",
      'const result = await getPayloadConfig({ _internal: { payloadConfig: Promise.resolve(payloadConfig) } });',
      'console.log(JSON.stringify(result));',
    ].join('\n');

    const { stdout } = await execFileAsync(
      process.execPath,
      ['--input-type=module', '--eval', script],
      {
        cwd: consumerDirectory,
      },
    );

    expect(JSON.parse(stdout)).toEqual({ marker: 'packed' });
  });

  it('rejects a root import of the internal helper from a packed consumer', async () => {
    const script = "import { getPayloadConfig } from 'frogbot'; console.log(getPayloadConfig);";

    await expect(
      execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: consumerDirectory,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("does not provide an export named 'getPayloadConfig'"),
    });
  });

  it('packs matching runtime and declaration targets', async () => {
    const packedDirectory = join(consumerDirectory, 'node_modules', 'frogbot');
    const manifest = JSON.parse(await readFile(join(packedDirectory, 'package.json'), 'utf8'));
    const expected = {
      types: './dist/exports/internal.d.ts',
      import: './dist/exports/internal.js',
      default: './dist/exports/internal.js',
    };

    expect(manifest.exports['./internal']).toEqual(expected);
    expect(manifest.publishConfig.exports['./internal']).toEqual(expected);

    await expect(readFile(join(packedDirectory, expected.import))).resolves.toBeTruthy();
    await expect(readFile(join(packedDirectory, expected.types))).resolves.toBeTruthy();
  });

  it('propagates a rejected internal config promise through the packed entry', async () => {
    const script = [
      "import { getPayloadConfig } from 'frogbot/internal';",
      "await getPayloadConfig({ _internal: { payloadConfig: Promise.reject(new Error('config failed')) } });",
    ].join('\n');

    await expect(
      execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: consumerDirectory,
      }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining('config failed') });
  });
});
