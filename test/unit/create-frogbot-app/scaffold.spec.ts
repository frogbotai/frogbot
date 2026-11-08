import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';
import { afterEach, describe, expect, it } from 'vitest';

import { packs } from '../../../packages/create-frogbot-app/scripts/pack-filter.mjs';
import { applyTemplate } from '../../../packages/create-frogbot-app/src/index.js';
import { HELP, parseArgs } from '../../../packages/create-frogbot-app/src/lib/args.js';
import { DATABASE_CHOICES } from '../../../packages/create-frogbot-app/src/lib/db.js';
import { CliError } from '../../../packages/create-frogbot-app/src/lib/errors.js';
import { applyPackageJson } from '../../../packages/create-frogbot-app/src/lib/package-json.js';
import { installSkill } from '../../../packages/create-frogbot-app/src/lib/skill.js';
import { scaffoldMatrix } from '../../../packages/create-frogbot-app/src/matrix.js';
import {
  PromptCancelledError,
  resolvePlan,
  resolvePromptValue,
  validateValue,
} from '../../../packages/create-frogbot-app/src/prompts.js';
import { getTemplate, TEMPLATES } from '../../../packages/create-frogbot-app/src/templates.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const template = templatePath('blank');
const roots: string[] = [];
const buildOutput = new Set(['.next', 'node_modules']);
const DATABASE_DEPENDENCIES = {
  mongodb: { '@payloadcms/db-mongodb': '4.0.0' },
  postgres: { '@payloadcms/db-postgres': '4.0.0' },
  sqlite: { '@payloadcms/db-sqlite': '4.0.0' },
};

function templatePath(name: string): string {
  return path.join(repoRoot, 'templates', getTemplate(name).dir);
}

function copyTemplate(source = template): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-frogbot-app-scaffold-'));
  const dest = path.join(root, 'app');

  roots.push(root);

  fs.cpSync(source, dest, {
    recursive: true,
    filter: (source) => !buildOutput.has(path.basename(source)),
  });

  return dest;
}

const templateOptions = {
  ai: 'none',
  database: 'sqlite',
  databaseDependencies: DATABASE_DEPENDENCIES,
  projectName: 'my-app',
  template: getTemplate('blank'),
  version: '0.39.0',
} as const;

function writeConfig(dest: string, source: string): void {
  fs.writeFileSync(path.join(dest, 'src', 'frogbot.config.ts'), source);
}

function readConfig(dest: string): string {
  return fs.readFileSync(path.join(dest, 'src', 'frogbot.config.ts'), 'utf8');
}

