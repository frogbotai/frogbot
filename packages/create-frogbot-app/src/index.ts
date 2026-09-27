import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as p from '@clack/prompts';

import { applyAI, providerKeyEnv } from './lib/ai.js';
import { HELP, parseArgs } from './lib/args.js';
import { applyDatabase } from './lib/db.js';
import { writeEnv } from './lib/env.js';
import { initializeGit } from './lib/git.js';
import { applyPackageJson, type DatabaseDependencies } from './lib/package-json.js';
import {
  detectPackageManager,
  installDependencies,
  writePnpmWorkspace,
} from './lib/package-manager.js';
import { installSkill } from './lib/skill.js';
import { PromptCancelledError, resolvePlan } from './prompts.js';
import type { AgentTarget, AIProvider, Database, PackageManager, ScaffoldPlan } from './types.js';

export { detectPackageManager } from './lib/package-manager.js';
export type { PackageManager } from './types.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const COMMANDS: Record<PackageManager, string> = {
  bun: 'bun dev',
  npm: 'npm run dev',
  pnpm: 'pnpm dev',
  yarn: 'yarn dev',
};

interface ScaffoldOptions {
  agents?: AgentTarget[];
  ai?: AIProvider;
  apiKey?: string;
  database?: Database;
  dest: string;
  packageManager?: PackageManager;
  projectName: string;
  templateDir: string;
}

function readVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(dirname, '..', 'package.json'), 'utf8')) as {
    version: string;
  };

  return pkg.version;
}

// Written by scripts/pack-templates.mjs next to the built entry point.
function readDatabaseDependencies(): DatabaseDependencies {
  const file = path.join(dirname, 'database-dependencies.json');

  return fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf8')) as DatabaseDependencies)
    : {};
}

export function scaffold(options: ScaffoldOptions): void {
  const packageManager = options.packageManager ?? detectPackageManager();
  const database = options.database ?? 'sqlite';
  const ai = options.ai ?? 'openai';

  if (fs.existsSync(options.dest)) {
    throw new Error(`Directory "${options.projectName}" already exists.`);
  }

  fs.cpSync(options.templateDir, options.dest, { recursive: true });

  const gitignore = path.join(options.dest, 'gitignore');

  if (fs.existsSync(gitignore)) fs.renameSync(gitignore, path.join(options.dest, '.gitignore'));

  applyDatabase(options.dest, database);
  applyAI(options.dest, ai);
  applyPackageJson(
    options.dest,
    options.projectName,
    database,
    readVersion(),
    readDatabaseDependencies(),
  );

  const envPlan = {
    ai,
    apiKey: options.apiKey,
    database,
    projectName: options.projectName,
  };

  writeEnv(options.dest, envPlan);
  writePnpmWorkspace(options.dest, packageManager);
}

function scaffoldPlan(plan: ScaffoldPlan): boolean {
  const templateDir = path.join(dirname, 'templates', plan.template.dir);

  scaffold({
    agents: plan.agents,
    ai: plan.ai,
    apiKey: plan.apiKey,
    database: plan.database,
    dest: plan.dest,
    packageManager: plan.packageManager,
    projectName: plan.projectName,
    templateDir,
  });

  return installSkill(plan.dest, path.join(dirname, 'skills', 'frogbot'), plan.agents);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  p.intro('Create a FrogBot app');

  let plan: ScaffoldPlan;

  try {
    plan = await resolvePlan({
      args,
      cwd: process.cwd(),
      detectedPackageManager: detectPackageManager(),
      tty: Boolean(process.stdin.isTTY),
    });
  } catch (error) {
    if (error instanceof PromptCancelledError) return;

    throw error;
  }

  if (fs.existsSync(plan.dest)) throw new Error(`Directory "${plan.projectName}" already exists.`);

  const skillInstalled = scaffoldPlan(plan);

  if (!skillInstalled) {
    p.log.warn('FrogBot skill is not bundled in this build; run npx skills add frogbotai/frogbot.');
  }

  if (plan.git && !initializeGit(plan.dest)) {
    p.log.warn('Could not initialize git. The project is still ready.');
  }

  if (plan.install) {
    p.log.step(`Installing dependencies with ${plan.packageManager}...`);

    if (!installDependencies(plan.dest, plan.packageManager)) {
      p.log.warn(`Install failed. Run ${plan.packageManager} install in the project.`);
    }
  }

  const keyEnv = providerKeyEnv(plan.ai);

  if (keyEnv && !plan.apiKey) {
    p.log.warn(
      plan.ai === 'bedrock'
        ? `Set ${keyEnv} (or AWS_PROFILE) in ${plan.projectName}/.env before chatting.`
        : `Set ${keyEnv} in ${plan.projectName}/.env before chatting — the assistant needs it.`,
    );
  }

  const providerDocs =
    plan.ai === 'none'
      ? 'https://docs.frogbot.ai/ai/overview'
      : 'https://docs.frogbot.ai/ai/providers';

  p.outro(
    `Created ${plan.projectName}.\n\n  cd ${plan.projectName}\n  ${COMMANDS[plan.packageManager]}\n\n  http://localhost:3000\n  https://docs.frogbot.ai/database/${plan.database}\n  ${providerDocs}`,
  );
}
