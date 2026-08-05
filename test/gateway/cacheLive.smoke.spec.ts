import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { buildProviderRegistry, type ProviderConfigMap } from '../../packages/gateway/src/providers/registry.js';

const RUN_E2E = process.env.RUN_E2E === '1';

const cases = [
  {
    name: 'anthropic',
    enabled: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.E2E_MODEL_ANTHROPIC_CACHE ?? 'claude-sonnet-4-20250514',
    config: () => ({ anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! } }),
  },
  {
    name: 'anthropic-aws',
    enabled: Boolean(process.env.ANTHROPIC_AWS_API_KEY && process.env.ANTHROPIC_AWS_WORKSPACE_ID),
    model: process.env.E2E_MODEL_ANTHROPIC_AWS_CACHE ?? 'claude-sonnet-4-20250514',
    config: () => ({
      'anthropic-aws': {
        apiKey: process.env.ANTHROPIC_AWS_API_KEY!,
        workspaceId: process.env.ANTHROPIC_AWS_WORKSPACE_ID!,
        region: process.env.AWS_REGION ?? 'us-east-1',
      },
    }),
  },
  {
    name: 'amazon-bedrock',
    enabled: Boolean(process.env.AWS_BEARER_TOKEN_BEDROCK || (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)),
    model: process.env.E2E_MODEL_BEDROCK_CACHE ?? 'anthropic.claude-sonnet-4-20250514-v1:0',
    config: () => ({
      'amazon-bedrock': process.env.AWS_BEARER_TOKEN_BEDROCK
        ? { apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK, region: process.env.AWS_REGION ?? 'us-east-1' }
        : {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            sessionToken: process.env.AWS_SESSION_TOKEN,
            region: process.env.AWS_REGION ?? 'us-east-1',
          },
    }),
  },
  {
    name: 'openai',
    enabled: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.E2E_MODEL_OPENAI_CACHE ?? 'gpt-4o-mini',
    config: () => ({ openai: { apiKey: process.env.OPENAI_API_KEY! } }),
  },
] as const;

for (const testCase of cases) {
  describe.skipIf(!RUN_E2E || !testCase.enabled)(`live cache smoke - ${testCase.name}`, () => {
    it('accepts a cache-marked request and returns cache usage', async () => {
      const registry = buildProviderRegistry(testCase.config() as ProviderConfigMap);
      const app = createApp({ registry });
      const response = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: `${testCase.name}/${testCase.model}`,
          max_tokens: 16,
          cache_control: { type: 'ephemeral' },
          messages: [{ role: 'user', content: 'cache smoke '.repeat(400) }],
        }),
      });
      const body = await response.json() as Record<string, any>;

      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.usage?.prompt_tokens_details).toEqual(expect.objectContaining({ cached_tokens: expect.any(Number) }));
    }, 120_000);
  });
}
