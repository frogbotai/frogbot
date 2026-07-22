import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { generateImportMap as payloadGenerateImportMap } from 'payload';
import type { SanitizedConfig } from 'payload';

import { buildConfig } from '../config/build.js';
import type { FrogbotConfig } from '../types/config.js';
import { generateImportMap } from './index.js';
import { resolveImportMapFilePath } from './utilities/resolveImportMapFilePath.js';

const dirs: string[] = [];

async function makeDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makePayloadConfig(): Promise<SanitizedConfig> {
  const config = await buildConfig({
    secret: 'test-secret',
    db: { defaultIDType: 'number' } as never,
    collections: [
      {
        slug: 'users',
        auth: true,
        fields: [
          {
            name: 'name',
            type: 'text',
            admin: { components: { Field: './fields/NameField.tsx#NameField' } },
          } as never,
        ],
      },
    ],
    admin: {
      components: {
        Nav: './components/Nav.tsx#CustomNav',
        logout: { Button: '/components/LogoutButton.tsx' },
        providers: ['my-ui/client#ThemeProvider'],
      },
    },
  } as FrogbotConfig);

  return config._internal.payloadConfig;
}

describe('frogbot importMap generator', () => {
  it("output matches Payload's generator for the same config, modulo header", async () => {
    const dir = await makeDir('frogbot-importmap-golden-');
    await mkdir(join(dir, 'a'));
    await mkdir(join(dir, 'b'));

    const payloadConfig = await makePayloadConfig();
    payloadConfig.admin.importMap.baseDir = dir;

    payloadConfig.admin.importMap.importMapFile = join(dir, 'a', 'importMap.js');
    await payloadGenerateImportMap(payloadConfig, { log: false });

    payloadConfig.admin.importMap.importMapFile = join(dir, 'b', 'importMap.js');
    const result = await generateImportMap(payloadConfig);

    const theirs = await readFile(join(dir, 'a', 'importMap.js'), 'utf-8');
    const ours = await readFile(join(dir, 'b', 'importMap.js'), 'utf-8');

    expect(result).toEqual({ changed: true, outputPath: join(dir, 'b', 'importMap.js') });
    expect(theirs).toContain("/** @type import('payload').ImportMap */");
    expect(ours).toBe(theirs.replace("import('payload')", "import('frogbot')"));
  });

  it('emits no Payload references for a minimal frogbot config', async () => {
    const dir = await makeDir('frogbot-importmap-branding-');
    const payloadConfig = await makePayloadConfig();
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);
    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toContain("from '@frogbotai/next/rsc'");
    expect(output).toContain('"@frogbotai/next/rsc#CollectionCards"');
    expect(output).toContain("from './fields/NameField.tsx'");
    expect(output).toContain("from 'my-ui/client'");
    expect(output).not.toContain('@payloadcms');
    expect(output).not.toContain("import('payload')");
  });

  it('skips the write when output matches the existing file, and force overrides', async () => {
    const dir = await makeDir('frogbot-importmap-skip-');
    const payloadConfig = await makePayloadConfig();
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    const first = await generateImportMap(payloadConfig);
    const second = await generateImportMap(payloadConfig);
    const forced = await generateImportMap(payloadConfig, { force: true });

    expect(first?.changed).toBe(true);
    expect(second?.changed).toBe(false);
    expect(forced?.changed).toBe(true);
  });

  it('returns null with ignoreResolveError when no app dir exists', async () => {
    const dir = await makeDir('frogbot-importmap-noresolve-');
    const payloadConfig = await makePayloadConfig();
    payloadConfig.admin.importMap.importMapFile = undefined;

    const original = process.env.ROOT_DIR;
    process.env.ROOT_DIR = dir;
    try {
      await expect(generateImportMap(payloadConfig, { ignoreResolveError: true })).resolves.toBeNull();
      await expect(generateImportMap(payloadConfig)).rejects.toThrowError('Could not find the import map folder');
    } finally {
      if (original === undefined) {
        delete process.env.ROOT_DIR;
      } else {
        process.env.ROOT_DIR = original;
      }
    }
  });
});

describe('resolveImportMapFilePath', () => {
  it('resolves app/(frogbot)<adminRoute> and creates importMap.js', async () => {
    const root = await makeDir('frogbot-resolve-app-');
    await mkdir(join(root, 'app', '(frogbot)', 'admin'), { recursive: true });

    const result = await resolveImportMapFilePath({ adminRoute: '/admin', rootDir: root });

    expect(result).toBe(join(root, 'app', '(frogbot)', 'admin', 'importMap.js'));
    await expect(stat(result as string)).resolves.toBeTruthy();
  });

  it('falls back to src/app/(frogbot)<adminRoute>', async () => {
    const root = await makeDir('frogbot-resolve-src-');
    await mkdir(join(root, 'src', 'app', '(frogbot)', 'admin'), { recursive: true });

    const result = await resolveImportMapFilePath({ adminRoute: '/admin', rootDir: root });

    expect(result).toBe(join(root, 'src', 'app', '(frogbot)', 'admin', 'importMap.js'));
  });

  it('honors an explicit importMapFile and creates it when missing', async () => {
    const root = await makeDir('frogbot-resolve-explicit-');
    const importMapFile = join(root, 'importMap.js');

    const result = await resolveImportMapFilePath({ importMapFile, rootDir: root });

    expect(result).toBe(importMapFile);
    await expect(stat(importMapFile)).resolves.toBeTruthy();
  });

  it('returns an Error mentioning both candidate locations when nothing resolves', async () => {
    const root = await makeDir('frogbot-resolve-missing-');

    const result = await resolveImportMapFilePath({ adminRoute: '/admin', rootDir: root });

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain(join(root, 'app', '(frogbot)', 'admin'));
    expect((result as Error).message).toContain(join(root, 'src', 'app', '(frogbot)', 'admin'));
    expect((result as Error).message).not.toContain('Payload');
  });
});
