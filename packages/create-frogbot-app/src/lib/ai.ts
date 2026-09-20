import fs from 'node:fs';
import path from 'node:path';

import type { AIProvider } from '../types.js';
import { CONFIG_ANCHORS, replaceOnce } from './anchors.js';

export const AI_PROVIDERS: Record<
  Exclude<AIProvider, 'none'>,
  { env: string[]; label: string; snippet: string }
> = {
  zen: { label: 'Zen (free)', env: [], snippet: CONFIG_ANCHORS.ai },
  openai: {
    label: 'OpenAI',
    env: ['OPENAI_API_KEY='],
    snippet:
      "  ai: {\n    defaultModel: 'openai/gpt-4o-mini',\n    providers: { openai: true },\n  },\n",
  },
  anthropic: {
    label: 'Anthropic',
    env: ['ANTHROPIC_API_KEY='],
    snippet:
      "  ai: {\n    defaultModel: 'anthropic/claude-haiku-4-5-20251001',\n    providers: { anthropic: true },\n  },\n",
  },
  google: {
    label: 'Google',
    env: ['GOOGLE_GENERATIVE_AI_API_KEY='],
    snippet:
      "  ai: {\n    defaultModel: 'google/gemini-2.5-flash',\n    providers: { google: true },\n  },\n",
  },
  bedrock: {
    label: 'AWS Bedrock',
    env: ['AWS_REGION=us-east-1', 'AWS_BEARER_TOKEN_BEDROCK='],
    snippet:
      "  ai: {\n    defaultModel: 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',\n    providers: { bedrock: { region: 'us-east-1' } },\n  },\n",
  },
};

export function applyAI(dest: string, provider: AIProvider): void {
  const configPath = path.join(dest, 'src', 'frogbot.config.ts');
  let config = fs.readFileSync(configPath, 'utf8');

  if (provider === 'none') {
    for (const name of [
      'generalImport',
      'toolsImport',
      'assistantImport',
      'tools',
      'ai',
      'agents',
    ] as const) {
      config = replaceOnce(config, CONFIG_ANCHORS[name], '', configPath, name);
    }

    fs.rmSync(path.join(dest, 'src', 'agents'), { recursive: true, force: true });
  } else {
    config = replaceOnce(
      config,
      CONFIG_ANCHORS.ai,
      AI_PROVIDERS[provider].snippet,
      configPath,
      'ai',
    );
  }

  fs.writeFileSync(configPath, config);
}

export function providerEnv(provider: AIProvider): string[] {
  return provider === 'none' ? [] : AI_PROVIDERS[provider].env;
}
