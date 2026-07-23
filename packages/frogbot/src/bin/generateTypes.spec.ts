import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';

import {
  buildGeneratedTypesFooter,
  writeGeneratedTypes,
} from './generateTypes.js';

const execFileAsync = promisify(execFile);
const binURL = pathToFileURL(
  new URL('./index.ts', import.meta.url).pathname,
).href;
const tsxLoader = createRequire(import.meta.url).resolve('tsx/esm');

describe('frogbot generate:types', () => {
  it.todo('loads config from cwd via loadConfig');
  it.todo('honors FROGBOT_CONFIG_PATH when set');
  it.todo('writes to <cwd>/frogbot-types.ts by default');
  it.todo(
    "redirects Payload's default outputFile (payload-types.ts) to frogbot-types.ts",
  );
  it.todo('honors `typescript.outputFile` when the user has customized it');
  it.todo('honors FROGBOT_TS_OUTPUT_PATH override');
  it.todo('emits a FrogBot-branded banner (not Payload-branded)');
  it('augments FrogBot with the generated Config', () => {
    const footer = buildGeneratedTypesFooter([]);
    expect(footer).toContain("declare module 'frogbot'");
    expect(footer).toContain('export interface GeneratedTypes extends Config');
    expect(footer).not.toContain("declare module 'payload'");
  });
  it.todo(
    'skips the write when output matches the existing file (deterministic)',
  );
  it.todo('exits non-zero on any failure with a `[frogbot]` prefixed message');

  it('loads production env files before importing the config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'frogbot-types-env-'));

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
      const script = `process.argv = ['node', 'frogbot', 'generate:types']; const { bin } = await import(${JSON.stringify(binURL)}); await bin();`;
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

  it('emits agent slugs in the GeneratedTypes augmentation', () => {
    expect(buildGeneratedTypesFooter(['media-buyer', 'support']))
      .toContain(`agents: {
      "media-buyer": unknown;
      "support": unknown;
    };`);
  });

  it('emits an empty agent map when no agents are configured', () => {
    expect(buildGeneratedTypesFooter([])).toContain('agents: {};');
  });

  describe('generated output', () => {
    let dir: string;

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('emits Thread/Message interfaces with UIMessage-typed parts for injected chat collections', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-types-'));
      const { buildConfig } = await import('../config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
        ai: { providers: { openai: { apiKey: 'sk-test' } } },
        agents: [
          {
            slug: 'assistant',
            model: 'openai/gpt-4o-mini',
            instructions: 'Assist.',
          },
        ],
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = await readFile(outputPath, 'utf-8');

      expect(output).toContain('export interface Thread {');
      expect(output).toContain('export interface Message {');
      expect(output).toContain("parts: import('frogbot').UIMessage['parts'];");
      expect(output).toContain('threads: Thread;');
      expect(output).toContain('messages: Message;');
      expect(output).toContain("role: 'user' | 'assistant' | 'system';");
      expect(output).toContain('"assistant": unknown;');
      expect(output).not.toMatch(/payload/i);
    });

    it('generates types without provider credentials', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-types-no-credentials-'));
      const { buildConfig } = await import('../config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
        ai: { providers: { openai: {} } },
      });

      await expect(writeGeneratedTypes(config, dir)).resolves.toBeDefined();
    });
  });
});
