// Provider definition: Amazon Bedrock.
//
// Supports two auth modes:
//   1. Bearer token (`AWS_BEARER_TOKEN_BEDROCK`) — simplest path.
//   2. SigV4 (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` + optional `AWS_SESSION_TOKEN`).
//
// Partial SigV4 creds (e.g. only `AWS_REGION`, set on virtually every AWS
// runtime) skip the provider — per the `fromEnv` contract, discovery never
// throws (G41).

import {
  createAmazonBedrock,
  type AmazonBedrockProvider,
  type AmazonBedrockProviderSettings,
} from '@ai-sdk/amazon-bedrock';

import type { ProviderDefinition } from '../types.js';

export type BedrockConfig = Omit<AmazonBedrockProviderSettings, 'fetch' | 'generateId'>;

export const bedrockProvider = {
  name: 'amazon-bedrock',
  envVars: [
    'AWS_BEARER_TOKEN_BEDROCK',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'AWS_SESSION_TOKEN',
  ],
  fromEnv: (env) => {
    // Bearer token mode — single env var, highest priority.
    if (env.AWS_BEARER_TOKEN_BEDROCK) {
      return {
        apiKey: env.AWS_BEARER_TOKEN_BEDROCK,
        region: env.AWS_REGION ?? 'us-east-1',
      };
    }

    // SigV4 mode — requires all three core credentials.
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
    };
  },
  build: (cfg) => createAmazonBedrock(cfg),
} satisfies ProviderDefinition<'amazon-bedrock', BedrockConfig, AmazonBedrockProvider>;
