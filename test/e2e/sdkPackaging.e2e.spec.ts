import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { generateDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';
import {
  applyLocalOverrides,
  type LocalPackage,
  packLocalClosure,
  run,
  runSetup,
} from './create-frogbot-app/harness';

const RUN_E2E = process.env.RUN_E2E === '1';
const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const fixtures = path.join(import.meta.dirname, 'fixtures');
const serverPackages = ['frogbot', 'payload', '@payloadcms', 'drizzle-orm', 'next'];
const serverImport =
  /(?:from|import)\s*\(?\s*["'](?:frogbot|payload|@payloadcms\/[^"']+|@frogbotai\/ui)(?:\/[^"']*)?["']/;

type TypeScriptError = { file: string; line: string };

function typeScriptErrors(output: string): TypeScriptError[] {
  return output
    .split('\n')
    .filter((line) => /^\S.*\(\d+,\d+\): error TS\d+/.test(line))
    .map((line) => ({ file: line.slice(0, line.indexOf('(')), line }));
}

function isProjectFile(file: string): boolean {
  return (
    file.startsWith('src/') ||
    file.startsWith('types/') ||
    file.includes('@frogbotai/sdk/') ||
    file.includes('@frogbotai+sdk')
  );
}

describe.skipIf(!RUN_E2E)('@frogbotai/sdk packaging', () => {
  let root: string;
  let frontend: string;
  let sdkOnly: string;
  let localPackages: LocalPackage[];

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'frogbot-sdk-packaging-'));
    frontend = path.join(root, 'sdk-frontend');
    sdkOnly = path.join(root, 'sdk-only');

    fs.cpSync(path.join(fixtures, 'sdk-frontend'), frontend, { recursive: true });
    fs.cpSync(path.join(fixtures, 'sdk-only'), sdkOnly, { recursive: true });

    fs.copyFileSync(
      path.join(repoRoot, 'test', 'sdk', 'frogbot-types.ts'),
      path.join(frontend, 'types', 'frogbot-types.ts'),
    );

    localPackages = packLocalClosure({
      appDirectories: [frontend, sdkOnly],
      outputDirectory: path.join(root, 'packages'),
      repoRoot,
    });

    applyLocalOverrides(frontend, localPackages);

    runSetup('pnpm', ['install', '--store-dir', path.join(root, 'store')], { cwd: frontend });
  }, 600000);

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('SDK-only install pulls no server packages', () => {
    const sdk = localPackages.find(({ name }) => name === '@frogbotai/sdk')!;
    const manifestPath = path.join(sdkOnly, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    manifest.dependencies['@frogbotai/sdk'] = `file:${sdk.tarball}`;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const install = run(
      'npm',
      ['install', '--no-audit', '--no-fund', '--cache', path.join(root, 'npm-cache')],
      { cwd: sdkOnly },
    );

    const modules = path.join(sdkOnly, 'node_modules');
    const installed = JSON.parse(
      fs.readFileSync(path.join(modules, '@frogbotai', 'sdk', 'package.json'), 'utf8'),
    );

    expect(install.status, install.output).toBe(0);
    expect(serverPackages.filter((name) => fs.existsSync(path.join(modules, name)))).toEqual([]);
    expect(fs.existsSync(path.join(modules, 'qs-esm'))).toBe(true);
    expect(installed.dependencies).toEqual({ 'qs-esm': '8.0.1' });
    expect(installed.peerDependencies).toEqual({ frogbot: sdk.version });
    expect(installed.peerDependenciesMeta).toEqual({ frogbot: { optional: true } });
    expect(fs.existsSync(path.join(modules, '@frogbotai', 'sdk', 'THIRD_PARTY_NOTICES.md'))).toBe(
      true,
    );
  }, 240000);

  it('frontend install has no next', () => {
    const modules = path.join(frontend, 'node_modules');
    const store = fs.readdirSync(path.join(modules, '.pnpm'));

    expect(fs.existsSync(path.join(modules, 'next'))).toBe(false);
    expect(store.filter((entry) => entry.startsWith('next@'))).toEqual([]);
  });

  it('frontend type-checks with automatic and explicit typing', () => {
    const result = run(
      path.join(frontend, 'node_modules', '.bin', 'tsc'),
      ['-p', 'tsconfig.json'],
      {
        cwd: frontend,
      },
    );

    expect(result.status, result.output).toBe(0);
  }, 120000);

  it('skipLibCheck: false reports no errors from the SDK or the app', () => {
    const result = run(
      path.join(frontend, 'node_modules', '.bin', 'tsc'),
      ['-p', 'tsconfig.strict-libs.json'],
      { cwd: frontend },
    );

    const errors = typeScriptErrors(result.output);
    const thirdParty = errors.filter(({ file }) => !isProjectFile(file));

    console.info(
      `[sdk packaging] skipLibCheck: false, ${thirdParty.length} third-party errors:\n${thirdParty
        .map(({ line }) => line)
        .join('\n')}`,
    );

    expect(errors.filter(({ file }) => isProjectFile(file))).toEqual([]);
  }, 120000);

  describe('browser bundle', () => {
    let booted: BootedFrogBot;
    let bundle: string;

    beforeAll(async () => {
      runSetup(path.join(frontend, 'node_modules', '.bin', 'vite'), ['build'], { cwd: frontend });

      bundle = fs.readFileSync(path.join(frontend, 'dist', 'main.js'), 'utf8');

      vi.stubEnv('FROGBOT_DATABASE', 'sqlite');
      vi.stubEnv('SQLITE_URL', `file:${path.join(root, 'sdk.db')}`);
      generateDatabaseAdapter('sqlite');

      booted = await bootFrogBot(path.join(repoRoot, 'test', 'sdk'), 'sdk-packaging');
    }, 240000);

    afterAll(async () => {
      await booted?.shutdown();
      vi.unstubAllEnvs();
    });

    it('contains no frogbot code', () => {
      const assets = fs
        .readdirSync(path.join(frontend, 'dist'), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'));

      expect(assets.filter((asset) => serverImport.test(asset))).toEqual([]);
    });

    it('keeps the query-string encoder when only createFrogBotSDK and find are used', () => {
      expect(bundle).toContain('addQueryPrefix');
    });

    it('performs a typed find against a live app', async () => {
      await clearAndSeed(booted.frogbot, 'empty');

      await booted.frogbot.create({
        collection: 'sdk-pages',
        data: { _status: 'published', title: 'Hello' },
        overrideAccess: true,
      } as never);

      const { findPublishedPage } = (await import(
        pathToFileURL(path.join(frontend, 'dist', 'main.js')).href
      )) as {
        findPublishedPage: (
          baseURL: string,
          title: string,
        ) => Promise<{ title?: string; totalDocs: number }>;
      };

      const result = await findPublishedPage(`${booted.baseUrl}/api`, 'Hello');

      expect(result).toMatchObject({ title: 'Hello', totalDocs: 1 });
    });
  });
});