function readPackage(dest: string): { dependencies: Record<string, string> } {
  return JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('CLI arguments and plans', () => {
  it('--help lists the AI providers in prompt order', () => {
    expect(HELP).toContain('zen, openai, anthropic, google, bedrock, or none');
  });

  it('parses matching flags and aliases', () => {
    expect(
      parseArgs([
        'my-app',
        '-t',
        'blank',
        '-d',
        'postgres',
        '--ai',
        'none',
        '--agents',
        'claude,codex',
        '--use-pnpm',
        '--no-git',
        '--no-deps',
      ]),
    ).toMatchObject({
      agents: ['claude', 'codex'],
      ai: 'none',
      database: 'postgres',
      git: false,
      install: false,
      packageManager: 'pnpm',
      projectName: 'my-app',
      template: 'blank',
    });
  });

  it('trims spaces around --agents entries', async () => {
    const plan = await resolvePlan({
      args: parseArgs(['my-app', '--agents', ' claude, codex ,']),
      cwd: '/tmp',
      detectedPackageManager: 'npm',
      env: {},
      tty: false,
    });

    expect(plan.agents).toEqual(['claude', 'codex']);
  });

  it('resolves unattended defaults without coding agents', async () => {
    const plan = await resolvePlan({
      args: parseArgs(['my-app', '--yes']),
      cwd: '/tmp',
      detectedPackageManager: 'npm',
      env: {},
      tty: false,
    });

    expect(plan).toMatchObject({
      agents: [],
      ai: 'none',
      database: 'sqlite',
      projectName: 'my-app',
    });
  });

  it('takes the provider key from --api-key over the environment', async () => {
    const plan = await resolvePlan({
      args: parseArgs(['my-app', '--ai', 'anthropic', '--api-key', 'sk-flag']),
      cwd: '/tmp',
      detectedPackageManager: 'npm',
      env: { ANTHROPIC_API_KEY: 'sk-env' },
      tty: false,
    });

    expect(plan.apiKey).toBe('sk-flag');
  });

  it('does not copy an environment key without prompts', async () => {
    const plan = await resolvePlan({
      args: parseArgs(['my-app', '--ai', 'anthropic']),
      cwd: '/tmp',
      detectedPackageManager: 'npm',
      env: { ANTHROPIC_API_KEY: 'sk-env' },
      tty: false,
    });

    expect(plan.apiKey).toBeUndefined();
  });

  it('rejects missing non-interactive project names and unknown registry values', async () => {
    await expect(
      resolvePlan({ args: parseArgs([]), cwd: '/tmp', detectedPackageManager: 'npm', tty: false }),
    ).rejects.toStrictEqual(new CliError('A project name is required. Pass --name <name>.'));
    expect(() => getTemplate('missing')).toThrow(CliError);
    expect(() => getTemplate('missing')).toThrow('Valid templates: blank');
  });

  it.each([
    [['my-app', '--unknown'], "Unknown option '--unknown'"],
    [['my-app', '--ai'], "Option '--ai <value>' argument missing"],
    [['one', '--name', 'two'], 'project name once'],
    [['my-app', '--use-npm', '--use-pnpm'], 'only one package manager'],
  ])('rejects conflicting or unknown arguments as user errors', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(CliError);
    expect(() => parseArgs(argv)).toThrow(message);
  });

  it('rejects invalid names and databases unsupported by a template', async () => {
    await expect(
      resolvePlan({
        args: parseArgs(['Invalid Name', '--yes']),
        cwd: '/tmp',
        detectedPackageManager: 'npm',
        tty: false,
      }),
    ).rejects.toStrictEqual(
      new CliError(
        'Invalid project name "Invalid Name". Use lowercase letters, numbers, dots, dashes, or underscores, starting with a letter or number.',
      ),
    );
    expect(() => validateValue('mongodb', ['sqlite'], 'database')).toThrow(CliError);
  });

  it('turns a prompt cancellation into the dedicated cancellation error', () => {
    let message: string | undefined;

    expect(() =>
      resolvePromptValue(Symbol('cancel'), (value) => {
        message = value;
      }),
    ).toThrow(PromptCancelledError);
    expect(message).toBe('Cancelled.');
  });

  it.each([
    [
      ['my-app', '--db', 'oracle'],
      'Unknown database "oracle". Valid values: sqlite, postgres, mongodb.',
    ],
    [
      ['my-app', '--ai', 'local'],
      'Unknown AI provider "local". Valid values: zen, openai, anthropic, google, bedrock, none.',
    ],
    [
      ['my-app', '--ai', 'opencode'],
      'Unknown AI provider "opencode". Valid values: zen, openai, anthropic, google, bedrock, none.',
    ],
    [
      ['my-app', '--agents', 'claude,unknown'],
      'Unknown agent "unknown". Valid values: claude, codex, cursor, opencode, copilot, gemini.',
    ],
  ])('rejects unsupported non-interactive values', async (argv, message) => {
    await expect(
      resolvePlan({
        args: parseArgs(argv),
        cwd: '/tmp',
        detectedPackageManager: 'npm',
        tty: false,
      }),
    ).rejects.toStrictEqual(new CliError(message));
  });
});

describe('blank scaffold output', () => {
  const providers = ['none', 'zen', 'openai', 'anthropic', 'google', 'bedrock'] as const;
  const cases = DATABASE_CHOICES.flatMap((database) => providers.map((ai) => ({ ai, database })));

  it.each(cases)('matches the snapshot for $database × $ai', async ({ ai, database }) => {
    const dest = copyTemplate();

    applyTemplate(dest, { ...templateOptions, ai, database });

    for (const file of ['src/frogbot.config.ts', 'package.json', '.env.example']) {
      const filepath = path.join(dest, file);
      const source = fs.readFileSync(filepath, 'utf8');
      const output = file.endsWith('.env.example')
        ? source
        : await prettier.format(source, {
            ...(await prettier.resolveConfig(filepath)),
            filepath,
          });

      await expect(output).toMatchFileSnapshot(
        `__snapshots__/blank/${database}-${ai}/${path.basename(file)}.snap`,
      );
    }
  });
});

