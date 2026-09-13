import type * as FileSystemPromises from 'node:fs/promises';
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  actualWriteFile: undefined as typeof FileSystemPromises.writeFile | undefined,
  writeFile: vi.fn<typeof FileSystemPromises.writeFile>(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystemPromises>();

  fsMocks.actualWriteFile = actual.writeFile;
  fsMocks.writeFile.mockImplementation(actual.writeFile);

  return { ...actual, writeFile: fsMocks.writeFile };
});

import { piecesPort } from '../../../../packages/frogbot/src/bin/piecesPort.js';

const roots: string[] = [];

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function workspace(installed = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'frogbot-pieces-port-'));

  roots.push(root);

  const piece = join(root, 'packages/pieces/piece-demo');

  await mkdir(join(piece, 'src'), { recursive: true });
  await mkdir(join(root, 'test/unit'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"version":"1.2.3"}\n');
  await writeFile(join(root, 'packages/pieces/PORTING.md'), '# Porting\n');
  await writeFile(
    join(piece, 'package.json'),
    '{"name":"@frogbotai/piece-demo","dependencies":{"@activepieces/piece-demo":"1.0.0"}}\n',
  );
  await writeFile(join(piece, 'src/index.ts'), 'export {};\n');

  if (installed) {
    const upstream = join(piece, 'node_modules/@activepieces/piece-demo');

    await mkdir(join(upstream, 'dist'), { recursive: true });
    await writeFile(
      join(upstream, 'package.json'),
      '{"name":"@activepieces/piece-demo","main":"dist/index.js"}\n',
    );
    await writeFile(join(upstream, 'dist/index.js'), 'export {};\n');
  }

  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();

  fsMocks.writeFile.mockReset();
  fsMocks.writeFile.mockImplementation(fsMocks.actualWriteFile!);

  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('piecesPort', () => {
  it('rejects invalid slugs', async () => {
    await expect(piecesPort(['../demo'], '/unused')).rejects.toThrow(
      'usage: frogbot pieces:port <slug>',
    );
  });

  it('fails before moving or writing when upstream source is missing', async () => {
    const root = await workspace(false);

    await expect(piecesPort(['demo'], root)).rejects.toThrow('Upstream source is not installed');

    expect(await exists(join(root, 'packages/pieces/piece-demo/src/index.ts'))).toBe(true);
    expect(await exists(join(root, 'packages/pieces/piece-demo.legacy'))).toBe(false);
    expect(await exists(join(root, 'test/unit/piece-demo'))).toBe(false);
  });

  it('refuses an existing legacy package without changing the current package', async () => {
    const root = await workspace();
    await mkdir(join(root, 'packages/pieces/piece-demo.legacy'));

    await expect(piecesPort(['demo'], root)).rejects.toThrow('Legacy package already exists');

    expect(await readFile(join(root, 'packages/pieces/piece-demo/src/index.ts'), 'utf8')).toBe(
      'export {};\n',
    );
    expect(await exists(join(root, 'test/unit/piece-demo'))).toBe(false);
  });

  it('refuses an existing legacy test directory before changing either directory', async () => {
    const root = await workspace();
    const test = join(root, 'test/unit/piece-demo');
    const legacyTest = `${test}.legacy`;

    await mkdir(test);
    await mkdir(legacyTest);
    await writeFile(join(test, 'current.spec.ts'), 'current\n');
    await writeFile(join(legacyTest, 'legacy.spec.ts'), 'legacy\n');

    await expect(piecesPort(['demo'], root)).rejects.toThrow(
      'Legacy test directory already exists',
    );

    expect(await readFile(join(root, 'packages/pieces/piece-demo/src/index.ts'), 'utf8')).toBe(
      'export {};\n',
    );
    expect(await readFile(join(test, 'current.spec.ts'), 'utf8')).toBe('current\n');
    expect(await readFile(join(legacyTest, 'legacy.spec.ts'), 'utf8')).toBe('legacy\n');
    expect(await exists(join(root, 'packages/pieces/piece-demo.legacy'))).toBe(false);
  });

  it('preserves the legacy package and tests while creating the native scaffold', async () => {
    const root = await workspace();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const test = join(root, 'test/unit/piece-demo');

    await mkdir(test);
    await writeFile(join(test, 'legacy.spec.ts'), 'legacy\n');

    await piecesPort(['demo'], root);

    const legacy = join(root, 'packages/pieces/piece-demo.legacy');
    const current = join(root, 'packages/pieces/piece-demo');

    expect(await exists(join(legacy, 'src/index.ts'))).toBe(true);
    expect(await exists(join(current, 'package.json'))).toBe(true);
    expect(await exists(join(current, 'tsconfig.json'))).toBe(true);
    expect(await exists(join(current, 'src/index.ts'))).toBe(true);
    expect(await exists(join(current, 'README.md'))).toBe(true);
    expect(await exists(join(root, 'test/unit/piece-demo/index.spec.ts'))).toBe(true);
    expect(await readFile(join(root, 'test/unit/piece-demo.legacy/legacy.spec.ts'), 'utf8')).toBe(
      'legacy\n',
    );
    expect(JSON.parse(await readFile(join(current, 'package.json'), 'utf8'))).toMatchObject({
      name: '@frogbotai/piece-demo',
      version: '1.2.3',
    });
    expect(log).toHaveBeenCalledWith(
      '[frogbot] Test: pnpm vitest run --project unit test/unit/piece-demo',
    );
    expect(log).toHaveBeenCalledWith('[frogbot] Prepared piece-demo; not verified.');
    expect(log).toHaveBeenCalledWith('[frogbot] Legacy test: test/unit/piece-demo.legacy');

    const workspacePackages = (await readdir(join(root, 'packages/pieces'))).filter(
      (name) => name.startsWith('piece-') && !name.endsWith('.legacy'),
    );
    const names = await Promise.all(
      workspacePackages.map(async (directory) =>
        JSON.parse(
          await readFile(join(root, 'packages/pieces', directory, 'package.json'), 'utf8'),
        ),
      ),
    );

    expect(new Set(names.map(({ name }) => name)).size).toBe(names.length);
  });

  it('restores the package and tests when scaffold writing fails', async () => {
    const root = await workspace();
    const piece = join(root, 'packages/pieces/piece-demo');
    const test = join(root, 'test/unit/piece-demo');

    await mkdir(test);
    await writeFile(join(test, 'legacy.spec.ts'), 'legacy\n');

    fsMocks.writeFile.mockImplementation(async (path, ...args) => {
      if (path === join(piece, 'README.md')) throw new Error('injected write failure');

      return fsMocks.actualWriteFile!(path, ...args);
    });

    await expect(piecesPort(['demo'], root)).rejects.toThrow('injected write failure');

    expect(await readFile(join(piece, 'src/index.ts'), 'utf8')).toBe('export {};\n');
    expect(await readFile(join(test, 'legacy.spec.ts'), 'utf8')).toBe('legacy\n');
    expect(await exists(`${piece}.legacy`)).toBe(false);
    expect(await exists(`${test}.legacy`)).toBe(false);
    expect(await exists(join(piece, 'README.md'))).toBe(false);
    expect(await exists(join(test, 'index.spec.ts'))).toBe(false);
  });
});
