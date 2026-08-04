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
  type AmazonBedrockProvider,
  type AmazonBedrockProviderSettings,
  createAmazonBedrock,
} from '@ai-sdk/amazon-bedrock';
import {
  type BedrockMantleProvider,
  createBedrockMantle,
} from '@ai-sdk/amazon-bedrock/mantle';

import { readEnv } from '../../shared/runtimeDetection.js';
import { DEFAULT_MODEL_CATALOG } from '../catalog.data.js';
import type { ProviderDefinition } from '../types.js';

export type BedrockConfig = Omit<AmazonBedrockProviderSettings, 'fetch' | 'generateId'>;

function hasExplicitBedrockAuth(cfg: BedrockConfig): boolean {
  return !!(
    cfg.apiKey ||
    readEnv('AWS_BEARER_TOKEN_BEDROCK') ||
    cfg.credentialProvider ||
    (cfg.accessKeyId && cfg.secretAccessKey) ||
    (readEnv('AWS_ACCESS_KEY_ID') && readEnv('AWS_SECRET_ACCESS_KEY'))
  );
}

export const bedrockProvider: ProviderDefinition<
  'amazon-bedrock',
  BedrockConfig,
  AmazonBedrockProvider
> = {
  name: 'amazon-bedrock',
  envVars: [
    'AWS_BEARER_TOKEN_BEDROCK',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'AWS_SESSION_TOKEN',
    'AWS_PROFILE',
    'AWS_ROLE_ARN',
    'AWS_WEB_IDENTITY_TOKEN_FILE',
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

    if (accessKeyId && secretAccessKey && region) {
      return {
        accessKeyId,
        secretAccessKey,
        region,
        ...(env.AWS_SESSION_TOKEN && { sessionToken: env.AWS_SESSION_TOKEN }),
      };
    }

    if (env.AWS_PROFILE || (env.AWS_ROLE_ARN && env.AWS_WEB_IDENTITY_TOKEN_FILE)) {
      return { region: env.AWS_REGION ?? 'us-east-1' };
    }

    return undefined;
  },
  build: (cfg) => {
    let chain: AmazonBedrockProviderSettings['credentialProvider'];
    const settings = hasExplicitBedrockAuth(cfg)
      ? cfg
      : {
          ...cfg,
          credentialProvider: async () => {
            if (!chain) {
              const packageName = ['@aws-sdk', 'credential-providers'].join('/');
              const module = (await import(packageName).catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(
                  `Bedrock default credential resolution requires the optional @aws-sdk/credential-providers peer dependency: ${message}`,
                );
              })) as {
                fromNodeProviderChain: () => NonNullable<
                  AmazonBedrockProviderSettings['credentialProvider']
                >;
              };
              chain = module.fromNodeProviderChain();
            }
            return chain();
          },
        };
    const standard = createAmazonBedrock(settings);
    const mantleProviders = new Map<string, BedrockMantleProvider>();
    const languageModel: AmazonBedrockProvider['languageModel'] = (modelId) => {
      const sdk = DEFAULT_MODEL_CATALOG.get(`amazon-bedrock/${modelId}`)?.sdk;
      if (sdk?.npm !== '@ai-sdk/amazon-bedrock/mantle') {
        return standard.languageModel(modelId);
      }

      const baseURL = sdk.api?.replace('${AWS_REGION}', settings.region ?? 'us-east-1');
      const key = baseURL ?? '';
      let mantle = mantleProviders.get(key);
      if (!mantle) {
        mantle = createBedrockMantle({ ...settings, baseURL });
        mantleProviders.set(key, mantle);
      }
      return sdk.shape === 'chat' ? mantle.chat(modelId) : mantle.responses(modelId);
    };
    const provider = ((modelId: string) => languageModel(modelId)) as AmazonBedrockProvider;
    return Object.assign(provider, standard, { languageModel });
  },
};
