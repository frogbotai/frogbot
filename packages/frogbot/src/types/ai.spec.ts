import { describe, expectTypeOf, it } from 'vitest';

import type { AgentConfig, AgentModelId } from './agent.js';
import type { BedrockProviderEntry, BuiltInProviderEntry, ModelId } from './ai.js';
import type { CatalogModelId } from '../ai/generated.js';
import type { FrogbotTypes } from './generated.js';

describe('AI config types', () => {
  it('accepts an environment apiKey for a built-in provider', () => {
    expectTypeOf<{ apiKey: string | undefined }>().toMatchTypeOf<BuiltInProviderEntry>();
  });

  it('accepts omitted API keys and ambient Bedrock credentials', () => {
    expectTypeOf<{}>().toMatchTypeOf<BuiltInProviderEntry>();
    expectTypeOf<{}>().toMatchTypeOf<BedrockProviderEntry>();
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
