import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';

import { catalog } from '../../../../packages/frogbot/src/ai/catalog.js';
import { barcodeField } from '../../../../packages/frogbot/src/fields/baseFields/barcode/index.js';
import { durationField } from '../../../../packages/frogbot/src/fields/baseFields/duration/index.js';
import { moneyField } from '../../../../packages/frogbot/src/fields/baseFields/money/index.js';
import { percentField } from '../../../../packages/frogbot/src/fields/baseFields/percent/index.js';
import { phoneField } from '../../../../packages/frogbot/src/fields/baseFields/phone/index.js';
import { ratingField } from '../../../../packages/frogbot/src/fields/baseFields/rating/index.js';
import { urlField } from '../../../../packages/frogbot/src/fields/baseFields/url/index.js';
import type { OptionColor } from '../../../../packages/frogbot/src/fields/config/types.js';
import {
  buildGeneratedTypesFooter,
  internalSelectName,
  nameInternalSelects,
  stripInternalCollections,
  writeGeneratedTypes,
} from '../../../../packages/frogbot/src/typegen/index.js';
import { apiKeysPlugin } from '../../../../packages/plugins/plugin-api-keys/src/index.js';
import { rolesPlugin } from '../../../../packages/plugins/plugin-roles/src/index.js';

const execFileAsync = promisify(execFile);
const binURL = pathToFileURL(
  new URL('../../../../packages/frogbot/src/bin/index.ts', import.meta.url).pathname,
).href;
const tsxLoader = createRequire(import.meta.url).resolve('tsx/esm');

