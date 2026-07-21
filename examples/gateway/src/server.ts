import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createGateway } from '@frogbotai/gateway';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

function bedrockFromEnv() {
  const { AWS_BEARER_TOKEN_BEDROCK, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_SESSION_TOKEN } =
    process.env;
  if (AWS_BEARER_TOKEN_BEDROCK) {
    return { apiKey: AWS_BEARER_TOKEN_BEDROCK, region: AWS_REGION ?? 'us-east-1' };
  }
  if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_REGION) {
    return {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: AWS_REGION,
      ...(AWS_SESSION_TOKEN ? { sessionToken: AWS_SESSION_TOKEN } : {}),
    };
  }
  return undefined;
}

const bedrock = bedrockFromEnv();
const { ANTHROPIC_API_KEY, OPENAI_API_KEY, FIREWORKS_API_KEY } = process.env;

const gateway = createGateway({
  providers: {
    ...(bedrock ? { 'amazon-bedrock': bedrock } : {}),
    ...(ANTHROPIC_API_KEY ? { anthropic: { apiKey: ANTHROPIC_API_KEY } } : {}),
    ...(OPENAI_API_KEY ? { openai: { apiKey: OPENAI_API_KEY } } : {}),
    ...(FIREWORKS_API_KEY ? { fireworks: { apiKey: FIREWORKS_API_KEY } } : {}),
    ollama: {
      baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
    },
  },
  hooks: {
    afterOperation: [
      ({ operation, model, usage, durationMs }) => {
        const reasoning = usage?.reasoningTokens ? ` reasoningTokens=${usage.reasoningTokens}` : '';
        console.log(
          `[usage] ${operation} model=${model} totalTokens=${usage?.totalTokens ?? 0}${reasoning} durationMs=${Math.round(durationMs)}`,
        );
      },
    ],
  },
});

const activeProviders = [
  bedrock ? 'amazon-bedrock' : null,
  ANTHROPIC_API_KEY ? 'anthropic' : null,
  OPENAI_API_KEY ? 'openai' : null,
  FIREWORKS_API_KEY ? 'fireworks' : null,
  'ollama',
].filter(Boolean);

const port = Number(process.env.PORT ?? 3939);

serve({ fetch: gateway.handler, port }, (info) => {
  console.log(`gateway listening on http://localhost:${info.port}/v1`);
  console.log(`providers: ${activeProviders.join(', ')}`);
});
