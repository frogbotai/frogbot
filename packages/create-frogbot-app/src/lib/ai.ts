import fs from 'node:fs';
import path from 'node:path';

import type { AIProvider } from '../types.js';
import { CONFIG_ANCHORS, replaceOnce } from './anchors.js';

// Default models are cheap, current, and exercised by the live suite
// (test/gateway/live/matrix.ts), so a fresh project's first chat works.
export const AI_PROVIDERS: Record<
  Exclude<AIProvider, 'none'>,
  {
    /** Env var that holds the credential; the CLI prompts for it. */
    keyEnv: string;
    /** Extra non-secret env lines written to `.env` and `.env.example`. */
    env: string[];
    label: string;
    hint?: string;
    snippet: string;
  }
> = {
  openai: {
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    env: [],
    snippet: CONFIG_ANCHORS.ai,
  },
  anthropic: {
    label: 'Anthropic',
    keyEnv: 'ANTHROPIC_API_KEY',
    env: [],
    snippet:
      "  ai: {\n    defaultModel: 'anthropic/claude-haiku-4-5',\n    providers: { anthropic: true },\n  },\n",
  },
  google: {
    label: 'Google Gemini',
    keyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
    env: [],
    snippet:
      "  ai: {\n    defaultModel: 'google/gemini-3.5-flash',\n    providers: { google: true },\n  },\n",
  },
  bedrock: {
    label: 'AWS Bedrock',
    hint: 'Bedrock API key, or leave blank and set AWS_PROFILE',
    keyEnv: 'AWS_BEARER_TOKEN_BEDROCK',
    env: ['AWS_REGION=us-east-1'],
    snippet:
      "  ai: {\n    defaultModel: 'bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0',\n    providers: { bedrock: { region: process.env.AWS_REGION || 'us-east-1' } },\n  },\n",
  },
  zen: {
    label: 'opencode Zen',
    hint: 'needs a paid Zen API key',
    keyEnv: 'OPENCODE_API_KEY',
    env: [],
    snippet:
      "  ai: {\n    defaultModel: 'zen/big-pickle',\n    providers: {\n      zen: {\n        type: 'openai-compatible',\n        baseUrl: 'https://opencode.ai/zen/v1',\n        apiKey: process.env.OPENCODE_API_KEY,\n        models: [{ id: 'big-pickle', mode: 'chat' }],\n      },\n    },\n  },\n",
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

/** Env lines for the provider; the key line is left empty for `.env.example`. */
export function providerEnv(provider: AIProvider): string[] {
  if (provider === 'none') return [];
  const { env, keyEnv } = AI_PROVIDERS[provider];
  return [`${keyEnv}=`, ...env];
}

export function providerKeyEnv(provider: AIProvider): string | undefined {
  return provider === 'none' ? undefined : AI_PROVIDERS[provider].keyEnv;
}
