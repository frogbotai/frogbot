// Provider definition: Anthropic on AWS (Claude Platform on AWS).
//
// Uses `@ai-sdk/anthropic-aws`, which speaks the native Anthropic Messages API
// hosted in AWS — NOT the Bedrock Converse API used by `@ai-sdk/amazon-bedrock`.
//
// Supports two auth modes:
//   1. API key (`ANTHROPIC_AWS_API_KEY`) — sent via the `x-api-key` header.
//   2. SigV4 (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` +
//      optional `AWS_SESSION_TOKEN`).
//
// `ANTHROPIC_AWS_WORKSPACE_ID` scopes requests to an Anthropic workspace via
// the `anthropic-workspace-id` header and is forwarded when set.
//
// Separate from the full `bedrock` provider because:
//   1. Anthropic-specific features (thinking, cache_control) map natively
//      through the Anthropic wire format.
//   2. The canonical ID prefix is `anthropic-aws/` rather than `amazon-bedrock/`.

import {
  createAnthropicAws,
  type AnthropicAwsProvider,
  type AnthropicAwsProviderSettings,
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

    // API key mode — provider-named credential, highest priority.
    if (env.ANTHROPIC_AWS_API_KEY) {
      return {
        apiKey: env.ANTHROPIC_AWS_API_KEY,
        ...(env.AWS_REGION && { region: env.AWS_REGION }),
        ...(workspaceId && { workspaceId }),
      };
    }

    // SigV4 mode — requires all three core credentials. Unlike bedrock, there
    // is no silent region default: the SDK requires AWS_REGION in SigV4 mode.
    const accessKeyId = env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
    const region = env.AWS_REGION;

    // Missing any of the three (none at all, or a partial set) — skip
    // provider. Discovery never throws; partial env is ubiquitous (G41).
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