describe('config edits', () => {
  it('keeps other plugins and agents, and swaps only the AI parts for none', () => {
    const dest = copyTemplate();

    writeConfig(
      dest,
      `import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import { dojo } from '@frogbotai/plugin-dojo';
import { seoPlugin } from '@frogbotai/plugin-seo';
import { buildConfig } from 'frogbot';
import { general } from 'frogbot/agents';

import { Posts } from './collections/Posts';
import { writer } from './agents/writer';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({ client: { url: '' } }),
  collections: [Posts],
  ai: { defaultModel: 'openai/gpt-5.4-mini', providers: { openai: true } },
  agents: [general(), writer],
  plugins: [seoPlugin({ collections: ['posts'] }), aiPolicyPlugin(), dojo()],
});
`,
    );

    const withAI = copyTemplate();

    fs.cpSync(dest, withAI, { recursive: true });
    applyTemplate(withAI, { ...templateOptions, ai: 'anthropic' });

    const kept = readConfig(withAI);

    expect(kept).toContain("defaultModel: 'anthropic/claude-haiku-4-5'");
    expect(kept).toContain('agents: [general(), writer]');
    expect(kept).toContain(
      "plugins: [seoPlugin({ collections: ['posts'] }), aiPolicyPlugin(), dojo()]",
    );
    expect(fs.existsSync(path.join(withAI, 'src', 'agents'))).toBe(true);

    applyTemplate(dest, { ...templateOptions, ai: 'none' });

    const config = readConfig(dest);

    expect(config).toContain("plugins: [seoPlugin({ collections: ['posts'] }), dojo()]");
    expect(config).toContain("import { seoPlugin } from '@frogbotai/plugin-seo';");
    expect(config).toContain("import { Posts } from './collections/Posts';");
    expect(config).not.toMatch(/aiPolicyPlugin|general|writer|agents|ai:/);
    expect(fs.existsSync(path.join(dest, 'src', 'agents'))).toBe(false);
    expect(readPackage(dest).dependencies).not.toHaveProperty('@frogbotai/plugin-ai-policy');
  });

  it('inserts db, ai and admin into an inline buildConfig without them', () => {
    const dest = copyTemplate();

    writeConfig(
      dest,
      `import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET || '',
  collections: [],
});
`,
    );

    applyTemplate(dest, { ...templateOptions, ai: 'openai', database: 'postgres' });

    const config = readConfig(dest);

    expect(config).toContain("import { postgresAdapter } from '@frogbotai/db-postgres';");
    expect(config).toContain('db: postgresAdapter({');
    expect(config).toContain("defaultModel: 'openai/gpt-5.4-mini'");
    expect(config).toContain("admin: { meta: { applicationName: 'my-app' } }");
  });

  it('sets the application name without dropping other admin settings', () => {
    const dest = copyTemplate();
    const source = fs
      .readFileSync(path.join(dest, 'src', 'frogbot.config.ts'), 'utf8')
      .replace('  admin: {},', "  admin: { user: 'users', meta: { titleSuffix: ' - Frog' } },");

    writeConfig(dest, source);
    applyTemplate(dest, templateOptions);

    expect(readConfig(dest)).toMatch(
      /admin: \{ user: 'users', meta: \{ titleSuffix: ' - Frog',\s+applicationName: 'my-app'\s+\} \}/,
    );
  });

  it('deletes a template’s own aiPaths and the plugins imported from them for none', () => {
    const dest = copyTemplate();

    fs.mkdirSync(path.join(dest, 'src', 'ai'));

    fs.writeFileSync(
      path.join(dest, 'src', 'ai', 'plugin.ts'),
      'export const helper = () => {};\n',
    );

    writeConfig(
      dest,
      `import { dojo } from '@frogbotai/plugin-dojo';
import { buildConfig } from 'frogbot';

import { helper } from './ai/plugin';

const config = {
  secret: '',
  plugins: [helper(), dojo()],
};

export default buildConfig(config);
`,
    );

    applyTemplate(dest, {
      ...templateOptions,
      template: { ...getTemplate('blank'), aiPaths: ['src/ai'] },
    });

    const config = readConfig(dest);

    expect(config).toContain('plugins: [dojo()]');
    expect(config).not.toContain('helper');
    expect(fs.existsSync(path.join(dest, 'src', 'ai'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'src', 'agents'))).toBe(true);
  });

  it.each([
    ['no buildConfig', 'export default { secret: "" };\n'],
    [
      'a let config',
      "import { buildConfig } from 'frogbot';\nlet config = {};\nexport default buildConfig(config);\n",
    ],
    [
      'a computed config',
      "import { buildConfig } from 'frogbot';\nexport default buildConfig(makeConfig());\n",
    ],
  ])('refuses %s without changing any file', (_, source) => {
    const dest = copyTemplate();

    writeConfig(dest, source);

    const pkg = fs.readFileSync(path.join(dest, 'package.json'), 'utf8');

    expect(() => applyTemplate(dest, templateOptions)).toThrow(CliError);
    expect(() => applyTemplate(dest, templateOptions)).toThrow(
      'expected `export default buildConfig({ ... })`, or `export default buildConfig(config)` with `const config = { ... }`.',
    );
    expect(readConfig(dest)).toBe(source);
    expect(fs.readFileSync(path.join(dest, 'package.json'), 'utf8')).toBe(pkg);
    expect(fs.existsSync(path.join(dest, 'src', 'agents'))).toBe(true);
  });

  it('keeps a header comment above the swapped database import', () => {
    const dest = copyTemplate();
    const source = `/**
 * App config.
 */
${fs.readFileSync(path.join(dest, 'src', 'frogbot.config.ts'), 'utf8')}`;

    writeConfig(dest, source);
    applyTemplate(dest, { ...templateOptions, database: 'postgres' });

    expect(readConfig(dest)).toMatch(
      /^\/\*\*\n \* App config\.\n \*\/\nimport \{ postgresAdapter \} from '@frogbotai\/db-postgres';\n/,
    );
  });

  it('edits quoted property names in place', () => {
    const dest = copyTemplate();

    writeConfig(
      dest,
      `import { buildConfig } from 'frogbot';

export default buildConfig({
  'secret': '',
  'ai': { defaultModel: 'openai/gpt-5.4-mini' },
  'admin': { 'meta': { 'applicationName': 'old' } },
});
`,
    );

    applyTemplate(dest, templateOptions);

    const config = readConfig(dest);

    expect(config).not.toMatch(/'ai'|old/);
    expect(config.match(/admin/g)).toHaveLength(1);
    expect(config).toContain("applicationName: 'my-app'");
  });

  it.each([
    [
      'an adapter used outside db',
      "import { sqliteAdapter } from '@frogbotai/db-sqlite';\nimport { buildConfig } from 'frogbot';\nconst db = sqliteAdapter({});\nexport default buildConfig({ db, secret: '' });\n",
      'postgres',
      '`sqliteAdapter`',
    ],
    [
      'another name from the replaced adapter package',
      "import { sqliteAdapter, sqliteHelper } from '@frogbotai/db-sqlite';\nimport { buildConfig } from 'frogbot';\nexport default buildConfig({ db: sqliteAdapter({}), secret: sqliteHelper() });\n",
      'postgres',
      '`sqliteHelper`',
    ],
    [
      'an agent used outside agents',
      "import { buildConfig } from 'frogbot';\nimport { other } from 'other';\nimport { writer } from './agents/writer';\nexport default buildConfig({ secret: '', agents: [writer], plugins: [other({ agent: writer })] });\n",
      'sqlite',
      "'./agents/writer'",
    ],
    [
      'an AI-only plugin outside the plugins list',
      "import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';\nimport { buildConfig } from 'frogbot';\nexport default buildConfig({ secret: '', plugins: [...(process.env.X ? [aiPolicyPlugin()] : [])] });\n",
      'sqlite',
      "'@frogbotai/plugin-ai-policy'",
    ],
  ] as const)('refuses %s that the edits would leave broken', (_, source, database, named) => {
    const dest = copyTemplate();

    writeConfig(dest, source);

    expect(() => applyTemplate(dest, { ...templateOptions, database })).toThrow(CliError);
    expect(() => applyTemplate(dest, { ...templateOptions, database })).toThrow(named);
    expect(readConfig(dest)).toBe(source);
    expect(fs.existsSync(path.join(dest, 'src', 'agents'))).toBe(true);
  });

  it('refuses an admin that is not an object literal', () => {
    const dest = copyTemplate();
    const source = fs
      .readFileSync(path.join(dest, 'src', 'frogbot.config.ts'), 'utf8')
      .replace('  admin: {},', '  admin: adminSettings,');

    writeConfig(dest, source);

    expect(() => applyTemplate(dest, templateOptions)).toThrow(
      'admin and admin.meta must be object literals',
    );
  });

  it('declares the adapter runtime dependencies directly so they resolve from the app root', () => {
    const dest = copyTemplate();

    applyPackageJson(dest, 'my-app', 'mongodb', '0.24.0', {
      mongodb: { '@payloadcms/db-mongodb': '3.90.1', payload: '3.90.1' },
      postgres: { '@payloadcms/db-postgres': '3.90.1' },
    });

    const pkg = readPackage(dest);

    expect(pkg.dependencies['@payloadcms/db-mongodb']).toBe('3.90.1');
    expect(pkg.dependencies.payload).toBe('3.90.1');
    expect(pkg.dependencies['@payloadcms/db-postgres']).toBeUndefined();
    expect(Object.keys(pkg.dependencies)).toEqual(
      [...Object.keys(pkg.dependencies)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('ships a public/ folder for the app icon', () => {
    expect(fs.statSync(path.join(template, 'public')).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(template, 'Dockerfile'), 'utf8')).toContain(
      'COPY --from=builder /app/public ./public',
    );
  });
});

describe('projects scaffold output', () => {
  const projects = { ...templateOptions, template: getTemplate('projects') };

  it('keeps the agent, the AI policy plugin and the seed with a provider', () => {
    const dest = copyTemplate(templatePath('projects'));

    applyTemplate(dest, { ...projects, ai: 'openai' });

    const config = readConfig(dest);

    expect(config).toContain('agents: [general(), assistant]');
    expect(config).toContain('plugins: [aiPolicyPlugin(), dojo()]');
    expect(config).toContain('endpoints: [seedEndpoint()]');
    expect(fs.existsSync(path.join(dest, 'src', 'agents', 'assistant.ts'))).toBe(true);
    expect(readPackage(dest).dependencies).toHaveProperty('@frogbotai/plugin-ai-policy');
  });

  it('drops the AI parts and keeps the seed, its endpoint and the panel for none', () => {
    const dest = copyTemplate(templatePath('projects'));

    applyTemplate(dest, projects);

    const config = readConfig(dest);

    expect(config).not.toMatch(/aiPolicyPlugin|assistant|agents|ai:|tools:/);
    expect(config).toContain('plugins: [dojo()]');
    expect(config).toContain('collections: [Projects, Tasks, Users, Files]');
    expect(config).toContain('endpoints: [seedEndpoint()]');
    expect(config).toContain("import { seedEndpoint } from './seed/endpoint';");
    expect(config).toContain("beforeDashboard: ['/components/SeedPanel#SeedPanel']");
    expect(config).toContain("applicationName: 'my-app'");
    expect(fs.existsSync(path.join(dest, 'src', 'agents'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'src', 'seed', 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'src', 'components', 'SeedPanel.tsx'))).toBe(true);
    expect(readPackage(dest).dependencies).not.toHaveProperty('@frogbotai/plugin-ai-policy');
  });

  it('seeds without importing anything that --ai none deletes', () => {
    const seedDir = path.join(templatePath('projects'), 'src', 'seed');

    for (const file of fs.readdirSync(seedDir)) {
      expect(fs.readFileSync(path.join(seedDir, file), 'utf8')).not.toMatch(/agents/);
    }
  });
});

describe('crm scaffold output', () => {
  const crm = { ...templateOptions, template: getTemplate('crm') };

  it('keeps the agent and the AI policy plugin with a provider', () => {
    const dest = copyTemplate(templatePath('crm'));

    applyTemplate(dest, { ...crm, ai: 'openai' });

    const config = readConfig(dest);

    expect(config).toContain('agents: [general(), assistant]');
    expect(config).toContain('plugins: [aiPolicyPlugin(), dojo()]');
    expect(fs.existsSync(path.join(dest, 'src', 'agents', 'assistant.ts'))).toBe(true);
  });

  it('drops the AI parts and keeps the collections, the seed and the panel for none', () => {
    const dest = copyTemplate(templatePath('crm'));

    applyTemplate(dest, crm);

    const config = readConfig(dest);

    expect(config).not.toMatch(/aiPolicyPlugin|assistant|agents|ai:|tools:/);
    expect(config).toContain(
      'collections: [Companies, Contacts, Deals, Activities, Tasks, Users, Media]',
    );
    expect(config).toContain('endpoints: [seedEndpoint()]');
    expect(config).toContain("beforeDashboard: ['/components/SeedPanel#SeedPanel']");
    expect(fs.existsSync(path.join(dest, 'src', 'agents'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'src', 'seed', 'logos', 'lumen-labs.webp'))).toBe(true);
  });

  it('ships 6 to 10 logos under 30 KB, and a seed that imports nothing --ai none deletes', () => {
    const seedDir = path.join(templatePath('crm'), 'src', 'seed');
    const logos = fs.readdirSync(path.join(seedDir, 'logos'));

    expect(logos.length).toBeGreaterThanOrEqual(6);
    expect(logos.length).toBeLessThanOrEqual(10);

    for (const logo of logos) {
      expect(logo).toMatch(/\.webp$/);
      expect(fs.statSync(path.join(seedDir, 'logos', logo)).size).toBeLessThan(30 * 1024);
    }

    for (const file of fs.readdirSync(seedDir).filter((name) => name.endsWith('.ts'))) {
      const source = fs.readFileSync(path.join(seedDir, file), 'utf8');

      expect(source).not.toMatch(/agents|test\/|Math\.random|Date\.now/);
    }
  });
});

describe('packing matrix', () => {
  it('scaffolds every registry template', () => {
    const templates = path.join(copyTemplate(), '..', 'templates');

    for (const entry of TEMPLATES) {
      fs.cpSync(path.join(repoRoot, 'templates', entry.dir), path.join(templates, entry.dir), {
        recursive: true,
        filter: (source) => !buildOutput.has(path.basename(source)),
      });
    }

    expect(() => scaffoldMatrix(TEMPLATES, templates)).not.toThrow();
  });

  it('leaves out generated types, build output, local databases and dev uploads', () => {
    const crm = templatePath('crm');
    const left = ['media', 'files', 'node_modules', 'frogbot.db', 'src/frogbot-types.ts'];
    const kept = ['src', 'public', 'src/collections/Media.ts', 'src/seed/logos/lumen-labs.webp'];

    for (const entry of left) expect(packs(crm, path.join(crm, entry)), entry).toBe(false);

    for (const entry of kept) expect(packs(crm, path.join(crm, entry)), entry).toBe(true);
  });

  it('names the template, database and provider that failed', () => {
    const blank = copyTemplate();

    writeConfig(blank, 'export default {};\n');

    expect(() =>
      scaffoldMatrix([{ ...getTemplate('blank'), dir: 'app' }], path.dirname(blank)),
    ).toThrow(/^templates\/app × sqlite × openai: Can't edit .*frogbot\.config\.ts: expected/);
  });
});

describe('skill bundling', () => {
  it('copies both discovery directories and writes each pointer once', () => {
    const dest = copyTemplate();
    const skill = path.join(path.dirname(dest), 'skill');

    fs.mkdirSync(skill);
    fs.writeFileSync(path.join(skill, 'SKILL.md'), '# FrogBot\n');

    expect(installSkill(dest, skill, ['claude', 'codex', 'cursor', 'copilot', 'gemini'])).toBe(
      true,
    );
    expect(fs.existsSync(path.join(dest, '.claude', 'skills', 'frogbot', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, '.agents', 'skills', 'frogbot', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, '.github', 'copilot-instructions.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'GEMINI.md'))).toBe(true);
  });

  it('writes no pointers when the skill is absent', () => {
    const dest = copyTemplate();

    expect(installSkill(dest, path.join(dest, 'missing'), ['claude'])).toBe(false);
    expect(fs.existsSync(path.join(dest, 'CLAUDE.md'))).toBe(false);
  });
});
