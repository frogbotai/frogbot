import { describe, expectTypeOf, it } from 'vitest';

import type { AgentConfig, AgentModelId } from './agent.js';
import type { BedrockProviderEntry, BuiltInProviderEntry, ModelId, ProviderConfig } from './ai.js';
import type { CatalogModelId } from '../ai/generated.js';
import type { FrogbotTypes } from './generated.js';

describe('AI config types', () => {
  it('accepts true or an explicit apiKey for built-in providers', () => {
    expectTypeOf<true>().toMatchTypeOf<ProviderConfig['openai']>();
    expectTypeOf<{}>().not.toMatchTypeOf<ProviderConfig['openai']>();
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
  });

  it('uses the catalog as the pre-generation agent model fallback', () => {
    expectTypeOf<FrogbotTypes['models']>().toEqualTypeOf<CatalogModelId>();
    expectTypeOf<'openai/gpt-4o'>().toMatchTypeOf<AgentModelId>();
    expectTypeOf<'anthropic/claude-sonnet-4-5'>().toMatchTypeOf<AgentConfig['model']>();
  });

  it('allows custom and future agent models without narrowing operation models', () => {
    expectTypeOf<'internal/chat-v2'>().toMatchTypeOf<AgentModelId>();
    expectTypeOf<'future/model'>().toMatchTypeOf<AgentConfig['model']>();
    expectTypeOf<ModelId>().toEqualTypeOf<import('./ai.js').BaseAIOpts['model']>();
  });
});
