import {
  type AnthropicAwsProvider,
  type AnthropicAwsProviderSettings,
  createAnthropicAws,
} from '@ai-sdk/anthropic-aws';

import type { ProviderDefinition } from '../types.js';

export type AnthropicAwsConfig = Omit<
  AnthropicAwsProviderSettings,
  'fetch' | 'generateId' | 'credentialProvider'
>;

export const anthropicAwsProvider = {
  name: 'anthropic-aws',
  envVars: [
    'ANTHROPIC_AWS_API_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'AWS_SESSION_TOKEN',
    'ANTHROPIC_AWS_WORKSPACE_ID',
  ],
  fromEnv: (env) => {
    const workspaceId = env.ANTHROPIC_AWS_WORKSPACE_ID;

    if (env.ANTHROPIC_AWS_API_KEY) {
      return {
        apiKey: env.ANTHROPIC_AWS_API_KEY,
        ...(env.AWS_REGION && { region: env.AWS_REGION }),
        ...(workspaceId && { workspaceId }),
      };
    }

    const accessKeyId = env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
    const region = env.AWS_REGION;

    if (!accessKeyId || !secretAccessKey || !region) return undefined;

    return {
      accessKeyId,
      secretAccessKey,
      region,
      ...(env.AWS_SESSION_TOKEN && { sessionToken: env.AWS_SESSION_TOKEN }),
      ...(workspaceId && { workspaceId }),
    };
  },
  build: (cfg) => createAnthropicAws(cfg),
} satisfies ProviderDefinition<'anthropic-aws', AnthropicAwsConfig, AnthropicAwsProvider>;
