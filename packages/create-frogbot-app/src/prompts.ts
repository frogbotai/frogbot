import path from 'node:path';

import * as p from '@clack/prompts';

import { AI_PROVIDERS } from './lib/ai.js';
import type { CliArgs } from './lib/args.js';
import { CliError } from './lib/errors.js';
import { getTemplate, TEMPLATES } from './templates.js';
import type { AgentTarget, AIProvider, Database, PackageManager, ScaffoldPlan } from './types.js';

const AGENTS: Array<{ label: string; value: AgentTarget }> = [
  { label: 'Claude Code', value: 'claude' },
  { label: 'Codex', value: 'codex' },
  { label: 'Cursor', value: 'cursor' },
  { label: 'opencode', value: 'opencode' },
  { label: 'GitHub Copilot', value: 'copilot' },
  { label: 'Gemini CLI', value: 'gemini' },
];

const AI_VALUES: AIProvider[] = ['zen', 'openai', 'anthropic', 'google', 'bedrock', 'none'];
const AGENT_VALUES = AGENTS.map(({ value }) => value);
const PROJECT_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const PROJECT_NAME_RULE =
  'Use lowercase letters, numbers, dots, dashes, or underscores, starting with a letter or number.';

export class PromptCancelledError extends Error {}

export function resolvePromptValue<T>(
  value: T | symbol,
  cancel: (message?: string) => void = p.cancel,
): T {
  if (typeof value === 'symbol') {
    cancel('Cancelled.');
    throw new PromptCancelledError('Cancelled.');
  }

  return value;
}

export function validateValue<T extends string>(
  value: string,
  valid: readonly T[],
  name: string,
): T {
  if (!valid.includes(value as T)) {
    throw new CliError(`Unknown ${name} "${value}". Valid values: ${valid.join(', ')}.`);
  }

  return value as T;
}

export async function resolvePlan({
  args,
  cwd,
  detectedPackageManager,
  env = process.env,
  tty,
}: {
  args: CliArgs;
  env?: Record<string, string | undefined>;
  cwd: string;
  detectedPackageManager: PackageManager;
  tty: boolean;
}): Promise<ScaffoldPlan> {
  const interactive = tty && !args.yes;
  let projectName = args.projectName?.trim();

  if (!projectName && interactive) {
    projectName = resolvePromptValue<string>(
      await p.text({
        message: 'Project name',
        placeholder: 'my-frogbot-app',
        validate: (value) => (PROJECT_NAME.test(value ?? '') ? undefined : PROJECT_NAME_RULE),
      }),
    );
  }

  if (!projectName) throw new CliError('A project name is required. Pass --name <name>.');

  if (!PROJECT_NAME.test(projectName)) {
    throw new CliError(`Invalid project name "${projectName}". ${PROJECT_NAME_RULE}`);
  }

  let templateName = args.template;

  if (!templateName && interactive && TEMPLATES.length > 1) {
    templateName = resolvePromptValue<string>(
      await p.select({
        message: 'Template',
        options: TEMPLATES.map((template) => ({
          label: template.name,
          hint: template.description,
          value: template.name,
        })),
      }),
    );
  }

  const template = getTemplate(templateName ?? TEMPLATES[0].name);
  let database = args.database;

  if (!database && interactive) {
    database = resolvePromptValue<Database>(
      await p.select({
        message: 'Database',
        initialValue: template.defaultDatabase,
        options: template.supportedDatabases.map((value) => ({ label: value, value })),
      }),
    );
  }

  const resolvedDatabase = validateValue(
    database ?? template.defaultDatabase,
    template.supportedDatabases,
    'database',
  );

  let ai = args.ai;

  if (!ai && interactive) {
    ai = resolvePromptValue<AIProvider>(
      await p.select({
        message: 'AI provider',
        options: AI_VALUES.map((value) => ({
          label: value === 'none' ? 'None / add later' : AI_PROVIDERS[value].label,
          hint: value === 'none' ? undefined : AI_PROVIDERS[value].hint,
          value,
        })),
      }),
    );
  }

  const resolvedAI = validateValue(ai ?? 'none', AI_VALUES, 'AI provider');
  const keyEnv = resolvedAI === 'none' ? undefined : AI_PROVIDERS[resolvedAI].keyEnv;
  const environmentKey = keyEnv ? env[keyEnv]?.trim() || undefined : undefined;
  let apiKey = args.apiKey?.trim() || undefined;

  if (!apiKey && environmentKey && interactive) {
    const useEnvironmentKey = resolvePromptValue<boolean>(
      await p.confirm({
        message: `Found ${keyEnv} in your environment. Use it for this app?`,
        initialValue: true,
      }),
    );

    if (useEnvironmentKey) apiKey = environmentKey;
  }

  if (!apiKey && keyEnv && interactive) {
    apiKey =
      resolvePromptValue<string>(
        await p.password({
          message: `${keyEnv} (leave blank to add it to .env later)`,
        }),
      ).trim() || undefined;
  }

  let agents = args.agents;

  if (agents === undefined && interactive) {
    agents = resolvePromptValue<AgentTarget[]>(
      await p.multiselect({ message: 'Coding agents', required: false, options: AGENTS }),
    );
  }

  const resolvedAgents = agents ?? [];

  resolvedAgents.forEach((agent) => validateValue(agent, AGENT_VALUES, 'agent'));

  return {
    agents: resolvedAgents as AgentTarget[],
    ai: resolvedAI,
    apiKey,
    database: resolvedDatabase,
    dest: path.resolve(cwd, projectName),
    git: args.git,
    install: args.install,
    packageManager: (args.packageManager as PackageManager | undefined) ?? detectedPackageManager,
    projectName,
    template,
  };
}