describe('frogbot generate:types', () => {
  it('cleans a direct root ref to a stripped internal definition', () => {
    const schema = {
      properties: { internal: { $ref: '#/definitions/payload-folders' } },
      definitions: { 'payload-folders': { type: 'object' } },
    };

    stripInternalCollections(schema);

    expect(schema.properties.internal).toEqual({ type: 'null' });
    expect(schema.definitions).toEqual({});
  });

  it('cleans nested root refs to stripped internal definitions', () => {
    const schema = {
      properties: {
        result: {
          oneOf: [
            { $ref: '#/definitions/public' },
            { items: { $ref: '#/definitions/payload-folders' }, type: 'array' },
          ],
        },
      },
      definitions: {
        public: { type: 'object' },
        'payload-folders': { type: 'object' },
      },
    };

    stripInternalCollections(schema);

    expect(schema.properties.result.oneOf[0]).toEqual({ $ref: '#/definitions/public' });
    expect(schema.properties.result.oneOf[1]).toEqual({ items: { type: 'null' }, type: 'array' });
    expect(schema.definitions).toEqual({ public: { type: 'object' } });
  });

  it('names internal select types FrogBot<Plural>Select', () => {
    expect(internalSelectName('frogbot-chat-assets')).toBe('FrogBotChatAssetsSelect');
    expect(internalSelectName('frogbot-trigger-subscriptions')).toBe(
      'FrogBotTriggerSubscriptionsSelect',
    );
  });

  it('titles only internal select definitions', () => {
    const schema = {
      definitions: {
        'frogbot-waitpoints_select': { type: 'object' },
        'frogbot-waitpoints': { type: 'object', title: 'FrogBotWaitpoint' },
        posts_select: { type: 'object' },
      },
    };

    nameInternalSelects(schema);

    expect(schema.definitions).toEqual({
      'frogbot-waitpoints_select': { type: 'object', title: 'FrogBotWaitpointsSelect' },
      'frogbot-waitpoints': { type: 'object', title: 'FrogBotWaitpoint' },
      posts_select: { type: 'object' },
    });
  });

  it.todo('loads config from cwd via loadConfig');
  it.todo('honors FROGBOT_CONFIG_PATH when set');
  it.todo("redirects Payload's default outputFile (payload-types.ts) to frogbot-types.ts");
  it.todo('honors `typescript.outputFile` when the user has customized it');
  it.todo('honors FROGBOT_TS_OUTPUT_PATH override');
  it.todo('emits a FrogBot-branded banner (not Payload-branded)');
  it('augments FrogBot with the generated Config', () => {
    const footer = buildGeneratedTypesFooter([]);
    expect(footer).toContain("declare module 'frogbot'");
    expect(footer).toContain('export interface GeneratedTypes extends Config');
    expect(footer).not.toContain("declare module 'payload'");
  });
  it.todo('skips the write when output matches the existing file (deterministic)');
  it.todo('exits non-zero on any failure with a `[frogbot]` prefixed message');

  it('loads production env files before importing the config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'frogbot-types-env-'));

    await writeFile(join(dir, '.env'), 'FROGBOT_TEST_KEY=base\n');
    await writeFile(join(dir, '.env.local'), 'FROGBOT_TEST_KEY=local\n');
    await writeFile(join(dir, '.env.production'), 'FROGBOT_TEST_KEY=production\n');
    await writeFile(join(dir, '.env.production.local'), 'FROGBOT_TEST_KEY=production-local\n');
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
      await expect(readFile(join(dir, 'observed-env'), 'utf8')).resolves.toBe('production-local');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('emits agent slugs in the GeneratedTypes augmentation', () => {
    expect(buildGeneratedTypesFooter(['media-buyer', 'support'])).toContain(`agents: {
      "media-buyer": unknown;
      "support": unknown;
    };`);
  });

  it('emits an empty agent map when no agents are configured', () => {
    expect(buildGeneratedTypesFooter([])).toContain('agents: {};');
  });

  it('emits role slugs in the GeneratedTypes augmentation', () => {
    expect(buildGeneratedTypesFooter([], undefined, ['admin', 'member'])).toContain(
      'roles: "admin" | "member";',
    );
  });

  it('emits never when no roles are configured', () => {
    expect(buildGeneratedTypesFooter([])).toContain('roles: never;');
  });

  describe('generated output', () => {
    let dir: string;

    async function generateModelTypes(args: {
      providers: Record<string, unknown>;
      routers?: Record<string, { model: string }>;
    }): Promise<string> {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-model-types-'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
        ai: args as never,
      });
      const { outputPath } = await writeGeneratedTypes(config, dir);
      return readFile(outputPath, 'utf-8');
    }

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('generates numerical arrays for vectors in repeated fields and named tabs', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-vector-nested-types-'));

      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [
          {
            slug: 'documents',
            fields: [
              {
                name: 'passages',
                type: 'array',
                fields: [{ name: 'embedding', type: 'vector', dimensions: 1536, required: true }],
              },
              {
                type: 'tabs',
                tabs: [
                  {
                    name: 'details',
                    fields: [{ name: 'optionalEmbedding', type: 'vector', dimensions: 3 }],
                  },
                ],
              },
            ],
          },
        ],
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = await readFile(outputPath, 'utf-8');

      expect(output).toMatch(/passages\?:[\s\S]*?embedding: number\[\];/);
      expect(output).toMatch(/details\?:[\s\S]*?optionalEmbedding\?: number\[\] \| null;/);
      expect(output).not.toMatch(/embedding: \[number/);
    });

    it('emits money descriptions as JSDoc without changing the number types', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-money-types-'));

      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [
          {
            slug: 'products',
            fields: [
              moneyField({ name: 'price', admin: { description: 'Retail price' } }),
              moneyField({ name: 'cost' }),
              moneyField({
                name: 'net',
                admin: { description: { en: 'Net price', de: 'Nettopreis' } },
              }),
              moneyField({ name: 'computed', admin: { description: () => 'x' } }),
              moneyField({
                name: 'override',
                typescriptSchema: [
                  ({ jsonSchema }) => ({
                    ...jsonSchema,
                    description: 'Cost in USD, excluding VAT',
                  }),
                ],
              }),
              {
                name: 'lines',
                type: 'array',
                fields: [moneyField({ name: 'amount', currency: 'EUR' })],
              },
              {
                type: 'tabs',
                tabs: [
                  {
                    name: 'pricing',
                    fields: [moneyField({ name: 'list', currency: 'EUR' })],
                  },
                ],
              },
            ],
          },
        ],
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = (await readFile(outputPath, 'utf-8')).replace(/\s+/g, ' ');
      const units = 'in whole units, not minor units such as cents';
      const documented = (property: string, text: string) =>
        `/** * ${text} */ ${property}?: number | null;`;

      expect(output).toContain(
        documented('price', `Retail price (decimal amount in USD, ${units})`),
      );
      expect(output).toContain(documented('cost', `Decimal amount in USD, ${units}`));
      expect(output).toContain(documented('net', `Net price (decimal amount in USD, ${units})`));
      expect(output).toContain(documented('computed', `Decimal amount in USD, ${units}`));
      expect(output).toContain(documented('override', 'Cost in USD, excluding VAT'));
      expect(output).toContain(documented('amount', `Decimal amount in EUR, ${units}`));
      expect(output).toContain(documented('list', `Decimal amount in EUR, ${units}`));
      expect(output).toMatch(/lines\?:[\s\S]*?amount\?: number \| null;/);
      expect(output).toMatch(/pricing\?: \{[\s\S]*?list\?: number \| null;/);
      expect(output).not.toContain('Nettopreis');
    });

    it('emits simple kind descriptions as JSDoc without changing the field types', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-simple-kind-types-'));

      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [
          {
            slug: 'records',
            fields: [
              percentField({ name: 'progress' }),
              ratingField({ name: 'score', admin: { description: 'Fit' } }),
              durationField({ name: 'timeSpent' }),
              urlField({ name: 'website' }),
              phoneField({ name: 'phone' }),
              {
                name: 'items',
                type: 'array',
                fields: [barcodeField({ name: 'sku' })],
              },
            ],
          },
        ],
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = (await readFile(outputPath, 'utf-8')).replace(/\s+/g, ' ');
      const documented = (property: string, type: string, text: string) =>
        `/** * ${text} */ ${property}?: ${type} | null;`;

      expect(output).toContain(
        documented('progress', 'number', 'Fraction where 1 means 100%, for example 0.42 for 42%'),
      );
      expect(output).toContain(
        documented('score', 'number', 'Fit (whole-number rating from 1 to 5)'),
      );
      expect(output).toContain(
        documented(
          'timeSpent',
          'number',
          'Duration in whole seconds, for example 5400 for 1 hour 30 minutes',
        ),
      );
      expect(output).toContain(
        documented(
          'website',
          'string',
          'Web address, for example https://example.com or example.com',
        ),
      );
      expect(output).toContain(
        documented(
          'phone',
          'string',
          'Phone number as text, for example +44 20 7946 0958 or (415) 555-9876',
        ),
      );
      expect(output).toContain(
        documented('sku', 'string', 'Barcode value as text, for example a UPC or EAN code'),
      );
      expect(output).toMatch(/items\?:[\s\S]*?sku\?: string \| null;/);
    });

    it('generates the same types for coloured and uncoloured options', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-option-color-types-'));

      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');

      const generate = async (colored: boolean) => {
        const color = (name: OptionColor) => (colored ? { color: name } : {});

        const config = await buildConfig({
          secret: 'test-secret',
          db: { defaultIDType: 'number' } as never,
          collections: [
            {
              slug: 'tasks',
              fields: [
                {
                  name: 'labels',
                  type: 'select',
                  hasMany: true,
                  options: [
                    { label: 'Bug', value: 'bug', ...color('red') },
                    { label: 'Feature', value: 'feature', ...color('green') },
                    'chore',
                  ],
                },
                {
                  name: 'priority',
                  type: 'radio',
                  options: [
                    { label: 'Low', value: 'low' },
                    { label: 'High', value: 'high', ...color('orange') },
                  ],
                },
              ],
            },
          ],
        });

        const { outputPath } = await writeGeneratedTypes(config, dir);

        return readFile(outputPath, 'utf-8');
      };

      const plain = await generate(false);
      const colored = await generate(true);

      expect(colored).toBe(plain);
      expect(colored).toMatch(/labels\?: \('bug' \| 'feature' \| 'chore'\)\[\] \| null;/);
    });

    it('emits Chat/Message interfaces with UIMessage-typed parts for injected chat collections', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-types-'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
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

      expect(output).toContain('export interface Chat {');
      expect(output).toContain('export interface Message {');
      expect(output).toContain("parts: import('frogbot').UIMessage['parts'];");
      expect(output).toContain('chats: Chat;');
      expect(output).toContain('messages: Message;');
      expect(output).toContain("role: 'user' | 'assistant' | 'system';");
      expect(output).toContain('assistant: unknown;');
      expect(output).not.toMatch(/payload/i);
    });

    it('emits FrogBot-cased names for internal collections, selects and tasks', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-internal-names-'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [
          { slug: 'users', auth: true, fields: [] },
          { slug: 'chats', chat: true, fields: [] },
        ],
        ai: { providers: { openai: { apiKey: 'sk-test' } } },
        agents: [{ slug: 'assistant', model: 'openai/gpt-4o-mini', instructions: 'Assist.' }],
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = await readFile(outputPath, 'utf-8');

      expect(output).toContain('export interface FrogBotChatAsset {');
      expect(output).toContain('export interface FrogBotChatAssetsSelect {');
      expect(output).toContain('export interface FrogBotChatTurn {');
      expect(output).toContain('export interface FrogBotWaitpoint {');
      expect(output).toContain('export interface TaskFrogBotSweepJobs {');
      expect(output).not.toMatch(/Frogbot[A-Z]/);
    });

    it('emits the resolved custom usage-log slug', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-usage-types-'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [
          { slug: 'users', auth: true, fields: [] },
          { slug: 'ai-usage', usageLog: true, fields: [] },
        ],
        ai: { providers: { openai: { apiKey: 'sk-test' } } },
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = await readFile(outputPath, 'utf-8');

      expect(output).toContain('ai-usage');
      expect(output).not.toContain('usage-logs');
    });

    it('emits the API key relationship on usage logs', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-api-key-usage-types-'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
        ai: { providers: { openai: { apiKey: 'sk-test' } } },
        plugins: [rolesPlugin(), apiKeysPlugin()],
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = await readFile(outputPath, 'utf-8');

      expect(output).toContain('apiKey?: (number | null) | ApiKey;');
    });

    it('generates types without provider credentials', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-types-no-credentials-'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
        ai: { providers: { openai: true } },
      });

      await expect(writeGeneratedTypes(config, dir)).resolves.toBeDefined();
    });

    it('writes types when an agent model does not match the configured providers', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-types-model-mismatch-'));
      const { sanitize } = await import('../../../../packages/frogbot/src/config/sanitize.js');
      const config = sanitize(
        {
          secret: 'test-secret',
          db: { defaultIDType: 'number' } as never,
          collections: [{ slug: 'users', auth: true, fields: [] }],
          ai: { providers: { anthropic: true } },
          agents: [
            {
              slug: 'assistant',
              model: 'openai/gpt-4o-mini',
              instructions: 'Assist.',
            },
          ],
        },
        { mode: 'codegen' },
      );

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = await readFile(outputPath, 'utf-8');

      expect(output).toContain('assistant: unknown;');
      expect(output).toContain("'anthropic/claude-sonnet-4-5'");
      expect(output).not.toContain("'openai/gpt-4o'");
    });

    it('generates an empty agent map from an explicit empty agents array without AI', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-types-empty-agents-'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
        agents: [],
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = await readFile(outputPath, 'utf-8');

      expect(output).toContain('agents: {};');
    });

    it('emits configured role slugs', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-types-roles-'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
        plugins: [rolesPlugin({ roles: ['admin', { slug: 'member', label: 'Member' }] })],
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = await readFile(outputPath, 'utf-8');

      expect(output).toContain("roles: 'admin' | 'member';");
    });

    it('emits never when roles are explicitly empty', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-types-empty-roles-'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
        plugins: [rolesPlugin({ roles: [] })],
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = await readFile(outputPath, 'utf-8');

      expect(output).toContain('roles: never;');
    });

    it('emits never without the roles plugin', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-types-no-roles-'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);
      const output = await readFile(outputPath, 'utf-8');

      expect(output).toContain('roles: never;');
    });

    it('emits only models from configured built-in providers', async () => {
      const output = await generateModelTypes({ providers: { openai: true } });

      expect(output).toContain("'openai/gpt-4o'");
      expect(output).not.toContain('anthropic/claude-sonnet-4-5');
    });

    it('emits the complete Google model union after catalog mode corrections', async () => {
      const expected = catalog
        .filter(({ provider }) => provider === 'google')
        .map(({ id }) => id)
        .sort();

      const output = await generateModelTypes({ providers: { google: true } });
      const union = output.match(/models:\s*([\s\S]*?);/)?.[1] ?? '';
      const models = [...union.matchAll(/'([^']+)'/g)].map((match) => match[1]);

      expect(models).toEqual(expected);
      expect(models).toContain('google/gemini-3.5-transcribe');
      expect(models).toContain('google/gemini-embedding-001');
      expect(models).toContain('google/gemini-embedding-2');
    });

    it('wraps model unions that exceed the print width', async () => {
      const output = await generateModelTypes({ providers: { bedrock: true } });

      expect(output).toMatch(/models:\s*\n(?:\s*\|\s*'[^']+'\n)+/);
    });

    it('keeps short model unions inline', async () => {
      const output = await generateModelTypes({
        providers: {
          openai: { apiKey: 'sk-test', models: ['gpt-4o-mini'] },
        },
      });

      expect(output).toMatch(/models: [^\n]+;/);
    });

    it('does not rewrite byte-identical generated types', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-types-idempotent-'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
        ai: { providers: { bedrock: true } },
      });

      await expect(writeGeneratedTypes(config, dir)).resolves.toMatchObject({ changed: true });
      await expect(writeGeneratedTypes(config, dir)).resolves.toMatchObject({ changed: false });
    });

    it('writes into the config directory rather than a nested src directory', async () => {
      dir = await mkdtemp(join(tmpdir(), 'frogbot-types-config-dir-'));
      await mkdir(join(dir, 'src'));
      const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
      const config = await buildConfig({
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
      });

      const { outputPath } = await writeGeneratedTypes(config, dir);

      expect(outputPath).toBe(join(dir, 'frogbot-types.ts'));
    });

    it('combines models from multiple configured built-in providers', async () => {
      const output = await generateModelTypes({
        providers: { anthropic: true, openai: true },
      });

      expect(output).toContain("'anthropic/claude-sonnet-4-5'");
      expect(output).toContain("'openai/gpt-4o'");
    });

    it('narrows built-in models to allowlists while retaining custom models and router slugs', async () => {
      const output = await generateModelTypes({
        providers: {
          openai: { apiKey: 'sk-test', models: ['gpt-4o-mini'] },
          internal: {
            type: 'openai-compatible',
            baseUrl: 'https://models.test/v1',
            models: [{ id: 'chat-v1', mode: 'chat' }],
          },
        },
        routers: { fast: { model: 'internal/chat-v1' } },
      });

      expect(output).toContain("'openai/gpt-4o-mini'");
      expect(output).not.toContain("'openai/gpt-4o'");
      expect(output).toContain("'internal/chat-v1'");
      expect(output).toContain("'fast'");
    });

    it('emits custom provider models and router slugs', async () => {
      const output = await generateModelTypes({
        providers: {
          internal: {
            type: 'openai-compatible',
            baseUrl: 'https://models.test/v1',
            models: [{ id: 'chat-v1', mode: 'chat' }],
          },
        },
        routers: { fast: { model: 'internal/chat-v1' } },
      });

      expect(output).toContain("'internal/chat-v1'");
      expect(output).toContain("'fast'");
    });

    it('uses configured provider keys for aliased built-ins', async () => {
      const output = await generateModelTypes({
        providers: { bedrock: true, togetherai: true },
      });

      expect(output).toContain("'togetherai/");
      expect(output).toContain("'bedrock/");
    });

    it('removes stale models when configured providers change', async () => {
      const openai = await generateModelTypes({ providers: { openai: true } });
      const anthropic = await generateModelTypes({ providers: { anthropic: true } });

      expect(openai).toContain("'openai/gpt-4o'");
      expect(anthropic).not.toContain("'openai/gpt-4o'");
      expect(anthropic).toContain("'anthropic/claude-sonnet-4-5'");
    });
  });
});
