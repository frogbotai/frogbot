import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { applyAI } from '../../../packages/create-frogbot-app/src/lib/ai.js';
import {
  CONFIG_ANCHORS,
  ENV_ANCHORS,
  PACKAGE_DEPENDENCY_ANCHORS,
} from '../../../packages/create-frogbot-app/src/lib/anchors.js';
import { parseArgs } from '../../../packages/create-frogbot-app/src/lib/args.js';
import { applyDatabase } from '../../../packages/create-frogbot-app/src/lib/db.js';
import { applyPackageJson } from '../../../packages/create-frogbot-app/src/lib/package-json.js';
import { installSkill } from '../../../packages/create-frogbot-app/src/lib/skill.js';
import {
  PromptCancelledError,
  resolvePlan,
  resolvePromptValue,
  validateValue,
} from '../../../packages/create-frogbot-app/src/prompts.js';
import { getTemplate } from '../../../packages/create-frogbot-app/src/templates.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const template = path.join(repoRoot, 'templates', 'blank');
const roots: string[] = [];

function copyTemplate(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-frogbot-app-130-'));
  const dest = path.join(root, 'app');

  roots.push(root);
  fs.cpSync(template, dest, { recursive: true });

  return dest;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('CLI arguments and plans', () => {
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
      agents: 'claude,codex',
      ai: 'none',
      database: 'postgres',
      git: false,
      install: false,
      packageManager: 'pnpm',
      projectName: 'my-app',
      template: 'blank',
    });
  });

  it('resolves unattended defaults without coding agents', async () => {
    const plan = await resolvePlan({
      args: parseArgs(['my-app', '--yes']),
      cwd: '/tmp',
      detectedPackageManager: 'npm',
      tty: false,
    });

    expect(plan).toMatchObject({
      agents: [],
      ai: 'zen',
      database: 'sqlite',
      projectName: 'my-app',
    });
  });

  it('rejects missing non-interactive project names and unknown registry values', async () => {
    await expect(
      resolvePlan({ args: parseArgs([]), cwd: '/tmp', detectedPackageManager: 'npm', tty: false }),
    ).rejects.toThrow('--name');
    expect(() => getTemplate('missing')).toThrow('Valid templates: blank');
  });

  it.each([
    [['my-app', '--unknown'], 'Unknown option'],
    [['one', '--name', 'two'], 'project name once'],
    [['my-app', '--use-npm', '--use-pnpm'], 'only one package manager'],
  ])('rejects conflicting or unknown arguments', (argv, message) => {
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
    ).rejects.toThrow('Invalid project name');
    expect(() => validateValue('mongodb', ['sqlite'], 'database')).toThrow('Valid values: sqlite');
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
    [['my-app', '--db', 'oracle'], 'Valid values: sqlite, postgres, mongodb'],
    [['my-app', '--ai', 'local'], 'Valid values: zen, openai, anthropic, google, bedrock, none'],
    [
      ['my-app', '--agents', 'claude,unknown'],
      'Valid values: claude, codex, cursor, opencode, copilot, gemini',
    ],
  ])('rejects unsupported non-interactive values', async (argv, message) => {
    await expect(
      resolvePlan({
        args: parseArgs(argv),
        cwd: '/tmp',
        detectedPackageManager: 'npm',
        tty: false,
      }),
    ).rejects.toThrow(message);
  });
});

describe('template reconciliation', () => {
  it('contains every controlled anchor exactly once', () => {
    const config = fs.readFileSync(path.join(template, 'src', 'frogbot.config.ts'), 'utf8');
    const env = fs.readFileSync(path.join(template, '.env.example'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(template, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };

    for (const anchor of Object.values(CONFIG_ANCHORS)) {
      expect(config.split(anchor)).toHaveLength(2);
    }

    for (const anchor of ENV_ANCHORS) {
      expect(env.split(anchor)).toHaveLength(2);
    }

    for (const dependency of PACKAGE_DEPENDENCY_ANCHORS) {
      expect(pkg.dependencies[dependency]).toBeTypeOf('string');
    }
  });

  it.each([
    ['sqlite', 'sqliteAdapter', '@frogbotai/db-sqlite', 'file:./frogbot.db'],
    ['postgres', 'postgresAdapter', '@frogbotai/db-postgres', 'postgres://'],
    ['mongodb', 'mongooseAdapter', '@frogbotai/db-mongodb', 'mongodb://'],
  ] as const)(
    'applies the %s database without changing the lexical editor',
    (database, adapter, dependency) => {
      const dest = copyTemplate();

      applyDatabase(dest, database);
      applyPackageJson(dest, 'my-app', database, '0.24.0');

      const config = fs.readFileSync(path.join(dest, 'src', 'frogbot.config.ts'), 'utf8');
      const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>;
      };

      expect(config).toContain(adapter);
      expect(config).toContain('editor: lexicalEditor()');
      expect(pkg.dependencies[dependency]).toBeDefined();
      expect(pkg.dependencies['@frogbotai/richtext-lexical']).toBeDefined();
      if (database === 'mongodb') expect(pkg.dependencies['drizzle-kit']).toBeUndefined();
      if (database !== 'sqlite') expect(pkg.dependencies.libsql).toBeUndefined();
    },
  );

  it('names a drifted anchor without leaving a partially rewritten config', () => {
    const dest = copyTemplate();
    const configPath = path.join(dest, 'src', 'frogbot.config.ts');
    const config = fs
      .readFileSync(configPath, 'utf8')
      .replace(CONFIG_ANCHORS.db, '  db: brokenAdapter(),\n');

    fs.writeFileSync(configPath, config);

    expect(() => applyDatabase(dest, 'postgres')).toThrow('db anchor');
    expect(fs.readFileSync(configPath, 'utf8')).toBe(config);
  });

  it('removes all AI and agent wiring for none while preserving collections and editor', () => {
    const dest = copyTemplate();

    applyAI(dest, 'none');

    const config = fs.readFileSync(path.join(dest, 'src', 'frogbot.config.ts'), 'utf8');

    expect(config).not.toContain('ai:');
    expect(config).not.toContain('agents:');
    expect(config).not.toContain('tools:');
    expect(config).toContain('editor: lexicalEditor()');
    expect(config).toContain('collections: [Users]');
    expect(fs.existsSync(path.join(dest, 'src', 'agents'))).toBe(false);
  });

  it('replaces Zen with each configured provider', () => {
    for (const [provider, model] of [
      ['openai', 'openai/gpt-4o-mini'],
      ['anthropic', 'anthropic/claude-haiku'],
      ['google', 'google/gemini-2.5-flash'],
      ['bedrock', 'bedrock/us.anthropic'],
    ] as const) {
      const dest = copyTemplate();

      applyAI(dest, provider);

      expect(fs.readFileSync(path.join(dest, 'src', 'frogbot.config.ts'), 'utf8')).toContain(model);
    }
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
