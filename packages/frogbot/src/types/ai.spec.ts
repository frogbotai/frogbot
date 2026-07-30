import { describe, expectTypeOf, it } from 'vitest';

import type { CatalogModelId } from '../ai/generated.js';
import type { AgentConfig, AgentModelId } from './agent.js';
import type { BedrockProviderEntry, BuiltInProviderEntry, ModelId, ProviderConfig } from './ai.js';
import type { FrogbotTypes } from './generated.js';

describe('AI config types', () => {
  it('accepts true or an explicit apiKey for built-in providers', () => {
    expectTypeOf<true>().toMatchTypeOf<ProviderConfig['openai']>();
    expectTypeOf<Record<string, never>>().not.toMatchTypeOf<ProviderConfig['openai']>();
    expectTypeOf({ apiKey: process.env.TEST_KEY }).toMatchTypeOf<ProviderConfig['openai']>();
    expectTypeOf<{ apiKey: string | undefined }>().toMatchTypeOf<BuiltInProviderEntry>();
    expectTypeOf<false>().not.toMatchTypeOf<ProviderConfig['openai']>();
  });

  it('accepts ambient or explicit Bedrock credentials', () => {
    expectTypeOf<true>().toMatchTypeOf<ProviderConfig['bedrock']>();
    expectTypeOf<{ apiKey: string }>().not.toMatchTypeOf<ProviderConfig['bedrock']>();
    expectTypeOf<{ region: string }>().toMatchTypeOf<BedrockProviderEntry>();
    expectTypeOf<{
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    }>().toMatchTypeOf<BedrockProviderEntry>();
    const credentialProviderEntry: BedrockProviderEntry = {
      credentialProvider: () => Promise.resolve({ accessKeyId: 'ak', secretAccessKey: 'sk' }),
    };
    expectTypeOf(credentialProviderEntry).toMatchTypeOf<BedrockProviderEntry>();
    expectTypeOf<{
      credentialProvider: () => Promise<{ accessKeyId: string; secretAccessKey: string }>;
      accessKeyId: string;
      secretAccessKey: string;
    }>().not.toMatchTypeOf<BedrockProviderEntry>();
  });

  it('uses the catalog as the pre-generation agent model fallback', () => {
    expectTypeOf<FrogbotTypes['models']>().toEqualTypeOf<CatalogModelId>();
    expectTypeOf<ModelId>().toEqualTypeOf<CatalogModelId>();
    expectTypeOf<'openai/gpt-4o'>().toMatchTypeOf<AgentModelId>();
    expectTypeOf<'anthropic/claude-sonnet-4-5'>().toMatchTypeOf<AgentConfig['model']>();
  });

  it('rejects arbitrary model strings', () => {
    expectTypeOf<'internal/chat-v2'>().not.toMatchTypeOf<AgentModelId>();
    expectTypeOf<'future/model'>().not.toMatchTypeOf<AgentConfig['model']>();
    expectTypeOf<'future/model'>().not.toMatchTypeOf<ModelId>();
    expectTypeOf<ModelId>().toEqualTypeOf<import('./ai.js').BaseAIOpts['model']>();
  });
});
