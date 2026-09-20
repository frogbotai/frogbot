import path from 'node:path';

import * as p from '@clack/prompts';

import { AI_PROVIDERS } from './lib/ai.js';
import type { CliArgs } from './lib/args.js';
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
    throw new Error(`Unknown ${name} "${value}". Valid values: ${valid.join(', ')}.`);
  }

  return value as T;
}

export async function resolvePlan({
  args,
  cwd,
  detectedPackageManager,
  tty,
}: {
  args: CliArgs;
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
        validate: (value) =>
          /^[a-z0-9][a-z0-9._-]*$/.test(value ?? '')
            ? undefined
            : 'Use lowercase letters, numbers, dots, dashes, or underscores.',
      }),
    );
  }

  if (!projectName) throw new Error('A project name is required. Pass --name <name>.');
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(projectName)) {
    throw new Error(`Invalid project name "${projectName}".`);
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
        initialValue: 'zen',
        options: AI_VALUES.map((value) => ({
          label: value === 'none' ? 'None / add later' : AI_PROVIDERS[value].label,
          value,
        })),
      }),
    );
  }

  const resolvedAI = validateValue(ai ?? 'zen', AI_VALUES, 'AI provider');
  let agents: AgentTarget[] | string | undefined = args.agents;

  if (agents === undefined && interactive) {
    agents = resolvePromptValue<AgentTarget[]>(
      await p.multiselect({ message: 'Coding agents', required: false, options: AGENTS }),
    ) as AgentTarget[];
  }

  const resolvedAgents = Array.isArray(agents)
    ? agents
    : agents
      ? agents.split(',').filter(Boolean)
      : [];

  resolvedAgents.forEach((agent) => validateValue(agent, AGENT_VALUES, 'agent'));

  return {
    agents: resolvedAgents as AgentTarget[],
    ai: resolvedAI,
    database: resolvedDatabase as Database,
    dest: path.resolve(cwd, projectName),
    git: args.git,
    install: args.install,
    packageManager: (args.packageManager as PackageManager | undefined) ?? detectedPackageManager,
    projectName,
    template,
  };
}
