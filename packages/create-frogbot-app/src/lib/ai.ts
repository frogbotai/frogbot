import fs from 'node:fs';
import path from 'node:path';

import { Node, SyntaxKind } from 'ts-morph';

import type { AIProvider, ScaffoldPlan } from '../types.js';
import {
  CONFIG_FILE,
  type ConfigFile,
  getProperty,
  importSource,
  removeProperty,
  setProperty,
} from './config.js';

export const AI_PROVIDERS: Record<
  Exclude<AIProvider, 'none'>,
  {
    /** Env var that holds the credential; the CLI prompts for it. */
    keyEnv: string;
    /** Extra non-secret env lines written to `.env` and `.env.example`. */
    env: string[];
    label: string;
    hint?: string;
    /** The `ai` value written to `frogbot.config.ts`. */
    config: string;
  }
> = {
  openai: {
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    env: [],
    config: "{\n  defaultModel: 'openai/gpt-5.4-mini',\n  providers: { openai: true },\n}",
  },
  anthropic: {
    label: 'Anthropic',
    keyEnv: 'ANTHROPIC_API_KEY',
    env: [],
    config:
      "{\n  defaultModel: 'anthropic/claude-haiku-4-5',\n  providers: { anthropic: true },\n}",
  },
  google: {
    label: 'Google Gemini',
    keyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
    env: [],
    config: "{\n  defaultModel: 'google/gemini-3.5-flash',\n  providers: { google: true },\n}",
  },
  bedrock: {
    label: 'AWS Bedrock',
    hint: 'Bedrock API key, or leave blank and set AWS_PROFILE',
    keyEnv: 'AWS_BEARER_TOKEN_BEDROCK',
    env: ['AWS_REGION=us-east-1'],
    config:
      "{\n  defaultModel: 'bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0',\n  providers: { bedrock: { region: process.env.AWS_REGION || 'us-east-1' } },\n}",
  },
  zen: {
    label: 'OpenCode Zen',
    hint: 'needs a paid Zen API key',
    keyEnv: 'OPENCODE_API_KEY',
    env: [],
    config:
      "{\n  defaultModel: 'zen/deepseek-v4.1-flash',\n  providers: {\n    zen: {\n      type: 'openai-compatible',\n      baseUrl: 'https://opencode.ai/zen/v1',\n      apiKey: process.env.OPENCODE_API_KEY,\n      models: [{ id: 'deepseek-v4.1-flash', mode: 'chat' }],\n    },\n  },\n}",
  },
};

/** Packages whose plugins only make sense with an AI provider; `--ai none` drops them. */
export const AI_ONLY_PACKAGES = ['@frogbotai/plugin-ai-policy'];

const AI_PROPERTIES = ['ai', 'agents', 'tools'];

export function applyAI(config: ConfigFile, provider: AIProvider, aiPaths: string[]): void {
  if (provider !== 'none') {
    setProperty(config.object, 'ai', AI_PROVIDERS[provider].config);

    return;
  }

  for (const name of AI_PROPERTIES) removeProperty(config.object, name);

  config.removedModule = (moduleSpecifier) => isAIOnly(moduleSpecifier, aiPaths);

  const plugins = getProperty(config.object, 'plugins')
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);

  for (const element of plugins?.getElements() ?? []) {
    const callee = Node.isCallExpression(element) ? element.getExpression() : element;
    const source = Node.isIdentifier(callee)
      ? importSource(config.file, callee.getText())
      : undefined;

    if (source && isAIOnly(source, aiPaths)) plugins?.removeElement(element);
  }
}

function isAIOnly(moduleSpecifier: string, aiPaths: string[]): boolean {
  if (AI_ONLY_PACKAGES.includes(moduleSpecifier)) return true;
  if (!moduleSpecifier.startsWith('.')) return false;

  const file = path.posix.join(path.posix.dirname(CONFIG_FILE), moduleSpecifier);

  return aiPaths.some((aiPath) => file === aiPath || file.startsWith(`${aiPath}/`));
}

/** Deletes the template's AI-only files and dependencies, for `--ai none`. */
export function removeAIFiles(dest: string, aiPaths: string[]): void {
  for (const aiPath of aiPaths) {
    fs.rmSync(path.join(dest, aiPath), { recursive: true, force: true });
  }

  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };

  for (const name of AI_ONLY_PACKAGES) delete pkg.dependencies?.[name];

  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

/** Env lines for the provider; the key line is left empty for `.env.example`. */
export function providerEnv(provider: AIProvider): string[] {
  if (provider === 'none') return [];
  const { env, keyEnv } = AI_PROVIDERS[provider];

  return [`${keyEnv}=`, ...env];
}

export function providerKeyEnv(provider: AIProvider): string | undefined {
  return provider === 'none' ? undefined : AI_PROVIDERS[provider].keyEnv;
}

export function missingKeyWarning(
  plan: Pick<ScaffoldPlan, 'ai' | 'apiKey' | 'projectName'>,
  env: Record<string, string | undefined>,
): string | undefined {
  if (plan.ai === 'none' || plan.apiKey) return undefined;

  const { keyEnv } = AI_PROVIDERS[plan.ai];
  const envFile = `${plan.projectName}/.env`;

  if (env[keyEnv]?.trim()) {
    return `Found ${keyEnv} in your environment but did not copy it to ${envFile}. Add it there, or scaffold with --api-key.`;
  }

  if (plan.ai === 'bedrock') return `Set ${keyEnv} (or AWS_PROFILE) in ${envFile} before chatting.`;

  return `Set ${keyEnv} in ${envFile} before chatting.`;
}
