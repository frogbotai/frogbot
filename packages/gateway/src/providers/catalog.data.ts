// Default model catalog — a minimal, curated set of well-known models used
// for `/v1/models` discovery. Deliberately small (OpenAI + Anthropic to
// start): unlisted models still route normally if the provider supports
// them; the catalog only powers discovery, validation, and display.

import { defineModelCatalog, presetFor, type ModelCatalog } from './catalog.js';

const openaiModel = presetFor<'openai/gpt-4o' | 'openai/gpt-4o-mini'>();
const anthropicModel = presetFor<
  'anthropic/claude-sonnet-4-20250514' | 'anthropic/claude-opus-4-20250514'
>();

export const DEFAULT_MODEL_CATALOG: ModelCatalog = defineModelCatalog(
  openaiModel('openai/gpt-4o', {
    name: 'GPT-4o',
    created: '2024-05-13',
    knowledge: '2023-10-01',
    modalities: { input: ['text', 'image'], output: ['text'] },
    operations: ['chat.completions', 'responses'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: { input: 128_000, output: 16_384 },
    providers: ['openai'],
  }),
  openaiModel('openai/gpt-4o-mini', {
    name: 'GPT-4o mini',
    created: '2024-07-18',
    knowledge: '2023-10-01',
    modalities: { input: ['text', 'image'], output: ['text'] },
    operations: ['chat.completions', 'responses'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: { input: 128_000, output: 16_384 },
    providers: ['openai'],
  }),
  anthropicModel('anthropic/claude-sonnet-4-20250514', {
    name: 'Claude Sonnet 4',
    created: '2025-05-14',
    knowledge: '2025-03-01',
    modalities: { input: ['text', 'image'], output: ['text'] },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: { input: 200_000, output: 64_000 },
    providers: ['anthropic'],
  }),
  anthropicModel('anthropic/claude-opus-4-20250514', {
    name: 'Claude Opus 4',
    created: '2025-05-14',
    knowledge: '2025-03-01',
    modalities: { input: ['text', 'image'], output: ['text'] },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: { input: 200_000, output: 32_000 },
    providers: ['anthropic'],
  }),
);
