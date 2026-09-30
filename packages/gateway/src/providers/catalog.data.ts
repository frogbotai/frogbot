import { defineModelCatalog, type ModelCatalog, presetFor } from './catalog.js';

const model = presetFor<string>();

export const DEFAULT_MODEL_CATALOG: ModelCatalog = defineModelCatalog(
  model('anthropic/claude-fable-5', {
    name: 'Claude Fable 5',
    created: '2026-06-07',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-fable-5-1', {
    name: 'Claude Fable 5.1',
    created: '2026-09-01',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 0.25,
      cache_write: 12.5,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-haiku-4-5', {
    name: 'Claude Haiku 4.5 (latest)',
    created: '2025-10-15',
    knowledge: '2025-02-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 1,
      output: 5,
      cache_read: 0.1,
      cache_write: 1.25,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-haiku-4-5-20251001', {
    name: 'Claude Haiku 4.5',
    created: '2025-10-15',
    knowledge: '2025-02-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 1,
      output: 5,
      cache_read: 0.1,
      cache_write: 1.25,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-opus-4-5', {
    name: 'Claude Opus 4.5 (latest)',
    created: '2025-11-24',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-opus-4-5-20251101', {
    name: 'Claude Opus 4.5',
    created: '2025-11-24',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-opus-4-6', {
    name: 'Claude Opus 4.6',
    created: '2026-02-04',
    knowledge: '2025-05-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-opus-4-7', {
    name: 'Claude Opus 4.7',
    created: '2026-04-14',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-opus-4-8', {
    name: 'Claude Opus 4.8',
    created: '2026-05-28',
    knowledge: '2026-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-opus-5', {
    name: 'Claude Opus 5',
    created: '2026-07-24',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-opus-5-5', {
    name: 'Claude Opus 5.5',
    created: '2026-09-22',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.2,
      cache_write: 5,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-sonnet-4-5', {
    name: 'Claude Sonnet 4.5 (latest)',
    created: '2025-09-29',
    knowledge: '2025-07-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-sonnet-4-5-20250929', {
    name: 'Claude Sonnet 4.5',
    created: '2025-09-29',
    knowledge: '2025-07-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-sonnet-4-6', {
    name: 'Claude Sonnet 4.6',
    created: '2026-02-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-sonnet-5', {
    name: 'Claude Sonnet 5',
    created: '2026-06-29',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['anthropic'],
  }),
  model('anthropic/claude-sonnet-5-5', {
    name: 'Claude Sonnet 5.5',
    created: '2026-09-28',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['anthropic'],
  }),
  model('bedrock/amazon.nova-lite-v1:0', {
    name: 'Nova Lite',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 10000,
    },
    cost: {
      input: 0.06,
      output: 0.24,
      cache_read: 0.015,
      cache_write: 0.06,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/amazon.nova-micro-v1:0', {
    name: 'Nova Micro',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 10000,
    },
    cost: {
      input: 0.035,
      output: 0.14,
      cache_read: 0.00875,
      cache_write: 0.035,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/amazon.nova-pro-v1:0', {
    name: 'Nova Pro',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 10000,
    },
    cost: {
      input: 0.8,
      output: 3.2,
      cache_read: 0.2,
      cache_write: 0.8,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-fable-5', {
    name: 'Claude Fable 5',
    created: '2026-06-09',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-fable-5-1', {
    name: 'Claude Fable 5.1',
    created: '2026-09-01',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 0.25,
      cache_write: 12.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-haiku-4-5-20251001-v1:0', {
    name: 'Claude Haiku 4.5',
    created: '2025-10-15',
    knowledge: '2025-02-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 1,
      output: 5,
      cache_read: 0.1,
      cache_write: 1.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-opus-4-5-20251101-v1:0', {
    name: 'Claude Opus 4.5',
    created: '2025-11-01',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-opus-4-6-v1', {
    name: 'Claude Opus 4.6',
    created: '2026-02-05',
    knowledge: '2025-05-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-opus-4-7', {
    name: 'Claude Opus 4.7',
    created: '2026-04-16',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-opus-4-8', {
    name: 'Claude Opus 4.8',
    created: '2026-05-28',
    knowledge: '2026-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-opus-5', {
    name: 'Claude Opus 5',
    created: '2026-07-24',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-opus-5-5', {
    name: 'Claude Opus 5.5',
    created: '2026-09-22',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.2,
      cache_write: 5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0', {
    name: 'Claude Sonnet 4.5',
    created: '2025-09-29',
    knowledge: '2025-07-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-sonnet-4-6', {
    name: 'Claude Sonnet 4.6',
    created: '2026-02-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 3.3,
      output: 16.5,
      cache_read: 0.33,
      cache_write: 4.125,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-sonnet-5', {
    name: 'Claude Sonnet 5',
    created: '2026-06-30',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/anthropic.claude-sonnet-5-5', {
    name: 'Claude Sonnet 5.5',
    created: '2026-09-28',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/apac.amazon.nova-lite-v1:0', {
    name: 'Nova Lite (APAC)',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 10000,
    },
    cost: {
      input: 0.063,
      output: 0.252,
      cache_read: 0.01575,
      cache_write: 0.063,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/apac.amazon.nova-micro-v1:0', {
    name: 'Nova Micro (APAC)',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 10000,
    },
    cost: {
      input: 0.037,
      output: 0.148,
      cache_read: 0.00925,
      cache_write: 0.037,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/apac.amazon.nova-pro-v1:0', {
    name: 'Nova Pro (APAC)',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 10000,
    },
    cost: {
      input: 0.84,
      output: 3.36,
      cache_read: 0.21,
      cache_write: 0.84,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/au.anthropic.claude-haiku-4-5-20251001-v1:0', {
    name: 'Claude Haiku 4.5 (AU)',
    created: '2025-10-15',
    knowledge: '2025-02-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 1.1,
      output: 5.5,
      cache_read: 0.11,
      cache_write: 1.375,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/au.anthropic.claude-opus-4-6-v1', {
    name: 'AU Anthropic Claude Opus 4.6',
    created: '2026-02-05',
    knowledge: '2025-05-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/au.anthropic.claude-opus-4-7', {
    name: 'Claude Opus 4.7 (AU)',
    created: '2026-04-16',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/au.anthropic.claude-opus-4-8', {
    name: 'Claude Opus 4.8 (AU)',
    created: '2026-05-28',
    knowledge: '2026-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/au.anthropic.claude-opus-5', {
    name: 'Claude Opus 5 (AU)',
    created: '2026-07-24',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/au.anthropic.claude-opus-5-5', {
    name: 'Claude Opus 5.5 (AU)',
    created: '2026-09-22',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 4.4,
      output: 22,
      cache_read: 0.22,
      cache_write: 5.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/au.anthropic.claude-sonnet-4-5-20250929-v1:0', {
    name: 'Claude Sonnet 4.5 (AU)',
    created: '2025-09-29',
    knowledge: '2025-07-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 3.3,
      output: 16.5,
      cache_read: 0.33,
      cache_write: 4.125,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/au.anthropic.claude-sonnet-4-6', {
    name: 'AU Anthropic Claude Sonnet 4.6',
    created: '2026-02-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 3.3,
      output: 16.5,
      cache_read: 0.33,
      cache_write: 4.125,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/au.anthropic.claude-sonnet-5', {
    name: 'Claude Sonnet 5 (AU)',
    created: '2026-06-30',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2.2,
      output: 11,
      cache_read: 0.22,
      cache_write: 2.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/ca.amazon.nova-lite-v1:0', {
    name: 'Nova Lite (CA)',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 10000,
    },
    cost: {
      input: 0.064,
      output: 0.256,
      cache_read: 0.016,
      cache_write: 0.064,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/deepseek.r1-v1:0', {
    name: 'DeepSeek-R1',
    created: '2025-01-20',
    knowledge: '2024-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 32768,
    },
    cost: {
      input: 1.35,
      output: 5.4,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/deepseek.v3-v1:0', {
    name: 'DeepSeek-V3.1',
    created: '2025-08-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 163840,
      output: 81920,
    },
    cost: {
      input: 0.58,
      output: 1.68,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/deepseek.v3.2', {
    name: 'DeepSeek V3.2',
    created: '2025-12-01',
    knowledge: '2024-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 163840,
      output: 81920,
    },
    cost: {
      input: 0.62,
      output: 1.85,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.amazon.nova-2-lite-v1:0', {
    name: 'Nova 2 Lite (EU)',
    created: '2025-12-02',
    knowledge: '2025-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65535,
    },
    cost: {
      input: 0.374,
      output: 3.157,
      cache_read: 0.0935,
      cache_write: 0.374,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.amazon.nova-lite-v1:0', {
    name: 'Nova Lite (EU)',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 10000,
    },
    cost: {
      input: 0.069,
      output: 0.276,
      cache_read: 0.01725,
      cache_write: 0.069,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.amazon.nova-micro-v1:0', {
    name: 'Nova Micro (EU)',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 10000,
    },
    cost: {
      input: 0.04,
      output: 0.16,
      cache_read: 0.01,
      cache_write: 0.04,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.amazon.nova-pro-v1:0', {
    name: 'Nova Pro (EU)',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 10000,
    },
    cost: {
      input: 0.92,
      output: 3.68,
      cache_read: 0.23,
      cache_write: 0.92,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.anthropic.claude-fable-5', {
    name: 'Claude Fable 5 (EU)',
    created: '2026-06-09',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 11,
      output: 55,
      cache_read: 1.1,
      cache_write: 13.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.anthropic.claude-haiku-4-5-20251001-v1:0', {
    name: 'Claude Haiku 4.5 (EU)',
    created: '2025-10-15',
    knowledge: '2025-02-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 1.1,
      output: 5.5,
      cache_read: 0.11,
      cache_write: 1.375,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.anthropic.claude-opus-4-5-20251101-v1:0', {
    name: 'Claude Opus 4.5 (EU)',
    created: '2025-11-01',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.anthropic.claude-opus-4-6-v1', {
    name: 'Claude Opus 4.6 (EU)',
    created: '2026-02-05',
    knowledge: '2025-05-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.anthropic.claude-opus-4-7', {
    name: 'Claude Opus 4.7 (EU)',
    created: '2026-04-16',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.anthropic.claude-opus-4-8', {
    name: 'Claude Opus 4.8 (EU)',
    created: '2026-05-28',
    knowledge: '2026-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.anthropic.claude-opus-5', {
    name: 'Claude Opus 5 (EU)',
    created: '2026-07-24',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.anthropic.claude-opus-5-5', {
    name: 'Claude Opus 5.5 (EU)',
    created: '2026-09-22',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 4.4,
      output: 22,
      cache_read: 0.22,
      cache_write: 5.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.anthropic.claude-sonnet-4-5-20250929-v1:0', {
    name: 'Claude Sonnet 4.5 (EU)',
    created: '2025-09-29',
    knowledge: '2025-07-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 3.3,
      output: 16.5,
      cache_read: 0.33,
      cache_write: 4.125,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.anthropic.claude-sonnet-4-6', {
    name: 'Claude Sonnet 4.6 (EU)',
    created: '2026-02-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 3.3,
      output: 16.5,
      cache_read: 0.33,
      cache_write: 4.125,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.anthropic.claude-sonnet-5', {
    name: 'Claude Sonnet 5 (EU)',
    created: '2026-06-30',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2.2,
      output: 11,
      cache_read: 0.22,
      cache_write: 2.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/eu.mistral.pixtral-large-2502-v1:0', {
    name: 'Pixtral Large (25.02) (EU)',
    created: '2025-04-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8192,
    },
    cost: {
      input: 2,
      output: 6,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.amazon.nova-2-lite-v1:0', {
    name: 'Nova 2 Lite',
    created: '2024-12-01',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0.33,
      output: 2.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-fable-5', {
    name: 'Claude Fable 5 (Global)',
    created: '2026-06-09',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-fable-5-1', {
    name: 'Claude Fable 5.1 (Global)',
    created: '2026-09-01',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 0.25,
      cache_write: 12.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0', {
    name: 'Claude Haiku 4.5 (Global)',
    created: '2025-10-15',
    knowledge: '2025-02-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 1,
      output: 5,
      cache_read: 0.1,
      cache_write: 1.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-opus-4-5-20251101-v1:0', {
    name: 'Claude Opus 4.5 (Global)',
    created: '2025-11-01',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-opus-4-6-v1', {
    name: 'Claude Opus 4.6 (Global)',
    created: '2026-02-05',
    knowledge: '2025-05-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-opus-4-7', {
    name: 'Claude Opus 4.7 (Global)',
    created: '2026-04-16',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-opus-4-8', {
    name: 'Claude Opus 4.8 (Global)',
    created: '2026-05-28',
    knowledge: '2026-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-opus-5', {
    name: 'Claude Opus 5 (Global)',
    created: '2026-07-24',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-opus-5-5', {
    name: 'Claude Opus 5.5 (Global)',
    created: '2026-09-22',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.2,
      cache_write: 5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-sonnet-4-5-20250929-v1:0', {
    name: 'Claude Sonnet 4.5 (Global)',
    created: '2025-09-29',
    knowledge: '2025-07-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-sonnet-4-6', {
    name: 'Claude Sonnet 4.6 (Global)',
    created: '2026-02-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-sonnet-5', {
    name: 'Claude Sonnet 5 (Global)',
    created: '2026-06-30',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.anthropic.claude-sonnet-5-5', {
    name: 'Claude Sonnet 5.5 (Global)',
    created: '2026-09-28',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.moonshotai.kimi-k3', {
    name: 'Kimi K3 (Global)',
    created: '2026-07-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 128000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.openai.gpt-5.6-luna', {
    name: 'GPT-5.6 Luna (Global)',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.2,
      output: 1.2,
      cache_read: 0.02,
      cache_write: 0.25,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.openai.gpt-5.6-sol', {
    name: 'GPT-5.6 Sol (Global)',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.4,
      cache_write: 5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.openai.gpt-5.6-terra', {
    name: 'GPT-5.6 Terra (Global)',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.openai.gpt-6-astra', {
    name: 'GPT-6 Astra (Global)',
    created: '2026-09-04',
    knowledge: '2026-04-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.openai.gpt-6-luna', {
    name: 'GPT-6 Luna (Global)',
    created: '2026-09-22',
    knowledge: '2026-05-18',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.1,
      output: 0.5,
      cache_read: 0.01,
      cache_write: 0.125,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.openai.gpt-6-sol', {
    name: 'GPT-6 Sol (Global)',
    created: '2026-09-22',
    knowledge: '2026-04-20',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.xai.grok-4.6', {
    name: 'Grok 4.6 (Global)',
    created: '2026-08-12',
    knowledge: '2026-02-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 500000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/global.xai.grok-4.7', {
    name: 'Grok 4.7 (Global)',
    created: '2026-09-21',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 500000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/google.gemma-3-12b-it', {
    name: 'Gemma 3 12B IT',
    created: '2025-03-12',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    cost: {
      input: 0.09,
      output: 0.29,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/google.gemma-3-27b-it', {
    name: 'Gemma 3 27B IT',
    created: '2025-03-12',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    cost: {
      input: 0.23,
      output: 0.38,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/google.gemma-3-4b-it', {
    name: 'Gemma 3 4B IT',
    created: '2025-03-12',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 4096,
    },
    cost: {
      input: 0.04,
      output: 0.08,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/google.gemma-4-26b-a4b', {
    name: 'Gemma 4 26B A4B IT',
    created: '2026-04-02',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.13,
      output: 0.4,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/google.gemma-4-31b', {
    name: 'Gemma 4 31B IT',
    created: '2026-04-02',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.14,
      output: 0.4,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/google.gemma-4-e2b', {
    name: 'Gemma 4 E2B IT',
    created: '2026-04-02',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    cost: {
      input: 0.04,
      output: 0.08,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/in.openai.gpt-5.6-luna', {
    name: 'GPT-5.6 Luna (India)',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.22,
      output: 1.32,
      cache_read: 0.022,
      cache_write: 0.275,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/in.openai.gpt-5.6-terra', {
    name: 'GPT-5.6 Terra (India)',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2.2,
      output: 13.2,
      cache_read: 0.22,
      cache_write: 2.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/jp.amazon.nova-2-lite-v1:0', {
    name: 'Nova 2 Lite (JP)',
    created: '2025-12-02',
    knowledge: '2025-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65535,
    },
    cost: {
      input: 0.396,
      output: 3.311,
      cache_read: 0.099,
      cache_write: 0.396,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/jp.anthropic.claude-haiku-4-5-20251001-v1:0', {
    name: 'Claude Haiku 4.5 (JP)',
    created: '2025-10-15',
    knowledge: '2025-02-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 1.1,
      output: 5.5,
      cache_read: 0.11,
      cache_write: 1.375,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/jp.anthropic.claude-opus-4-7', {
    name: 'Claude Opus 4.7 (JP)',
    created: '2026-04-16',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/jp.anthropic.claude-opus-4-8', {
    name: 'Claude Opus 4.8 (JP)',
    created: '2026-05-28',
    knowledge: '2026-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/jp.anthropic.claude-opus-5', {
    name: 'Claude Opus 5 (JP)',
    created: '2026-07-24',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/jp.anthropic.claude-opus-5-5', {
    name: 'Claude Opus 5.5 (JP)',
    created: '2026-09-22',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 4.4,
      output: 22,
      cache_read: 0.22,
      cache_write: 5.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/jp.anthropic.claude-sonnet-4-5-20250929-v1:0', {
    name: 'Claude Sonnet 4.5 (JP)',
    created: '2025-09-29',
    knowledge: '2025-07-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 3.3,
      output: 16.5,
      cache_read: 0.33,
      cache_write: 4.125,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/jp.anthropic.claude-sonnet-4-6', {
    name: 'Claude Sonnet 4.6 (JP)',
    created: '2026-02-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 3.3,
      output: 16.5,
      cache_read: 0.33,
      cache_write: 4.125,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/jp.anthropic.claude-sonnet-5', {
    name: 'Claude Sonnet 5 (JP)',
    created: '2026-06-30',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2.2,
      output: 11,
      cache_read: 0.22,
      cache_write: 2.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/meta.llama3-1-70b-instruct-v1:0', {
    name: 'Llama 3.1 70B Instruct',
    created: '2024-07-23',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0.72,
      output: 0.72,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/meta.llama4-maverick-17b-instruct-v1:0', {
    name: 'Llama 4 Maverick 17B Instruct',
    created: '2025-04-05',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 8192,
    },
    cost: {
      input: 0.24,
      output: 0.97,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/meta.llama4-scout-17b-instruct-v1:0', {
    name: 'Llama 4 Scout 17B Instruct',
    created: '2025-04-05',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 10000000,
      output: 8192,
    },
    cost: {
      input: 0.17,
      output: 0.66,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/minimax.minimax-m2', {
    name: 'MiniMax-M2',
    created: '2025-10-27',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 204608,
      output: 128000,
    },
    cost: {
      input: 0.3,
      output: 1.2,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/minimax.minimax-m2.1', {
    name: 'MiniMax-M2.1',
    created: '2025-12-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 196608,
      output: 131072,
    },
    cost: {
      input: 0.3,
      output: 1.2,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/minimax.minimax-m2.5', {
    name: 'MiniMax-M2.5',
    created: '2026-02-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 196608,
      output: 98304,
    },
    cost: {
      input: 0.3,
      output: 1.2,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/mistral.devstral-2-123b', {
    name: 'Devstral 2 123B',
    created: '2025-12-09',
    knowledge: '2025-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 8192,
    },
    cost: {
      input: 0.4,
      output: 2,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/mistral.magistral-small-2509', {
    name: 'Magistral Small 1.2',
    created: '2025-09-18',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 40000,
    },
    cost: {
      input: 0.5,
      output: 1.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/mistral.ministral-3-14b-instruct', {
    name: 'Ministral 14B 3.0',
    created: '2025-12-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0.2,
      output: 0.2,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/mistral.ministral-3-3b-instruct', {
    name: 'Ministral 3 3B',
    created: '2025-12-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 8192,
    },
    cost: {
      input: 0.1,
      output: 0.1,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/mistral.ministral-3-8b-instruct', {
    name: 'Ministral 3 8B',
    created: '2025-12-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0.15,
      output: 0.15,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/mistral.mistral-large-3-675b-instruct', {
    name: 'Mistral Large 3',
    created: '2025-12-02',
    knowledge: '2024-11',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 8192,
    },
    cost: {
      input: 0.5,
      output: 1.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/mistral.pixtral-large-2502-v1:0', {
    name: 'Pixtral Large (25.02)',
    created: '2025-04-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8192,
    },
    cost: {
      input: 2,
      output: 6,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/mistral.voxtral-mini-3b-2507', {
    name: 'Voxtral Mini 3B 2507',
    created: '2025-07-15',
    modalities: {
      input: ['text', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 4096,
    },
    cost: {
      input: 0.04,
      output: 0.04,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/mistral.voxtral-small-24b-2507', {
    name: 'Voxtral Small 24B 2507',
    created: '2025-07-15',
    modalities: {
      input: ['text', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 8192,
    },
    cost: {
      input: 0.1,
      output: 0.3,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/moonshot.kimi-k2-thinking', {
    name: 'Kimi K2 Thinking',
    created: '2025-11-06',
    knowledge: '2024-08',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 16000,
    },
    cost: {
      input: 0.6,
      output: 2.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/moonshotai.kimi-k2.5', {
    name: 'Kimi K2.5',
    created: '2026-01-27',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 16384,
    },
    cost: {
      input: 0.6,
      output: 3,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/nvidia.nemotron-nano-12b-v2', {
    name: 'NVIDIA Nemotron Nano 12B v2 VL BF16',
    created: '2025-10-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    cost: {
      input: 0.2,
      output: 0.6,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/nvidia.nemotron-nano-3-30b', {
    name: 'NVIDIA Nemotron Nano 3 30B',
    created: '2025-12-15',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 8192,
    },
    cost: {
      input: 0.06,
      output: 0.24,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/nvidia.nemotron-nano-9b-v2', {
    name: 'NVIDIA Nemotron Nano 9B v2',
    created: '2025-08-18',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    cost: {
      input: 0.06,
      output: 0.23,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/nvidia.nemotron-super-3-120b', {
    name: 'NVIDIA Nemotron 3 Super 120B A12B',
    created: '2026-03-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0.15,
      output: 0.65,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-5.4', {
    name: 'GPT-5.4',
    created: '2026-03-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2.75,
      output: 16.5,
      cache_read: 0.275,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-5.5', {
    name: 'GPT-5.5',
    created: '2026-04-23',
    knowledge: '2025-12-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 33,
      cache_read: 0.55,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-5.6-luna', {
    name: 'GPT-5.6 Luna',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.22,
      output: 1.32,
      cache_read: 0.022,
      cache_write: 0.275,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-5.6-sol', {
    name: 'GPT-5.6 Sol',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 4.4,
      output: 22,
      cache_read: 0.44,
      cache_write: 5.5,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-5.6-terra', {
    name: 'GPT-5.6 Terra',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2.2,
      output: 13.2,
      cache_read: 0.22,
      cache_write: 2.75,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-6-astra', {
    name: 'GPT-6 Astra',
    created: '2026-09-04',
    knowledge: '2026-04-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 11,
      output: 55,
      cache_read: 1.1,
      cache_write: 13.75,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-6-luna', {
    name: 'GPT-6 Luna',
    created: '2026-09-22',
    knowledge: '2026-05-18',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.11,
      output: 0.55,
      cache_read: 0.011,
      cache_write: 0.1375,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-6-sol', {
    name: 'GPT-6 Sol',
    created: '2026-09-22',
    knowledge: '2026-04-20',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2.2,
      output: 11,
      cache_read: 0.22,
      cache_write: 2.75,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-oss-120b', {
    name: 'gpt-oss-120b',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.15,
      output: 0.6,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-oss-120b-1:0', {
    name: 'gpt-oss-120b',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 128000,
    },
    cost: {
      input: 0.15,
      output: 0.6,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-oss-20b', {
    name: 'gpt-oss-20b',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.07,
      output: 0.3,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-oss-20b-1:0', {
    name: 'gpt-oss-20b',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 128000,
    },
    cost: {
      input: 0.07,
      output: 0.3,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-oss-safeguard-120b', {
    name: 'GPT OSS Safeguard 120B',
    created: '2025-10-29',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 0.15,
      output: 0.6,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/openai.gpt-oss-safeguard-20b', {
    name: 'GPT OSS Safeguard 20B',
    created: '2025-10-29',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 0.07,
      output: 0.2,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/qwen.qwen3-235b-a22b-2507-v1:0', {
    name: 'Qwen3 235B-A22B Instruct 2507',
    created: '2025-07-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0.22,
      output: 0.88,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/qwen.qwen3-32b-v1:0', {
    name: 'Qwen3 32B',
    created: '2025-04',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 32768,
      output: 16384,
    },
    cost: {
      input: 0.15,
      output: 0.6,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/qwen.qwen3-coder-30b-a3b-v1:0', {
    name: 'Qwen3-Coder 30B-A3B Instruct',
    created: '2025-07-31',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0.15,
      output: 0.6,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/qwen.qwen3-coder-480b-a35b-v1:0', {
    name: 'Qwen3-Coder 480B-A35B Instruct',
    created: '2025-07-23',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 65536,
    },
    cost: {
      input: 0.45,
      output: 1.8,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/qwen.qwen3-coder-next', {
    name: 'Qwen3 Coder Next',
    created: '2026-02-03',
    knowledge: '2025-09',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.5,
      output: 1.2,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/qwen.qwen3-next-80b-a3b', {
    name: 'Qwen3-Next 80B-A3B Instruct',
    created: '2025-09-11',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262000,
    },
    cost: {
      input: 0.15,
      output: 1.2,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/qwen.qwen3-vl-235b-a22b', {
    name: 'Qwen3 VL 235B A22B Instruct',
    created: '2025-09-23',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262000,
    },
    cost: {
      input: 0.53,
      output: 2.66,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us-gov.openai.gpt-oss-120b-1:0', {
    name: 'gpt-oss-120b (GovCloud)',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 0.18,
      output: 0.72,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us-gov.openai.gpt-oss-20b-1:0', {
    name: 'gpt-oss-20b (GovCloud)',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 0.084,
      output: 0.36,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.amazon.nova-2-lite-v1:0', {
    name: 'Nova 2 Lite (US)',
    created: '2025-12-02',
    knowledge: '2025-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65535,
    },
    cost: {
      input: 0.33,
      output: 2.75,
      cache_read: 0.0825,
      cache_write: 0.33,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.amazon.nova-lite-v1:0', {
    name: 'Nova Lite (US)',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 10000,
    },
    cost: {
      input: 0.06,
      output: 0.24,
      cache_read: 0.015,
      cache_write: 0.06,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.amazon.nova-micro-v1:0', {
    name: 'Nova Micro (US)',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 10000,
    },
    cost: {
      input: 0.035,
      output: 0.14,
      cache_read: 0.00875,
      cache_write: 0.035,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.amazon.nova-pro-v1:0', {
    name: 'Nova Pro (US)',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 10000,
    },
    cost: {
      input: 0.8,
      output: 3.2,
      cache_read: 0.2,
      cache_write: 0.8,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-fable-5', {
    name: 'Claude Fable 5 (US)',
    created: '2026-06-09',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 11,
      output: 55,
      cache_read: 1.1,
      cache_write: 13.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-fable-5-1', {
    name: 'Claude Fable 5.1 (US)',
    created: '2026-09-01',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 11,
      output: 55,
      cache_read: 0.275,
      cache_write: 13.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0', {
    name: 'Claude Haiku 4.5 (US)',
    created: '2025-10-15',
    knowledge: '2025-02-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 1.1,
      output: 5.5,
      cache_read: 0.11,
      cache_write: 1.375,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-opus-4-5-20251101-v1:0', {
    name: 'Claude Opus 4.5 (US)',
    created: '2025-11-01',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-opus-4-6-v1', {
    name: 'Claude Opus 4.6 (US)',
    created: '2026-02-05',
    knowledge: '2025-05-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-opus-4-7', {
    name: 'Claude Opus 4.7 (US)',
    created: '2026-04-16',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-opus-4-8', {
    name: 'Claude Opus 4.8 (US)',
    created: '2026-05-28',
    knowledge: '2026-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-opus-5', {
    name: 'Claude Opus 5 (US)',
    created: '2026-07-24',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5.5,
      output: 27.5,
      cache_read: 0.55,
      cache_write: 6.875,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-opus-5-5', {
    name: 'Claude Opus 5.5 (US)',
    created: '2026-09-22',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 4.4,
      output: 22,
      cache_read: 0.22,
      cache_write: 5.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0', {
    name: 'Claude Sonnet 4.5 (US)',
    created: '2025-09-29',
    knowledge: '2025-07-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 3.3,
      output: 16.5,
      cache_read: 0.33,
      cache_write: 4.125,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-sonnet-4-6', {
    name: 'Claude Sonnet 4.6 (US)',
    created: '2026-02-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 3.3,
      output: 16.5,
      cache_read: 0.33,
      cache_write: 4.125,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.anthropic.claude-sonnet-5', {
    name: 'Claude Sonnet 5 (US)',
    created: '2026-06-30',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2.2,
      output: 11,
      cache_read: 0.22,
      cache_write: 2.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.deepseek.r1-v1:0', {
    name: 'DeepSeek-R1 (US)',
    created: '2025-01-20',
    knowledge: '2024-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 32768,
    },
    cost: {
      input: 1.35,
      output: 5.4,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.meta.llama3-1-70b-instruct-v1:0', {
    name: 'Llama 3.1 70B Instruct (US)',
    created: '2024-07-23',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0.72,
      output: 0.72,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.meta.llama3-1-8b-instruct-v1:0', {
    name: 'Llama 3.1 8B Instruct',
    created: '2024-07-23',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0.22,
      output: 0.22,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.meta.llama3-3-70b-instruct-v1:0', {
    name: 'Llama 3.3 70B Instruct',
    created: '2024-12-06',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0.72,
      output: 0.72,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.meta.llama4-maverick-17b-instruct-v1:0', {
    name: 'Llama 4 Maverick 17B Instruct (US)',
    created: '2025-04-05',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 8192,
    },
    cost: {
      input: 0.24,
      output: 0.97,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.meta.llama4-scout-17b-instruct-v1:0', {
    name: 'Llama 4 Scout 17B Instruct (US)',
    created: '2025-04-05',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 10000000,
      output: 8192,
    },
    cost: {
      input: 0.17,
      output: 0.66,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.mistral.pixtral-large-2502-v1:0', {
    name: 'Pixtral Large (25.02) (US)',
    created: '2025-04-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8192,
    },
    cost: {
      input: 2,
      output: 6,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.moonshotai.kimi-k3', {
    name: 'Kimi K3 (US)',
    created: '2026-07-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 128000,
    },
    cost: {
      input: 3.3,
      output: 16.5,
      cache_read: 0.33,
      cache_write: 4.125,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.openai.gpt-5.6-luna', {
    name: 'GPT-5.6 Luna (US)',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.22,
      output: 1.32,
      cache_read: 0.022,
      cache_write: 0.275,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.openai.gpt-5.6-sol', {
    name: 'GPT-5.6 Sol (US)',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 4.4,
      output: 22,
      cache_read: 0.44,
      cache_write: 5.5,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.openai.gpt-5.6-terra', {
    name: 'GPT-5.6 Terra (US)',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2.2,
      output: 13.2,
      cache_read: 0.22,
      cache_write: 2.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.openai.gpt-6-astra', {
    name: 'GPT-6 Astra (US)',
    created: '2026-09-04',
    knowledge: '2026-04-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 11,
      output: 55,
      cache_read: 1.1,
      cache_write: 13.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.openai.gpt-6-luna', {
    name: 'GPT-6 Luna (US)',
    created: '2026-09-22',
    knowledge: '2026-05-18',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.11,
      output: 0.55,
      cache_read: 0.011,
      cache_write: 0.1375,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.openai.gpt-6-sol', {
    name: 'GPT-6 Sol (US)',
    created: '2026-09-22',
    knowledge: '2026-04-20',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2.2,
      output: 11,
      cache_read: 0.22,
      cache_write: 2.75,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.writer.palmyra-x4-v1:0', {
    name: 'Palmyra X4 (US)',
    created: '2024-10-09',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 122880,
      output: 8192,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.writer.palmyra-x5-v1:0', {
    name: 'Palmyra X5 (US)',
    created: '2025-04-28',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 1040000,
      output: 8192,
    },
    cost: {
      input: 0.6,
      output: 6,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.xai.grok-4.6', {
    name: 'Grok 4.6 (US)',
    created: '2026-08-12',
    knowledge: '2026-02-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 500000,
    },
    cost: {
      input: 2.2,
      output: 6.6,
      cache_read: 0.55,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/us.xai.grok-4.7', {
    name: 'Grok 4.7 (US)',
    created: '2026-09-21',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 500000,
    },
    cost: {
      input: 2.2,
      output: 6.6,
      cache_read: 0.55,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/writer.palmyra-x4-v1:0', {
    name: 'Palmyra X4',
    created: '2024-10-09',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 122880,
      output: 8192,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/writer.palmyra-x5-v1:0', {
    name: 'Palmyra X5',
    created: '2025-04-28',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 1040000,
      output: 8192,
    },
    cost: {
      input: 0.6,
      output: 6,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/xai.grok-4.3', {
    name: 'Grok 4.3',
    created: '2026-04-17',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/xai.grok-4.6', {
    name: 'Grok 4.6',
    created: '2026-08-12',
    knowledge: '2026-02-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 500000,
    },
    cost: {
      input: 2.2,
      output: 6.6,
      cache_read: 0.55,
    },
    sdk: {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    },
    providers: ['bedrock'],
  }),
  model('bedrock/zai.glm-4.7', {
    name: 'GLM-4.7',
    created: '2025-12-22',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 202752,
      output: 131072,
    },
    cost: {
      input: 0.6,
      output: 2.2,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/zai.glm-4.7-flash', {
    name: 'GLM-4.7-Flash',
    created: '2026-01-19',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 202752,
      output: 131072,
    },
    cost: {
      input: 0.07,
      output: 0.4,
    },
    providers: ['bedrock'],
  }),
  model('bedrock/zai.glm-5', {
    name: 'GLM-5',
    created: '2026-02-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 202752,
      output: 131072,
    },
    cost: {
      input: 1,
      output: 3.2,
    },
    providers: ['bedrock'],
  }),
  model('cerebras/gpt-oss-120b', {
    name: 'GPT OSS 120B',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 40960,
    },
    cost: {
      input: 0.35,
      output: 0.75,
    },
    providers: ['cerebras'],
  }),
  model('cerebras/qwen-3.8-27b', {
    name: 'Qwen3.8 27B',
    created: '2026-08-14',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 40960,
    },
    cost: {
      input: 0.99,
      output: 1.49,
      cache_read: 0.99,
    },
    providers: ['cerebras'],
  }),
  model('cohere/c4ai-aya-expanse-32b', {
    name: 'Aya Expanse 32B',
    created: '2024-10-24',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4000,
    },
    providers: ['cohere'],
  }),
  model('cohere/c4ai-aya-expanse-8b', {
    name: 'Aya Expanse 8B',
    created: '2024-10-24',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 8000,
      output: 4000,
    },
    providers: ['cohere'],
  }),
  model('cohere/c4ai-aya-vision-32b', {
    name: 'Aya Vision 32B',
    created: '2025-03-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 16000,
      output: 4000,
    },
    providers: ['cohere'],
  }),
  model('cohere/c4ai-aya-vision-8b', {
    name: 'Aya Vision 8B',
    created: '2025-03-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 16000,
      output: 4000,
    },
    providers: ['cohere'],
  }),
  model('cohere/command-a-03-2025', {
    name: 'Command A',
    created: '2025-03-13',
    knowledge: '2024-06-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 8000,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['cohere'],
  }),
  model('cohere/command-a-plus-05-2026', {
    name: 'Command A Plus',
    created: '2026-05-20',
    knowledge: '2025-04-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1,
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 64000,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['cohere'],
  }),
  model('cohere/command-a-reasoning-08-2025', {
    name: 'Command A Reasoning',
    created: '2025-08-21',
    knowledge: '2024-06-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1,
        },
      ],
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32000,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['cohere'],
  }),
  model('cohere/command-a-translate-08-2025', {
    name: 'Command A Translate',
    created: '2025-08-28',
    knowledge: '2024-06-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 8000,
      output: 8000,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['cohere'],
  }),
  model('cohere/command-a-vision-07-2025', {
    name: 'Command A Vision',
    created: '2025-07-31',
    knowledge: '2024-06-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8000,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['cohere'],
  }),
  model('cohere/command-r-08-2024', {
    name: 'Command R',
    created: '2024-08-30',
    knowledge: '2024-06-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4000,
    },
    cost: {
      input: 0.15,
      output: 0.6,
    },
    providers: ['cohere'],
  }),
  model('cohere/command-r-plus-08-2024', {
    name: 'Command R+',
    created: '2024-08-30',
    knowledge: '2024-06-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4000,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['cohere'],
  }),
  model('cohere/command-r7b-12-2024', {
    name: 'Command R7B',
    created: '2024-12-02',
    knowledge: '2024-06-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4000,
    },
    cost: {
      input: 0.0375,
      output: 0.15,
    },
    providers: ['cohere'],
  }),
  model('cohere/command-r7b-arabic-02-2025', {
    name: 'Command R7B Arabic',
    created: '2025-02-27',
    knowledge: '2024-06-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4000,
    },
    cost: {
      input: 0.0375,
      output: 0.15,
    },
    providers: ['cohere'],
  }),
  model('cohere/north-mini-code-1-0', {
    name: 'North Mini Code',
    created: '2026-06-09',
    knowledge: '2025-09-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 256000,
      output: 64000,
    },
    cost: {
      input: 0,
      output: 0,
    },
    sdk: {
      npm: '@ai-sdk/openai-compatible',
      api: 'https://api.cohere.ai/compatibility/v1',
    },
    providers: ['cohere'],
  }),
  model('deepinfra/ByteDance/Seed-2.0-code', {
    name: 'Seed 2.0 Code',
    created: '2026-02-14',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 131072,
    },
    cost: {
      input: 0.5,
      output: 3,
      cache_read: 0.1,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/ByteDance/Seed-2.0-mini', {
    name: 'Seed 2.0 Mini',
    created: '2026-02-14',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32000,
    },
    cost: {
      input: 0.1,
      output: 0.4,
      cache_read: 0.02,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/ByteDance/Seed-2.0-pro', {
    name: 'Seed 2.0 Pro',
    created: '2026-02-14',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 128000,
    },
    cost: {
      input: 0.5,
      output: 3,
      cache_read: 0.1,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/deepseek-ai/DeepSeek-R1-0528', {
    name: 'DeepSeek-R1-0528',
    created: '2025-05-28',
    knowledge: '2024-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 64000,
    },
    cost: {
      input: 0.5,
      output: 2.15,
      cache_read: 0.35,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/deepseek-ai/DeepSeek-V3', {
    name: 'DeepSeek-V3',
    created: '2024-12-26',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 8192,
    },
    cost: {
      input: 0.32,
      output: 0.89,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/deepseek-ai/DeepSeek-V3.1', {
    name: 'DeepSeek-V3.1',
    created: '2025-08-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 8192,
    },
    cost: {
      input: 0.25,
      output: 0.95,
      cache_read: 0.13,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/deepseek-ai/DeepSeek-V3.2', {
    name: 'DeepSeek-V3.2',
    created: '2025-12-02',
    knowledge: '2024-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 64000,
    },
    cost: {
      input: 0.26,
      output: 0.38,
      cache_read: 0.13,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/deepseek-ai/DeepSeek-V4-Flash', {
    name: 'DeepSeek V4 Flash',
    created: '2026-04-24',
    knowledge: '2025-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 16384,
    },
    cost: {
      input: 0.09,
      output: 0.18,
      cache_read: 0.018,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/deepseek-ai/DeepSeek-V4-Flash-0731', {
    name: 'DeepSeek V4 Flash 0731',
    created: '2026-07-31',
    knowledge: '2025-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 384000,
    },
    cost: {
      input: 0.06,
      output: 0.18,
      cache_read: 0.015,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/deepseek-ai/DeepSeek-V4-Flash-Vision-Exp', {
    name: 'DeepSeek V4 Flash Vision Exp',
    created: '2026-08-21',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 384000,
    },
    cost: {
      input: 0.44,
      output: 1.32,
      cache_read: 0.014,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/deepseek-ai/DeepSeek-V4-Pro', {
    name: 'DeepSeek V4 Pro',
    created: '2026-04-24',
    knowledge: '2025-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 16384,
    },
    cost: {
      input: 1.3,
      output: 2.6,
      cache_read: 0.1,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813', {
    name: 'DeepSeek V4 Pro 0813',
    created: '2026-08-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 384000,
    },
    cost: {
      input: 1.3,
      output: 2.6,
      cache_read: 0.1,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/deepseek-ai/DeepSeek-V4.1-Flash', {
    name: 'DeepSeek V4.1 Flash',
    created: '2026-09-10',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 384000,
    },
    cost: {
      input: 0.2,
      output: 0.6,
      cache_read: 0.006,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/google/gemma-3-12b-it', {
    name: 'Gemma 3 12B IT',
    created: '2025-03-12',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.05,
      output: 0.15,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/google/gemma-3-27b-it', {
    name: 'Gemma 3 27B IT',
    created: '2025-03-12',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.08,
      output: 0.16,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/google/gemma-3-4b-it', {
    name: 'Gemma 3 4B IT',
    created: '2025-03-12',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.05,
      output: 0.1,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/google/gemma-4-26B-A4B-it', {
    name: 'Gemma 4 26B A4B IT',
    created: '2026-04-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.07,
      output: 0.34,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/google/gemma-4-31B-it', {
    name: 'Gemma 4 31B IT',
    created: '2026-04-02',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.13,
      output: 0.38,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/google/gemma-4-E4B-it', {
    name: 'Gemma 4 E4B IT',
    created: '2026-04-02',
    modalities: {
      input: ['text', 'image', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    cost: {
      input: 0.02,
      output: 0.1,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/meta-llama/Llama-3.3-70B-Instruct-Turbo', {
    name: 'Llama 3.3 70B Turbo',
    created: '2024-12-06',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.1,
      output: 0.32,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', {
    name: 'Llama 4 Maverick 17B FP8',
    created: '2025-04-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 16384,
    },
    cost: {
      input: 0.2,
      output: 0.8,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/meta-llama/Llama-4-Scout-17B-16E-Instruct', {
    name: 'Llama 4 Scout 17B',
    created: '2025-04-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 327680,
      output: 16384,
    },
    cost: {
      input: 0.1,
      output: 0.3,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/MiniMaxAI/MiniMax-M3', {
    name: 'MiniMax-M3',
    created: '2026-06-01',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 524288,
      output: 512000,
    },
    cost: {
      input: 0.28,
      output: 1.1,
      cache_read: 0.056,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/moonshotai/Kimi-K2.6', {
    name: 'Kimi K2.6',
    created: '2026-04-21',
    knowledge: '2024-04',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 16384,
    },
    cost: {
      input: 0.75,
      output: 3.5,
      cache_read: 0.15,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/moonshotai/Kimi-K3', {
    name: 'Kimi K3',
    created: '2026-07-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 2.85,
      output: 14.25,
      cache_read: 0.285,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/nvidia/Nemotron-3-Nano-30B-A3B', {
    name: 'Nemotron 3 Nano 30B A3B',
    created: '2025-12-15',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 0.05,
      output: 0.2,
      cache_read: 0.025,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/openai/gpt-oss-120b', {
    name: 'GPT OSS 120B',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.037,
      output: 0.17,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/openai/gpt-oss-20b', {
    name: 'GPT OSS 20B',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.03,
      output: 0.14,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3-235B-A22B-Instruct-2507', {
    name: 'Qwen3 235B-A22B Instruct 2507',
    created: '2025-07-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 16384,
    },
    cost: {
      input: 0.09,
      output: 0.55,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3-30B-A3B', {
    name: 'Qwen3 30B A3B',
    created: '2025-04-28',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 40960,
      output: 16384,
    },
    cost: {
      input: 0.12,
      output: 0.5,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3-32B', {
    name: 'Qwen3 32B',
    created: '2025-04',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 40960,
      output: 16384,
    },
    cost: {
      input: 0.08,
      output: 0.28,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo', {
    name: 'Qwen3 Coder 480B A35B Instruct Turbo',
    created: '2025-07-23',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 66536,
    },
    cost: {
      input: 0.3,
      output: 1,
      cache_read: 0.1,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3-Max', {
    name: 'Qwen3 Max',
    created: '2025-09-23',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 65536,
    },
    cost: {
      input: 1.2,
      output: 6,
      cache_read: 0.24,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3-Next-80B-A3B-Instruct', {
    name: 'Qwen3-Next 80B-A3B Instruct',
    created: '2025-09',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.09,
      output: 1.1,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3-VL-235B-A22B-Instruct', {
    name: 'Qwen3 VL 235B A22B Instruct',
    created: '2025-09-23',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.2,
      output: 0.88,
      cache_read: 0.11,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.5-122B-A10B', {
    name: 'Qwen3.5 122B-A10B',
    created: '2026-02-23',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.29,
      output: 2.4,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.5-27B', {
    name: 'Qwen3.5 27B',
    created: '2026-02-23',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.26,
      output: 2.6,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.5-35B-A3B', {
    name: 'Qwen 3.5 35B A3B',
    created: '2026-02-01',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 81920,
    },
    cost: {
      input: 0.14,
      output: 1,
      cache_read: 0.05,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.5-397B-A17B', {
    name: 'Qwen 3.5 397B A17B',
    created: '2026-02-01',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 81920,
    },
    cost: {
      input: 0.45,
      output: 3,
      cache_read: 0.22,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.5-9B', {
    name: 'Qwen3.5 9B',
    created: '2026-02-23',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.1,
      output: 0.15,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.6-27B', {
    name: 'Qwen3.6 27B',
    created: '2026-04-22',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.32,
      output: 3.2,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.6-35B-A3B', {
    name: 'Qwen3.6 35B A3B',
    created: '2026-04-01',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 81920,
    },
    cost: {
      input: 0.1,
      output: 0.95,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.7-Max', {
    name: 'Qwen3.7 Max',
    created: '2026-05-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 65536,
    },
    cost: {
      input: 2.5,
      output: 7.5,
      cache_read: 0.5,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.8-2.4T-A95B', {
    name: 'Qwen3.8 2.4T A95B',
    created: '2026-08-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'xhigh'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.2,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.8-27B', {
    name: 'Qwen3.8 27B',
    created: '2026-08-14',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.2,
      output: 2.5,
      cache_read: 0.05,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.8-Flash', {
    name: 'Qwen3.8 Flash',
    created: '2026-08-26',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 0.113,
      output: 0.382,
      cache_read: 0.0141,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/Qwen/Qwen3.8-Max', {
    name: 'Qwen3.8 Max',
    created: '2026-08-03',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 131072,
    },
    cost: {
      input: 1.65,
      output: 4.951,
      cache_read: 0.206,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/stepfun-ai/Step-3.7-Flash', {
    name: 'Step 3.7 Flash',
    created: '2026-05-29',
    knowledge: '2026-03-01',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 256000,
    },
    cost: {
      input: 0.2,
      output: 1.15,
      cache_read: 0.04,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/tencent/Hy3', {
    name: 'Hy3',
    created: '2026-07-06',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 128000,
    },
    cost: {
      input: 0.13,
      output: 0.53,
      cache_read: 0.033,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/tencent/Hy4-preview', {
    name: 'Hy4 preview',
    created: '2026-08-28',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 64000,
    },
    cost: {
      input: 0.834,
      output: 2.501,
      cache_read: 0.042,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/thinkingmachines/Inkling', {
    name: 'Inkling',
    created: '2026-07-15',
    modalities: {
      input: ['text', 'image', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 524288,
      output: 1048576,
    },
    cost: {
      input: 0.95,
      output: 4.05,
      cache_read: 0.16,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/thinkingmachines/Inkling-Small', {
    name: 'Inkling Small',
    created: '2026-07-30',
    modalities: {
      input: ['text', 'image', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 524288,
      output: 1048576,
    },
    cost: {
      input: 0.45,
      output: 1.2,
      cache_read: 0.1,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/XiaomiMiMo/MiMo-V2.6-Flash', {
    name: 'MiMo-V2.6-Flash',
    created: '2026-09-22',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.14,
      output: 0.28,
      cache_read: 0.0028,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/XiaomiMiMo/MiMo-V2.6-Pro', {
    name: 'MiMo-V2.6-Pro',
    created: '2026-09-22',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.43,
      output: 0.87,
      cache_read: 0.0036,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/zai-org/GLM-4.6', {
    name: 'GLM-4.6',
    created: '2025-09-30',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 202752,
      output: 131072,
    },
    cost: {
      input: 0.5,
      output: 2,
      cache_read: 0.1,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/zai-org/GLM-4.7', {
    name: 'GLM-4.7',
    created: '2025-12-22',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 202752,
      output: 16384,
    },
    cost: {
      input: 0.4,
      output: 1.75,
      cache_read: 0.08,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/zai-org/GLM-5.1', {
    name: 'GLM-5.1',
    created: '2026-04-07',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 202752,
      output: 16384,
    },
    cost: {
      input: 1.05,
      output: 3.5,
      cache_read: 0.205,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/zai-org/GLM-5.2', {
    name: 'GLM-5.2',
    created: '2026-06-13',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 32768,
    },
    cost: {
      input: 0.75,
      output: 2.4,
      cache_read: 0.14,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/zai-org/GLM-5.3', {
    name: 'GLM-5.3',
    created: '2026-08-14',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.9,
      output: 4,
      cache_read: 0.2,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/zai-org/GLM-5.3-Flash', {
    name: 'GLM-5.3-Flash',
    created: '2026-08-26',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.15,
      output: 0.5,
      cache_read: 0.03,
    },
    providers: ['deepinfra'],
  }),
  model('fireworks/accounts/fireworks/models/deepseek-v4p1-flash', {
    name: 'DeepSeek V4.1 Flash',
    created: '2026-09-10',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 384000,
    },
    cost: {
      input: 0.22,
      output: 0.66,
      cache_read: 0.007,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/models/ember-1', {
    name: 'Ember-1',
    created: '2026-09-22',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/models/glm-5p3', {
    name: 'GLM 5.3',
    created: '2026-08-14',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048573,
      output: 262144,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.26,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/models/glm-5p3-flash', {
    name: 'GLM 5.3 Flash',
    created: '2026-08-26',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048573,
      output: 131072,
    },
    cost: {
      input: 0.15,
      output: 0.5,
      cache_read: 0.03,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/models/gpt-oss-120b', {
    name: 'GPT OSS 120B',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.015,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/models/inkling', {
    name: 'Inkling',
    created: '2026-07-15',
    modalities: {
      input: ['text', 'image', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 1048576,
    },
    cost: {
      input: 1,
      output: 4.05,
      cache_read: 0.17,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/models/kimi-k3', {
    name: 'Kimi K3',
    created: '2026-07-27',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/models/minimax-m3', {
    name: 'MiniMax-M3',
    created: '2026-06-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 512000,
      output: 512000,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.06,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/models/nemotron-3-ultra-nvfp4', {
    name: 'Nemotron 3 Ultra 550B A55B',
    created: '2026-06-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 128000,
    },
    cost: {
      input: 0.6,
      output: 2.4,
      cache_read: 0.12,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b', {
    name: 'Nemotron 3.5 Lightning 30B A3B',
    created: '2026-08-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 0.05,
      output: 0.2,
      cache_read: 0.01,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/models/qwen3p8-2p4t-a95b', {
    name: 'Qwen3.8 2.4T A95B',
    created: '2026-08-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'xhigh'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.25,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/models/qwen3p8-max', {
    name: 'Qwen3.8 Max',
    created: '2026-08-03',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.25,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/routers/deepseek-flash-latest', {
    name: 'DeepSeek Flash Latest',
    created: '2026-09-10',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 384000,
    },
    cost: {
      input: 0.22,
      output: 0.66,
      cache_read: 0.007,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/routers/glm-5p3-fast', {
    name: 'GLM 5.3 Fast',
    created: '2026-08-28',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048572,
      output: 262144,
    },
    cost: {
      input: 2.1,
      output: 6.6,
      cache_read: 0.39,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/routers/glm-fast-latest', {
    name: 'GLM 5.3 Fast (Latest)',
    created: '2026-08-28',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048572,
      output: 262144,
    },
    cost: {
      input: 2.1,
      output: 6.6,
      cache_read: 0.39,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/routers/glm-flash-latest', {
    name: 'GLM Flash Latest (GLM 5.3 Flash)',
    created: '2026-08-26',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048573,
      output: 131072,
    },
    cost: {
      input: 0.15,
      output: 0.5,
      cache_read: 0.03,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/routers/glm-latest', {
    name: 'GLM Latest',
    created: '2026-08-14',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048573,
      output: 262144,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.26,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/routers/kimi-fast-latest', {
    name: 'Kimi Fast Latest',
    created: '2026-07-27',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 4.5,
      output: 22.5,
      cache_read: 0.45,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/routers/kimi-k3-fast', {
    name: 'Kimi K3 Fast',
    created: '2026-07-27',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 4.5,
      output: 22.5,
      cache_read: 0.45,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/routers/kimi-latest', {
    name: 'Kimi Latest',
    created: '2026-07-27',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/routers/minimax-latest', {
    name: 'MiniMax Latest',
    created: '2026-06-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 512000,
      output: 512000,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.06,
    },
    providers: ['fireworks'],
  }),
  model('fireworks/accounts/fireworks/routers/qwen-max-latest', {
    name: 'Qwen Max Latest (Qwen3.8 Max)',
    created: '2026-08-03',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.25,
    },
    providers: ['fireworks'],
  }),
  model('google/deep-research-max-preview-04-2026', {
    name: 'Deep Research Max Preview (Apr-21-2026)',
    created: '2026-04-21',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text', 'image'],
    },
    operations: ['chat.completions', 'images.generations', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 65536,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
    },
    providers: ['google'],
  }),
  model('google/deep-research-preview-04-2026', {
    name: 'Deep Research Preview (Apr-21-2026)',
    created: '2026-04-21',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text', 'image'],
    },
    operations: ['chat.completions', 'images.generations', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 65536,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
    },
    providers: ['google'],
  }),
  model('google/gemini-2.5-computer-use-preview-10-2025', {
    name: 'Gemini 2.5 Computer Use Preview 10-2025',
    created: '2025-10-07',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 64000,
    },
    cost: {
      input: 1.25,
      output: 10,
    },
    providers: ['google'],
  }),
  model('google/gemini-2.5-flash', {
    name: 'Gemini 2.5 Flash',
    created: '2025-06-17',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 0,
          max: 24576,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.3,
      output: 2.5,
      cache_read: 0.03,
    },
    providers: ['google'],
  }),
  model('google/gemini-2.5-flash-image', {
    name: 'Nano Banana',
    created: '2025-08-26',
    knowledge: '2024-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text', 'image'],
    },
    operations: ['chat.completions', 'images.generations'],
    capabilities: {
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 32768,
    },
    cost: {
      input: 0.3,
      output: 30,
      cache_read: 0.075,
    },
    providers: ['google'],
  }),
  model('google/gemini-2.5-flash-lite', {
    name: 'Gemini 2.5 Flash-Lite',
    created: '2025-06-17',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 512,
          max: 24576,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.1,
      output: 0.4,
      cache_read: 0.01,
    },
    providers: ['google'],
  }),
  model('google/gemini-2.5-flash-preview-tts', {
    name: 'Gemini 2.5 Flash Preview TTS',
    created: '2025-05-01',
    knowledge: '2025-01',
    modalities: {
      input: ['text'],
      output: ['audio'],
    },
    operations: ['audio.speech'],
    capabilities: {},
    context: {
      input: 8192,
      output: 16384,
    },
    cost: {
      input: 0.5,
      output: 10,
    },
    providers: ['google'],
  }),
  model('google/gemini-2.5-pro', {
    name: 'Gemini 2.5 Pro',
    created: '2025-06-17',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 128,
          max: 32768,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
    },
    providers: ['google'],
  }),
  model('google/gemini-2.5-pro-preview-tts', {
    name: 'Gemini 2.5 Pro Preview TTS',
    created: '2025-05-01',
    knowledge: '2025-01',
    modalities: {
      input: ['text'],
      output: ['audio'],
    },
    operations: ['audio.speech'],
    capabilities: {},
    context: {
      input: 8192,
      output: 16384,
    },
    cost: {
      input: 1,
      output: 20,
    },
    providers: ['google'],
  }),
  model('google/gemini-3-flash-preview', {
    name: 'Gemini 3 Flash Preview',
    created: '2025-12-17',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.5,
      output: 3,
      cache_read: 0.05,
    },
    providers: ['google'],
  }),
  model('google/gemini-3-pro-image', {
    name: 'Nano Banana Pro',
    created: '2026-05-28',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text', 'image'],
    },
    operations: ['chat.completions', 'images.generations'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 65536,
      output: 32768,
    },
    cost: {
      input: 2,
      output: 120,
    },
    providers: ['google'],
  }),
  model('google/gemini-3-pro-image-preview', {
    name: 'Nano Banana Pro',
    created: '2025-11-20',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text', 'image'],
    },
    operations: ['chat.completions', 'images.generations'],
    capabilities: {
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 2,
      output: 120,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.1-flash-image', {
    name: 'Nano Banana 2',
    created: '2026-05-28',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text', 'image'],
    },
    operations: ['chat.completions', 'images.generations'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.5,
      output: 60,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.1-flash-image-preview', {
    name: 'Nano Banana 2',
    created: '2026-02-26',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text', 'image'],
    },
    operations: ['chat.completions', 'images.generations'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 65536,
      output: 65536,
    },
    cost: {
      input: 0.5,
      output: 60,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.1-flash-lite', {
    name: 'Gemini 3.1 Flash Lite',
    created: '2026-05-07',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.25,
      output: 1.5,
      cache_read: 0.025,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.1-flash-lite-image', {
    name: 'Nano Banana 2 Lite',
    created: '2026-06-30',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text', 'image'],
    },
    operations: ['chat.completions', 'images.generations'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 65536,
      output: 4096,
    },
    cost: {
      input: 0.25,
      output: 30,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.1-flash-live-preview', {
    name: 'Gemini 3.1 Flash Live Preview',
    created: '2026-03-26',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text', 'audio'],
    },
    operations: ['chat.completions', 'audio.speech', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 65536,
    },
    cost: {
      input: 0.75,
      output: 4.5,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.1-flash-tts-preview', {
    name: 'Gemini 3.1 Flash TTS Preview',
    created: '2026-04-15',
    knowledge: '2025-01',
    modalities: {
      input: ['text'],
      output: ['audio'],
    },
    operations: ['audio.speech'],
    capabilities: {
      reasoning: true,
    },
    context: {
      input: 8192,
      output: 16384,
    },
    cost: {
      input: 1,
      output: 20,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.1-pro-preview', {
    name: 'Gemini 3.1 Pro Preview',
    created: '2026-02-19',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.1-pro-preview-customtools', {
    name: 'Gemini 3.1 Pro Preview Custom Tools',
    created: '2026-02-19',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.5-flash', {
    name: 'Gemini 3.5 Flash',
    created: '2026-05-19',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 1.5,
      output: 9,
      cache_read: 0.15,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.5-flash-lite', {
    name: 'Gemini 3.5 Flash Lite',
    created: '2026-07-21',
    knowledge: '2026-03',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.3,
      output: 2.5,
      cache_read: 0.03,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.5-live-translate-preview', {
    name: 'Gemini 3.5 Live Translate Preview',
    created: '2026-06-09',
    knowledge: '2025-01',
    modalities: {
      input: ['audio'],
      output: ['audio', 'text'],
    },
    operations: ['chat.completions', 'audio.speech', 'audio.transcriptions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 16384,
      output: 32768,
    },
    cost: {
      input: 3.5,
      output: 21,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.5-transcribe', {
    name: 'Gemini 3.5 Transcribe',
    created: '2026-08-26',
    modalities: {
      input: ['audio'],
      output: ['text'],
    },
    operations: ['audio.transcriptions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 0,
      output: 0,
    },
    cost: {
      input: 2,
      output: 12,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.6-flash', {
    name: 'Gemini 3.6 Flash',
    created: '2026-07-21',
    knowledge: '2026-03',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.75,
      output: 3.75,
      cache_read: 0.075,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.7-flash', {
    name: 'Gemini 3.7 Flash',
    created: '2026-08-13',
    knowledge: '2026-03',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.75,
      output: 3.75,
      cache_read: 0.075,
    },
    providers: ['google'],
  }),
  model('google/gemini-3.8-flash', {
    name: 'Gemini 3.8 Flash',
    created: '2026-09-02',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.75,
      output: 3.75,
      cache_read: 0.075,
    },
    providers: ['google'],
  }),
  model('google/gemini-embedding-001', {
    name: 'Gemini Embedding 001',
    created: '2025-05-20',
    knowledge: '2025-05',
    modalities: {
      input: ['text'],
      output: ['embedding'],
    },
    operations: ['embeddings'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 2048,
      output: 1,
    },
    cost: {
      input: 0.15,
      output: 0,
    },
    providers: ['google'],
  }),
  model('google/gemini-embedding-2', {
    name: 'Gemini Embedding 2',
    created: '2026-04-22',
    knowledge: '2025-11',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['embedding'],
    },
    operations: ['embeddings'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 8192,
      output: 1,
    },
    cost: {
      input: 0.2,
      output: 0,
    },
    providers: ['google'],
  }),
  model('google/gemini-flash-latest', {
    name: 'Gemini Flash Latest',
    created: '2026-08-13',
    knowledge: '2026-03',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.75,
      output: 3.75,
      cache_read: 0.075,
    },
    providers: ['google'],
  }),
  model('google/gemini-flash-lite-latest', {
    name: 'Gemini Flash-Lite Latest',
    created: '2026-07-21',
    knowledge: '2026-03',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.3,
      output: 2.5,
      cache_read: 0.03,
    },
    providers: ['google'],
  }),
  model('google/gemini-omni-flash-preview', {
    name: 'Gemini Omni Flash Preview',
    created: '2026-06-30',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['video'],
    },
    operations: ['video.generations'],
    capabilities: {
      reasoning: true,
      vision: true,
    },
    context: {
      input: 131072,
      output: 65536,
    },
    cost: {
      input: 1.5,
      output: 17.5,
    },
    providers: ['google'],
  }),
  model('google/gemma-4-26b-a4b-it', {
    name: 'Gemma 4 26B A4B IT',
    created: '2026-04-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    providers: ['google'],
  }),
  model('google/gemma-4-31b-it', {
    name: 'Gemma 4 31B IT',
    created: '2026-04-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    providers: ['google'],
  }),
  model('google/lyria-3-clip-preview', {
    name: 'Lyria 3 Clip Preview',
    created: '2026-03-25',
    modalities: {
      input: ['text', 'image'],
      output: ['text', 'audio'],
    },
    operations: ['chat.completions', 'audio.speech'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['google'],
  }),
  model('google/lyria-3-pro-preview', {
    name: 'Lyria 3 Pro Preview',
    created: '2026-03-25',
    modalities: {
      input: ['text', 'image'],
      output: ['text', 'audio'],
    },
    operations: ['chat.completions', 'audio.speech'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['google'],
  }),
  model('google/veo-3.1-fast-generate-preview', {
    name: 'Veo 3.1 fast',
    created: '2025-10-15',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['video'],
    },
    operations: ['video.generations'],
    capabilities: {
      vision: true,
    },
    context: {
      input: 480,
      output: 8192,
    },
    providers: ['google'],
  }),
  model('google/veo-3.1-generate-preview', {
    name: 'Veo 3.1',
    created: '2025-10-15',
    status: 'beta',
    modalities: {
      input: ['text', 'image'],
      output: ['video'],
    },
    operations: ['video.generations'],
    capabilities: {
      vision: true,
    },
    context: {
      input: 480,
      output: 8192,
    },
    providers: ['google'],
  }),
  model('google/veo-3.1-lite-generate-preview', {
    name: 'Veo 3.1 lite',
    created: '2026-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['video'],
    },
    operations: ['video.generations'],
    capabilities: {
      vision: true,
    },
    context: {
      input: 480,
      output: 8192,
    },
    providers: ['google'],
  }),
  model('groq/allam-2-7b', {
    name: 'ALLaM-2-7b',
    created: '2025-01-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 4096,
      output: 4096,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['groq'],
  }),
  model('groq/canopylabs/orpheus-arabic-saudi', {
    name: 'Canopy Labs Orpheus Arabic Saudi',
    created: '2025-12-16',
    status: 'beta',
    modalities: {
      input: ['text'],
      output: ['audio'],
    },
    operations: ['audio.speech'],
    capabilities: {},
    context: {
      input: 4000,
      output: 50000,
    },
    providers: ['groq'],
  }),
  model('groq/canopylabs/orpheus-v1-english', {
    name: 'Canopy Labs Orpheus V1 English',
    created: '2025-12-19',
    status: 'beta',
    modalities: {
      input: ['text'],
      output: ['audio'],
    },
    operations: ['audio.speech'],
    capabilities: {},
    context: {
      input: 4000,
      output: 50000,
    },
    providers: ['groq'],
  }),
  model('groq/groq/compound', {
    name: 'Compound',
    created: '2025-09-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    providers: ['groq'],
  }),
  model('groq/groq/compound-mini', {
    name: 'Compound Mini',
    created: '2025-09-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    providers: ['groq'],
  }),
  model('groq/llama-3.1-8b-instant', {
    name: 'Llama 3.1 8B',
    created: '2024-07-23',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.05,
      output: 0.08,
    },
    providers: ['groq'],
  }),
  model('groq/llama-3.3-70b-versatile', {
    name: 'Llama 3.3 70B',
    created: '2024-12-06',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.59,
      output: 0.79,
    },
    providers: ['groq'],
  }),
  model('groq/meta-llama/llama-prompt-guard-2-22m', {
    name: 'Llama Prompt Guard 2 22M',
    created: '2025-05-29',
    status: 'beta',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 512,
      output: 512,
    },
    cost: {
      input: 0.03,
      output: 0.03,
    },
    providers: ['groq'],
  }),
  model('groq/meta-llama/llama-prompt-guard-2-86m', {
    name: 'Prompt Guard 2 86M',
    created: '2025-05-29',
    status: 'beta',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 512,
      output: 512,
    },
    cost: {
      input: 0.04,
      output: 0.04,
    },
    providers: ['groq'],
  }),
  model('groq/openai/gpt-oss-120b', {
    name: 'GPT OSS 120B',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 65536,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.075,
    },
    providers: ['groq'],
  }),
  model('groq/openai/gpt-oss-20b', {
    name: 'GPT OSS 20B',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 65536,
    },
    cost: {
      input: 0.075,
      output: 0.3,
      cache_read: 0.0375,
    },
    providers: ['groq'],
  }),
  model('groq/openai/gpt-oss-safeguard-20b', {
    name: 'Safety GPT OSS 20B',
    created: '2025-10-29',
    status: 'beta',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 65536,
    },
    cost: {
      input: 0.075,
      output: 0.3,
    },
    providers: ['groq'],
  }),
  model('groq/qwen/qwen3.6-27b', {
    name: 'Qwen3.6 27B',
    created: '2026-04-22',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'default'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.6,
      output: 3,
      cache_read: 0.3,
    },
    providers: ['groq'],
  }),
  model('groq/qwen/qwen3.8-27b', {
    name: 'Qwen3.8 27B',
    created: '2026-08-14',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'default', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 131042,
      output: 16384,
    },
    cost: {
      input: 0.8,
      output: 4,
    },
    providers: ['groq'],
  }),
  model('groq/whisper-large-v3', {
    name: 'Whisper',
    created: '2023-09-01',
    modalities: {
      input: ['audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 0,
      output: 0,
    },
    providers: ['groq'],
  }),
  model('groq/whisper-large-v3-turbo', {
    name: 'Whisper Large V3 Turbo',
    created: '2024-10-01',
    modalities: {
      input: ['audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 0,
      output: 0,
    },
    providers: ['groq'],
  }),
  model('mistral/codestral-latest', {
    name: 'Codestral (latest)',
    created: '2024-05-29',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 4096,
    },
    cost: {
      input: 0.3,
      output: 0.9,
      cache_read: 0.03,
    },
    providers: ['mistral'],
  }),
  model('mistral/magistral-medium-latest', {
    name: 'Magistral Medium (latest)',
    created: '2025-03-17',
    knowledge: '2025-06',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 2,
      output: 5,
    },
    providers: ['mistral'],
  }),
  model('mistral/ministral-3b-latest', {
    name: 'Ministral 3B (latest)',
    created: '2024-10-01',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 128000,
    },
    cost: {
      input: 0.04,
      output: 0.04,
    },
    providers: ['mistral'],
  }),
  model('mistral/ministral-8b-latest', {
    name: 'Ministral 8B (latest)',
    created: '2024-10-01',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 128000,
    },
    cost: {
      input: 0.1,
      output: 0.1,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-embed', {
    name: 'Mistral Embed',
    created: '2023-12-11',
    modalities: {
      input: ['text'],
      output: ['embedding'],
    },
    operations: ['embeddings'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 8000,
      output: 3072,
    },
    cost: {
      input: 0.1,
      output: 0,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-large-2411', {
    name: 'Mistral Large 2.1',
    created: '2024-11-18',
    knowledge: '2024-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 2,
      output: 6,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-large-2512', {
    name: 'Mistral Large 3',
    created: '2024-11-01',
    knowledge: '2024-11',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 0.5,
      output: 1.5,
      cache_read: 0.05,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-large-latest', {
    name: 'Mistral Large (latest)',
    created: '2024-11-01',
    knowledge: '2024-11',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 0.5,
      output: 1.5,
      cache_read: 0.05,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-medium-2505', {
    name: 'Mistral Medium 3',
    created: '2025-05-07',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.4,
      output: 2,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-medium-2508', {
    name: 'Mistral Medium 3.1',
    created: '2025-08-12',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 0.4,
      output: 2,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-medium-2604', {
    name: 'Mistral Medium 3.5',
    created: '2026-04-29',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 1.5,
      output: 7.5,
      cache_read: 0.15,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-medium-latest', {
    name: 'Mistral Medium (latest)',
    created: '2026-04-29',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 1.5,
      output: 7.5,
      cache_read: 0.15,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-nemo', {
    name: 'Mistral Nemo',
    created: '2024-07-01',
    knowledge: '2024-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 128000,
    },
    cost: {
      input: 0.15,
      output: 0.15,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-small-2506', {
    name: 'Mistral Small 3.2',
    created: '2025-06-20',
    knowledge: '2025-03',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 0.1,
      output: 0.3,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-small-2603', {
    name: 'Mistral Small 4',
    created: '2026-03-16',
    knowledge: '2025-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 256000,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.015,
    },
    providers: ['mistral'],
  }),
  model('mistral/mistral-small-latest', {
    name: 'Mistral Small (latest)',
    created: '2026-03-16',
    knowledge: '2025-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 256000,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.015,
    },
    providers: ['mistral'],
  }),
  model('mistral/open-mistral-7b', {
    name: 'Mistral 7B',
    created: '2023-09-27',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 8000,
      output: 8000,
    },
    cost: {
      input: 0.25,
      output: 0.25,
    },
    providers: ['mistral'],
  }),
  model('mistral/open-mixtral-8x22b', {
    name: 'Mixtral 8x22B',
    created: '2024-04-17',
    knowledge: '2024-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 64000,
      output: 64000,
    },
    cost: {
      input: 2,
      output: 6,
    },
    providers: ['mistral'],
  }),
  model('mistral/open-mixtral-8x7b', {
    name: 'Mixtral 8x7B',
    created: '2023-12-11',
    knowledge: '2024-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 32000,
      output: 32000,
    },
    cost: {
      input: 0.7,
      output: 0.7,
    },
    providers: ['mistral'],
  }),
  model('mistral/pixtral-12b', {
    name: 'Pixtral 12B',
    created: '2024-09-01',
    knowledge: '2024-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 128000,
    },
    cost: {
      input: 0.15,
      output: 0.15,
    },
    providers: ['mistral'],
  }),
  model('mistral/pixtral-large-latest', {
    name: 'Pixtral Large (latest)',
    created: '2024-11-01',
    knowledge: '2024-11',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 6,
    },
    providers: ['mistral'],
  }),
  model('mistral/voxtral-mini-latest', {
    name: 'Voxtral Mini (latest)',
    created: '2026-02-01',
    modalities: {
      input: ['audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 0,
      output: 0,
    },
    providers: ['mistral'],
  }),
  model('mistral/voxtral-mini-tts-latest', {
    name: 'Voxtral Mini TTS (latest)',
    created: '2026-03-01',
    modalities: {
      input: ['text'],
      output: ['audio'],
    },
    operations: ['audio.speech'],
    capabilities: {},
    context: {
      input: 0,
      output: 0,
    },
    providers: ['mistral'],
  }),
  model('mistral/voxtral-small-latest', {
    name: 'Voxtral Small (latest)',
    created: '2025-07-15',
    modalities: {
      input: ['text', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 32000,
      output: 32000,
    },
    cost: {
      input: 0.1,
      output: 0.3,
    },
    providers: ['mistral'],
  }),
  model('mistral/zai-glm-5-2', {
    name: 'GLM-5.2',
    created: '2026-06-13',
    status: 'beta',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.14,
    },
    providers: ['mistral'],
  }),
  model('mistral/zai-glm-5-3', {
    name: 'GLM-5.3',
    created: '2026-08-14',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.14,
    },
    providers: ['mistral'],
  }),
  model('openai/chatgpt-image-latest', {
    name: 'chatgpt-image-latest',
    created: '2025-12-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text', 'image'],
    },
    operations: ['chat.completions', 'images.generations'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 0,
      output: 0,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-4.1', {
    name: 'GPT-4.1',
    created: '2025-04-14',
    knowledge: '2024-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1047576,
      output: 32768,
    },
    cost: {
      input: 2,
      output: 8,
      cache_read: 0.5,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-4.1-mini', {
    name: 'GPT-4.1 mini',
    created: '2025-04-14',
    knowledge: '2024-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1047576,
      output: 32768,
    },
    cost: {
      input: 0.4,
      output: 1.6,
      cache_read: 0.1,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-4o', {
    name: 'GPT-4o',
    created: '2024-05-13',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 2.5,
      output: 10,
      cache_read: 1.25,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-4o-2024-08-06', {
    name: 'GPT-4o (2024-08-06)',
    created: '2024-08-06',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 2.5,
      output: 10,
      cache_read: 1.25,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-4o-2024-11-20', {
    name: 'GPT-4o (2024-11-20)',
    created: '2024-11-20',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 2.5,
      output: 10,
      cache_read: 1.25,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-4o-mini', {
    name: 'GPT-4o mini',
    created: '2024-07-18',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.075,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5', {
    name: 'GPT-5',
    created: '2025-08-07',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5-mini', {
    name: 'GPT-5 Mini',
    created: '2025-08-07',
    knowledge: '2024-05-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.25,
      output: 2,
      cache_read: 0.025,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5-nano', {
    name: 'GPT-5 Nano',
    created: '2025-08-07',
    knowledge: '2024-05-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.05,
      output: 0.4,
      cache_read: 0.005,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5-pro', {
    name: 'GPT-5 Pro',
    created: '2025-10-06',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 272000,
    },
    cost: {
      input: 15,
      output: 120,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.1', {
    name: 'GPT-5.1',
    created: '2025-11-13',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.2', {
    name: 'GPT-5.2',
    created: '2025-12-11',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.75,
      output: 14,
      cache_read: 0.175,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.2-pro', {
    name: 'GPT-5.2 Pro',
    created: '2025-12-11',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 21,
      output: 168,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.3-codex', {
    name: 'GPT-5.3 Codex',
    created: '2026-02-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.75,
      output: 14,
      cache_read: 0.175,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.3-codex-spark', {
    name: 'GPT-5.3 Codex Spark',
    created: '2026-02-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 32000,
    },
    cost: {
      input: 1.75,
      output: 14,
      cache_read: 0.175,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.4', {
    name: 'GPT-5.4',
    created: '2026-03-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2.5,
      output: 15,
      cache_read: 0.25,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.4-mini', {
    name: 'GPT-5.4 mini',
    created: '2026-03-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.75,
      output: 4.5,
      cache_read: 0.075,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.4-nano', {
    name: 'GPT-5.4 nano',
    created: '2026-03-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.2,
      output: 1.25,
      cache_read: 0.02,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.4-pro', {
    name: 'GPT-5.4 Pro',
    created: '2026-03-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 30,
      output: 180,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.5', {
    name: 'GPT-5.5',
    created: '2026-04-23',
    knowledge: '2025-12-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.5-pro', {
    name: 'GPT-5.5 Pro',
    created: '2026-04-23',
    knowledge: '2025-12-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 30,
      output: 180,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.6', {
    name: 'GPT-5.6',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.4,
      cache_write: 5,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.6-luna', {
    name: 'GPT-5.6 Luna',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.2,
      output: 1.2,
      cache_read: 0.02,
      cache_write: 0.25,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.6-sol', {
    name: 'GPT-5.6 Sol',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.4,
      cache_write: 5,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-5.6-terra', {
    name: 'GPT-5.6 Terra',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-6-astra', {
    name: 'GPT-6 Astra',
    created: '2026-09-04',
    knowledge: '2026-04-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-6-luna', {
    name: 'GPT-6 Luna',
    created: '2026-09-22',
    knowledge: '2026-05-18',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.1,
      output: 0.5,
      cache_read: 0.01,
      cache_write: 0.125,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-6-sol', {
    name: 'GPT-6 Sol',
    created: '2026-09-22',
    knowledge: '2026-04-20',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-6.1-sol', {
    name: 'GPT-6.1 Sol',
    created: '2026-09-29',
    knowledge: '2026-04-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.1,
      cache_write: 2.5,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-daybreak-blue-latest', {
    name: 'Daybreak Blue',
    created: '2026-08-07',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.4,
      cache_write: 5,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-daybreak-red-latest', {
    name: 'Daybreak Red',
    created: '2026-08-07',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 12.5,
      output: 75,
      cache_read: 1.25,
      cache_write: 15.625,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-image-1-mini', {
    name: 'gpt-image-1-mini',
    created: '2025-09-26',
    modalities: {
      input: ['text', 'image'],
      output: ['text', 'image'],
    },
    operations: ['chat.completions', 'images.generations'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 0,
      output: 0,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-image-1.5', {
    name: 'gpt-image-1.5',
    created: '2025-11-25',
    modalities: {
      input: ['text', 'image'],
      output: ['text', 'image'],
    },
    operations: ['chat.completions', 'images.generations'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 0,
      output: 0,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-image-2', {
    name: 'gpt-image-2',
    created: '2026-04-21',
    modalities: {
      input: ['text', 'image'],
      output: ['image'],
    },
    operations: ['images.generations'],
    capabilities: {
      vision: true,
      promptCaching: true,
    },
    context: {
      input: 0,
      output: 0,
    },
    cost: {
      input: 5,
      output: 30,
      cache_read: 1.25,
    },
    providers: ['openai'],
  }),
  model('openai/gpt-realtime-2.1', {
    name: 'GPT-Realtime-2.1',
    created: '2026-07-06',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'audio', 'image'],
      output: ['text', 'audio'],
    },
    operations: ['chat.completions', 'audio.speech', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 32000,
    },
    cost: {
      input: 4,
      output: 24,
      cache_read: 0.4,
    },
    providers: ['openai'],
  }),
  model('openai/o3', {
    name: 'o3',
    created: '2025-04-16',
    knowledge: '2024-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 2,
      output: 8,
      cache_read: 0.5,
    },
    providers: ['openai'],
  }),
  model('openai/o3-pro', {
    name: 'o3-pro',
    created: '2025-06-10',
    knowledge: '2024-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 20,
      output: 80,
    },
    providers: ['openai'],
  }),
  model('openai/text-embedding-3-large', {
    name: 'text-embedding-3-large',
    created: '2024-01-25',
    knowledge: '2024-01',
    modalities: {
      input: ['text'],
      output: ['embedding'],
    },
    operations: ['embeddings'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 8191,
      output: 3072,
    },
    cost: {
      input: 0.13,
      output: 0,
    },
    providers: ['openai'],
  }),
  model('openai/text-embedding-3-small', {
    name: 'text-embedding-3-small',
    created: '2024-01-25',
    knowledge: '2024-01',
    modalities: {
      input: ['text'],
      output: ['embedding'],
    },
    operations: ['embeddings'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 8191,
      output: 1536,
    },
    cost: {
      input: 0.02,
      output: 0,
    },
    providers: ['openai'],
  }),
  model('openai/text-embedding-ada-002', {
    name: 'text-embedding-ada-002',
    created: '2022-12-15',
    knowledge: '2022-12',
    modalities: {
      input: ['text'],
      output: ['embedding'],
    },
    operations: ['embeddings'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 8192,
      output: 1536,
    },
    cost: {
      input: 0.1,
      output: 0,
    },
    providers: ['openai'],
  }),
  model('openrouter/~anthropic/claude-fable-latest', {
    name: 'Claude Fable Latest',
    created: '2026-06-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 0.25,
      cache_write: 12.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~anthropic/claude-haiku-latest', {
    name: 'Claude Haiku Latest',
    created: '2026-04-27',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 1,
      output: 5,
      cache_read: 0.1,
      cache_write: 1.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~anthropic/claude-opus-latest', {
    name: 'Claude Opus Latest',
    created: '2026-04-21',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.2,
      cache_write: 5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~anthropic/claude-sonnet-latest', {
    name: 'Claude Sonnet Latest',
    created: '2026-04-27',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~deepseek/deepseek-flash-latest', {
    name: 'DeepSeek Flash Latest',
    created: '2026-09-14',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 0.02,
      output: 0.6,
      cache_read: 0.02,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~deepseek/deepseek-pro-latest', {
    name: 'DeepSeek Pro Latest',
    created: '2026-09-14',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 393216,
    },
    cost: {
      input: 0.2,
      output: 3.5,
      cache_read: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~deepseek/deepseek-v4-flash-latest', {
    name: 'DeepSeek V4 Flash Latest',
    created: '2026-08-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 0.01,
      output: 1.28,
      cache_read: 0.01,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~google/gemini-flash-latest', {
    name: 'Gemini Flash Latest',
    created: '2026-04-27',
    knowledge: '2025-01-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.75,
      output: 3.75,
      cache_read: 0.075,
      cache_write: 0.041667,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~google/gemini-pro-latest', {
    name: 'Gemini Pro Latest',
    created: '2026-04-27',
    knowledge: '2025-01',
    modalities: {
      input: ['audio', 'image', 'text', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
      cache_write: 0.375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~moonshotai/kimi-latest', {
    name: 'Kimi Latest',
    created: '2026-04-27',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 0.4,
      output: 9,
      cache_read: 0.4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~openai/gpt-astra-latest', {
    name: 'GPT Astra Latest',
    created: '2026-09-11',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~openai/gpt-luna-latest', {
    name: 'GPT Luna Latest',
    created: '2026-09-11',
    knowledge: '2026-02-16',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.1,
      output: 0.5,
      cache_read: 0.01,
      cache_write: 0.125,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~openai/gpt-mini-latest', {
    name: 'GPT Mini Latest',
    created: '2026-04-27',
    knowledge: '2025-08-31',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.75,
      output: 4.5,
      cache_read: 0.075,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~openai/gpt-sol-latest', {
    name: 'GPT Sol Latest',
    created: '2026-09-11',
    knowledge: '2026-02-16',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.1,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~openai/gpt-terra-latest', {
    name: 'GPT Terra Latest',
    created: '2026-09-11',
    knowledge: '2026-02-16',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~x-ai/grok-latest', {
    name: 'Grok Latest',
    created: '2026-07-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 450000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~z-ai/glm-flash-latest', {
    name: 'GLM Flash Latest',
    created: '2026-08-27',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 0.02,
      output: 0.3,
      cache_read: 0.01,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/~z-ai/glm-latest', {
    name: 'GLM Latest',
    created: '2026-08-19',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.12,
      output: 4,
      cache_read: 0.12,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/aion-labs/aion-2.0', {
    name: 'Aion-2.0',
    created: '2026-02-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.8,
      output: 1.6,
      cache_read: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/aion-labs/aion-3.0', {
    name: 'Aion-3.0',
    created: '2026-07-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 3,
      output: 6,
      cache_read: 0.75,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/aion-labs/aion-3.0-mini', {
    name: 'Aion-3.0-Mini',
    created: '2026-07-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.7,
      output: 1.4,
      cache_read: 0.18,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/aion-labs/aion-3.5', {
    name: 'Aion 3.5',
    created: '2026-09-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 3,
      output: 6,
      cache_read: 0.75,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/aion-labs/aion-3.5-mini', {
    name: 'Aion 3.5 Mini',
    created: '2026-09-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.7,
      output: 1.4,
      cache_read: 0.18,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/aion-labs/aion-rp-llama-3.1-8b', {
    name: 'Aion-RP 1.0 (8B)',
    created: '2025-02-04',
    knowledge: '2023-12-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 32768,
      output: 29491,
    },
    cost: {
      input: 0.8,
      output: 1.6,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/amazon/nova-2-lite-v1', {
    name: 'Nova 2 Lite',
    created: '2025-12-02',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65535,
    },
    cost: {
      input: 0.3,
      output: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/amazon/nova-lite-v1', {
    name: 'Nova Lite 1.0',
    created: '2024-12-05',
    knowledge: '2024-10-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 5120,
    },
    cost: {
      input: 0.06,
      output: 0.24,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/amazon/nova-micro-v1', {
    name: 'Nova Micro 1.0',
    created: '2024-12-05',
    knowledge: '2024-10-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 5120,
    },
    cost: {
      input: 0.035,
      output: 0.14,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/amazon/nova-premier-v1', {
    name: 'Nova Premier 1.0',
    created: '2025-10-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 32000,
    },
    cost: {
      input: 2.5,
      output: 12.5,
      cache_read: 0.625,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/amazon/nova-pro-v1', {
    name: 'Nova Pro 1.0',
    created: '2024-12-05',
    knowledge: '2024-10-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 5120,
    },
    cost: {
      input: 0.8,
      output: 3.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthracite-org/magnum-v4-72b', {
    name: 'Magnum v4 72B',
    created: '2024-10-22',
    knowledge: '2024-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 4096,
    },
    cost: {
      input: 2.5,
      output: 5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-fable-5', {
    name: 'Claude Fable 5',
    created: '2026-06-09',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-fable-5.1', {
    name: 'Claude Fable 5.1',
    created: '2026-09-01',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 0.25,
      cache_write: 12.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-haiku-4.5', {
    name: 'Claude Haiku 4.5 (latest)',
    created: '2025-10-15',
    knowledge: '2025-02-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 1,
      output: 5,
      cache_read: 0.1,
      cache_write: 1.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-opus-4.1', {
    name: 'Claude Opus 4.1 (latest)',
    created: '2025-08-05',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 32000,
    },
    cost: {
      input: 15,
      output: 75,
      cache_read: 1.5,
      cache_write: 18.75,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-opus-4.5', {
    name: 'Claude Opus 4.5 (latest)',
    created: '2025-11-24',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-opus-4.6', {
    name: 'Claude Opus 4.6',
    created: '2026-02-05',
    knowledge: '2025-05-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-opus-4.7', {
    name: 'Claude Opus 4.7',
    created: '2026-04-16',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-opus-4.8', {
    name: 'Claude Opus 4.8',
    created: '2026-05-28',
    knowledge: '2026-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-opus-5', {
    name: 'Claude Opus 5',
    created: '2026-07-24',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-opus-5.5', {
    name: 'Claude Opus 5.5',
    created: '2026-09-22',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.2,
      cache_write: 5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-sonnet-4', {
    name: 'Claude Sonnet 4',
    created: '2025-05-22',
    knowledge: '2025-01-31',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-sonnet-4.5', {
    name: 'Claude Sonnet 4.5 (latest)',
    created: '2025-09-29',
    knowledge: '2025-07-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-sonnet-4.6', {
    name: 'Claude Sonnet 4.6',
    created: '2026-02-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-sonnet-5', {
    name: 'Claude Sonnet 5',
    created: '2026-06-30',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/anthropic/claude-sonnet-5.5', {
    name: 'Claude Sonnet 5.5',
    created: '2026-09-28',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/arcee-ai/trinity-large-thinking', {
    name: 'Trinity Large Thinking',
    created: '2026-04-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 80000,
    },
    cost: {
      input: 0.25,
      output: 0.8,
      cache_read: 0.06,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/baidu/ernie-4.5-vl-424b-a47b', {
    name: 'ERNIE 4.5 VL 424B A47B ',
    created: '2025-06-30',
    knowledge: '2025-03-31',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 123000,
      output: 16000,
    },
    cost: {
      input: 0.42,
      output: 1.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/bytedance-seed/seed-1.6', {
    name: 'Seed 1.6',
    created: '2025-12-23',
    modalities: {
      input: ['image', 'text', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.25,
      output: 2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/bytedance-seed/seed-1.6-flash', {
    name: 'Seed 1.6 Flash',
    created: '2025-12-23',
    modalities: {
      input: ['image', 'text', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.075,
      output: 0.3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/bytedance-seed/seed-2-1-turbo', {
    name: 'Seed 2.1 Turbo',
    created: '2026-08-12',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.5,
      output: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/bytedance-seed/seed-2.0-code', {
    name: 'Seed 2.0 Code',
    created: '2026-02-14',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0.5,
      output: 3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/bytedance-seed/seed-2.0-lite', {
    name: 'Seed 2.0 Lite',
    created: '2026-02-14',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0.25,
      output: 2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/bytedance-seed/seed-2.0-mini', {
    name: 'Seed 2.0 Mini',
    created: '2026-02-14',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0.1,
      output: 0.4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/bytedance/ui-tars-1.5-7b', {
    name: 'UI-TARS 7B ',
    created: '2025-07-22',
    knowledge: '2025-01-31',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 2048,
    },
    cost: {
      input: 0.1,
      output: 0.2,
      cache_read: 0.1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/cognitivecomputations/dolphin-mistral-24b-venice-edition', {
    name: 'Uncensored',
    created: '2025-07-09',
    knowledge: '2024-04-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8192,
    },
    cost: {
      input: 0.2,
      output: 0.9,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/cohere/command-a', {
    name: 'Command A',
    created: '2025-03-13',
    knowledge: '2024-08-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 8192,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/cohere/command-a-plus', {
    name: 'Command A+',
    created: '2026-09-22',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 192000,
      output: 64000,
    },
    cost: {
      input: 0.3,
      output: 1.5,
      cache_read: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/cohere/command-r-08-2024', {
    name: 'Command R',
    created: '2024-08-30',
    knowledge: '2024-06-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4000,
    },
    cost: {
      input: 0.15,
      output: 0.6,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/cohere/command-r-plus-08-2024', {
    name: 'Command R+',
    created: '2024-08-30',
    knowledge: '2024-06-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4000,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/cohere/command-r7b-12-2024', {
    name: 'Command R7B',
    created: '2024-12-02',
    knowledge: '2024-06-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4000,
    },
    cost: {
      input: 0.0375,
      output: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/cohere/north-mini-code:free', {
    name: 'North Mini Code (free)',
    created: '2026-06-17',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 256000,
      output: 64000,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-chat', {
    name: 'DeepSeek Chat',
    created: '2025-12-01',
    knowledge: '2025-09',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 16000,
    },
    cost: {
      input: 0.2574,
      output: 1.0287,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-chat-v3-0324', {
    name: 'DeepSeek V3 0324',
    created: '2025-03-24',
    knowledge: '2024-07-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 147456,
    },
    cost: {
      input: 0.29,
      output: 1.14,
      cache_read: 0.11,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-chat-v3.1', {
    name: 'DeepSeek V3.1',
    created: '2025-08-21',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 32768,
    },
    cost: {
      input: 0.25,
      output: 0.95,
      cache_read: 0.13,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-r1', {
    name: 'DeepSeek-R1',
    created: '2025-01-20',
    knowledge: '2024-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 64000,
      output: 16000,
    },
    cost: {
      input: 0.7,
      output: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-r1-0528', {
    name: 'R1 0528',
    created: '2025-05-28',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 32768,
    },
    cost: {
      input: 0.5,
      output: 2.15,
      cache_read: 0.35,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-v3.1-terminus', {
    name: 'DeepSeek V3.1 Terminus',
    created: '2025-09-22',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 65536,
    },
    cost: {
      input: 0.3,
      output: 1,
      cache_read: 0.135,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-v3.2', {
    name: 'DeepSeek V3.2',
    created: '2025-12-01',
    knowledge: '2024-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 65536,
    },
    cost: {
      input: 0.28,
      output: 0.42,
      cache_read: 0.028,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-v3.2-exp', {
    name: 'DeepSeek V3.2 Exp',
    created: '2025-09-29',
    knowledge: '2025-07-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 163840,
      output: 147456,
    },
    cost: {
      input: 0.27,
      output: 0.41,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-v4-flash', {
    name: 'DeepSeek V4 Flash',
    created: '2026-04-24',
    knowledge: '2025-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['high', 'xhigh'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.14,
      output: 0.28,
      cache_read: 0.028,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-v4-flash-0731', {
    name: 'DeepSeek V4 Flash 0731',
    created: '2026-07-31',
    knowledge: '2025-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 0.01,
      output: 1.28,
      cache_read: 0.01,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-v4-flash-vision-exp', {
    name: 'DeepSeek V4 Flash Vision Exp',
    created: '2026-08-21',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 262144,
    },
    cost: {
      input: 0.2156,
      output: 0.6468,
      cache_read: 0.00686,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-v4-pro', {
    name: 'DeepSeek V4 Pro',
    created: '2026-04-24',
    knowledge: '2025-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['high', 'xhigh'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 384000,
    },
    cost: {
      input: 0.95526,
      output: 1.91052,
      cache_read: 0.079605,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-v4-pro-0813', {
    name: 'DeepSeek V4 Pro 0813',
    created: '2026-08-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 393216,
    },
    cost: {
      input: 0.66,
      output: 1.98,
      cache_read: 0.022,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/deepseek/deepseek-v4.1-flash', {
    name: 'DeepSeek V4.1 Flash',
    created: '2026-09-10',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.006,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/dots-studio/dots-3-note-preview:free', {
    name: 'Dots3-Note Preview (free)',
    created: '2026-08-14',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 512000,
      output: 460800,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/fireworks/ember-1', {
    name: 'Ember-1',
    created: '2026-09-24',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-2.5-flash', {
    name: 'Gemini 2.5 Flash',
    created: '2025-06-17',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65535,
    },
    cost: {
      input: 0.3,
      output: 2.5,
      cache_read: 0.03,
      cache_write: 0.083333,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-2.5-flash-lite', {
    name: 'Gemini 2.5 Flash-Lite',
    created: '2025-06-17',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65535,
    },
    cost: {
      input: 0.1,
      output: 0.4,
      cache_read: 0.01,
      cache_write: 0.083333,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-2.5-pro', {
    name: 'Gemini 2.5 Pro',
    created: '2025-06-17',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 128,
          max: 32768,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
      cache_write: 0.375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-2.5-pro-preview', {
    name: 'Gemini 2.5 Pro Preview 06-05',
    created: '2025-06-05',
    knowledge: '2025-01-31',
    modalities: {
      input: ['image', 'text', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 128,
          max: 32768,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
      cache_write: 0.375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-3-flash-preview', {
    name: 'Gemini 3 Flash Preview',
    created: '2025-12-17',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.5,
      output: 3,
      cache_read: 0.05,
      cache_write: 0.083333,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-3.1-flash-lite', {
    name: 'Gemini 3.1 Flash Lite',
    created: '2026-05-07',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.25,
      output: 1.5,
      cache_read: 0.025,
      cache_write: 0.083333,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-3.1-flash-lite-preview', {
    name: 'Gemini 3.1 Flash Lite Preview',
    created: '2026-03-03',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.25,
      output: 1.5,
      cache_read: 0.025,
      cache_write: 0.083333,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-3.1-pro-preview', {
    name: 'Gemini 3.1 Pro Preview',
    created: '2026-02-19',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
      cache_write: 0.375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-3.1-pro-preview-customtools', {
    name: 'Gemini 3.1 Pro Preview Custom Tools',
    created: '2026-02-19',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
      cache_write: 0.375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-3.5-flash', {
    name: 'Gemini 3.5 Flash',
    created: '2026-05-19',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 1.5,
      output: 9,
      cache_read: 0.15,
      cache_write: 0.083333,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-3.5-flash-lite', {
    name: 'Gemini 3.5 Flash Lite',
    created: '2026-07-21',
    knowledge: '2026-03',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.3,
      output: 2.5,
      cache_read: 0.03,
      cache_write: 0.083333,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-3.6-flash', {
    name: 'Gemini 3.6 Flash',
    created: '2026-07-21',
    knowledge: '2026-03',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.75,
      output: 3.75,
      cache_read: 0.075,
      cache_write: 0.041667,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-3.7-flash', {
    name: 'Gemini 3.7 Flash',
    created: '2026-08-13',
    knowledge: '2026-03',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.75,
      output: 3.75,
      cache_read: 0.075,
      cache_write: 0.041667,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemini-3.8-flash', {
    name: 'Gemini 3.8 Flash',
    created: '2026-09-02',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.75,
      output: 3.75,
      cache_read: 0.075,
      cache_write: 0.041667,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemma-2-27b-it', {
    name: 'Gemma 2 27B',
    created: '2024-07-13',
    knowledge: '2024-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 8192,
      output: 2048,
    },
    cost: {
      input: 0.65,
      output: 0.65,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemma-3-12b-it', {
    name: 'Gemma 3 12B IT',
    created: '2025-03-12',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.05,
      output: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemma-3-27b-it', {
    name: 'Gemma 3 27B IT',
    created: '2025-03-12',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 0.08,
      output: 0.45,
      cache_read: 0.04,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemma-3-4b-it', {
    name: 'Gemma 3 4B IT',
    created: '2025-03-12',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.05,
      output: 0.1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemma-4-26b-a4b-it', {
    name: 'Gemma 4 26B A4B IT',
    created: '2026-04-02',
    modalities: {
      input: ['image', 'text', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.0765,
      output: 0.255,
      cache_read: 0.0425,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemma-4-26b-a4b-it:free', {
    name: 'Gemma 4 26B A4B  (free)',
    created: '2026-04-02',
    modalities: {
      input: ['image', 'text', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemma-4-31b-it', {
    name: 'Gemma 4 31B IT',
    created: '2026-04-02',
    modalities: {
      input: ['image', 'text', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 16384,
    },
    cost: {
      input: 0.09,
      output: 0.34,
      cache_read: 0.05,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/google/gemma-4-31b-it:free', {
    name: 'Gemma 4 31B (free)',
    created: '2026-04-02',
    modalities: {
      input: ['image', 'text', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/gryphe/mythomax-l2-13b', {
    name: 'MythoMax 13B',
    created: '2023-07-02',
    knowledge: '2023-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 8192,
      output: 3686,
    },
    cost: {
      input: 0.08,
      output: 0.11,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/ibm-granite/granite-4.0-h-micro', {
    name: 'Granite 4.0 Micro',
    created: '2025-10-20',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 131000,
      output: 117900,
    },
    cost: {
      input: 0.017,
      output: 0.112,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/ibm-granite/granite-4.2-8b', {
    name: 'Granite 4.2 8B',
    created: '2026-08-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 0.06,
      output: 0.25,
      cache_read: 0.015,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/inception/mercury-2', {
    name: 'Mercury 2',
    created: '2026-03-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 50000,
    },
    cost: {
      input: 0.25,
      output: 0.75,
      cache_read: 0.025,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/inception/mercury-2.5', {
    name: 'Mercury 2.5',
    created: '2026-09-08',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 260000,
      output: 65536,
    },
    cost: {
      input: 0.04,
      output: 0.15,
      cache_read: 0.004,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/inclusionai/ling-3.0-flash', {
    name: 'Ling 3.0 Flash',
    created: '2026-07-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.021,
      output: 0.063,
      cache_read: 0.0042,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/inclusionai/ling-3.0-flash-fin', {
    name: 'Ling 3.0 Flash Fin',
    created: '2026-08-27',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.06,
      output: 0.18,
      cache_read: 0.012,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/inclusionai/ling-3.0-flash-sante:free', {
    name: 'Ling 3.0 Flash Sante (free)',
    created: '2026-09-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/inclusionai/ling-3.0-flash-vl', {
    name: 'Ling 3.0 Flash VL',
    created: '2026-09-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.021,
      output: 0.0616,
      cache_read: 0.0042,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/inference-net/schematron-v2-small', {
    name: 'Schematron V2 Small',
    created: '2026-09-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0.05,
      output: 0.23,
      cache_read: 0.05,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/inference-net/schematron-v2-turbo', {
    name: 'Schematron V2 Turbo',
    created: '2026-09-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8192,
    },
    cost: {
      input: 0.03,
      output: 0.15,
      cache_read: 0.03,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/kwaipilot/kat-coder-pro-v2.5', {
    name: 'KAT-Coder-Pro V2.5',
    created: '2026-07-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.74,
      output: 2.96,
      cache_read: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/liquid/lfm-2.5-2.6b:free', {
    name: 'LFM2.5-2.6B (free)',
    created: '2026-08-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 65536,
      output: 8192,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mancer/weaver', {
    name: 'Weaver (alpha)',
    created: '2023-08-02',
    knowledge: '2023-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 8000,
      output: 6000,
    },
    cost: {
      input: 0.4,
      output: 0.75,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meituan/longcat-2.0', {
    name: 'LongCat 2.0',
    created: '2026-07-20',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048756,
      output: 262144,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.006,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta-llama/llama-3.1-70b-instruct', {
    name: 'Llama-3.1-70B-Instruct',
    created: '2024-07-23',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.4,
      output: 0.4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta-llama/llama-3.1-8b-instruct', {
    name: 'Llama-3.1-8B-Instruct',
    created: '2024-07-23',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 0.05,
      output: 0.08,
      cache_read: 0.025,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta-llama/llama-3.2-1b-instruct', {
    name: 'Llama 3.2 1B Instruct',
    created: '2024-09-25',
    knowledge: '2023-12-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 60000,
      output: 54000,
    },
    cost: {
      input: 0.027,
      output: 0.201,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta-llama/llama-3.2-3b-instruct', {
    name: 'Llama 3.2 3B Instruct',
    created: '2024-09-25',
    knowledge: '2023-12-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 0.05,
      output: 0.33,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta-llama/llama-3.3-70b-instruct', {
    name: 'Llama-3.3-70B-Instruct',
    created: '2024-12-06',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.1,
      output: 0.32,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta-llama/llama-4-maverick', {
    name: 'Llama 4 Maverick',
    created: '2025-04-05',
    knowledge: '2024-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 16384,
    },
    cost: {
      input: 0.1875,
      output: 0.6525,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta-llama/llama-4-scout', {
    name: 'Llama 4 Scout',
    created: '2025-04-05',
    knowledge: '2024-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 1310720,
      output: 16384,
    },
    cost: {
      input: 0.1,
      output: 0.3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta-llama/llama-guard-4-12b', {
    name: 'Llama Guard 4 12B',
    created: '2025-04-30',
    knowledge: '2024-08-31',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 16384,
    },
    cost: {
      input: 0.18,
      output: 0.18,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta/muse-glimmer-30b', {
    name: 'Muse Glimmer 30B',
    created: '2026-08-10',
    knowledge: '2026-01-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 0.35,
      output: 1.5,
      cache_read: 0.04,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta/muse-spark-1.1', {
    name: 'Muse Spark 1.1',
    created: '2026-04-08',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 1.25,
      output: 4.25,
      cache_read: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta/muse-spark-1.2', {
    name: 'Muse Spark 1.2',
    created: '2026-08-05',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 1.25,
      output: 4.25,
      cache_read: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta/muse-spark-1.2-contributor', {
    name: 'Muse Spark 1.2 Contributor',
    created: '2026-08-21',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 0.1,
      output: 0.2,
      cache_read: 0.002,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta/muse-spark-1.3', {
    name: 'Muse Spark 1.3',
    created: '2026-09-02',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 1.25,
      output: 4.25,
      cache_read: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/meta/muse-spark-1.3-contributor', {
    name: 'Muse Spark 1.3 Contributor',
    created: '2026-09-02',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 0.1,
      output: 0.2,
      cache_read: 0.002,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/microsoft/phi-4', {
    name: 'Phi 4',
    created: '2025-01-10',
    knowledge: '2024-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 16384,
      output: 14745,
    },
    cost: {
      input: 0.07,
      output: 0.14,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/microsoft/wizardlm-2-8x22b', {
    name: 'WizardLM-2 8x22B',
    created: '2024-04-16',
    knowledge: '2024-04-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 65535,
      output: 8000,
    },
    cost: {
      input: 0.62,
      output: 0.62,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/minimax/minimax-01', {
    name: 'MiniMax-01',
    created: '2025-01-15',
    knowledge: '2024-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000192,
      output: 40000,
    },
    cost: {
      input: 0.2,
      output: 1.1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/minimax/minimax-m1', {
    name: 'MiniMax M1',
    created: '2025-06-17',
    knowledge: '2024-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 40000,
    },
    cost: {
      input: 0.4,
      output: 2.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/minimax/minimax-m2', {
    name: 'MiniMax-M2',
    created: '2025-10-27',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 176947,
    },
    cost: {
      input: 0.3,
      output: 1.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/minimax/minimax-m2-her', {
    name: 'MiniMax-M2 Her',
    created: '2026-01-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 65536,
      output: 2048,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.03,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/minimax/minimax-m2.1', {
    name: 'MiniMax-M2.1',
    created: '2025-12-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 131072,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.03,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/minimax/minimax-m2.5', {
    name: 'MiniMax-M2.5',
    created: '2026-02-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 128000,
    },
    cost: {
      input: 0.27,
      output: 1.08,
      cache_read: 0.027,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/minimax/minimax-m2.7', {
    name: 'MiniMax-M2.7',
    created: '2026-03-18',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 176947,
    },
    cost: {
      input: 0.21,
      output: 0.84,
      cache_read: 0.042,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/minimax/minimax-m3', {
    name: 'MiniMax-M3',
    created: '2026-06-01',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 512000,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.06,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/codestral-2508', {
    name: 'Codestral 2508',
    created: '2025-08-01',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 204800,
    },
    cost: {
      input: 0.3,
      output: 0.9,
      cache_read: 0.03,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/devstral-2512', {
    name: 'Devstral 2',
    created: '2025-12-09',
    knowledge: '2025-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 209715,
    },
    cost: {
      input: 0.4,
      output: 2,
      cache_read: 0.04,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/ministral-14b-2512', {
    name: 'Ministral 3 14B 2512',
    created: '2025-12-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 209715,
    },
    cost: {
      input: 0.2,
      output: 0.2,
      cache_read: 0.02,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/ministral-3b-2512', {
    name: 'Ministral 3 3B 2512',
    created: '2025-12-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 104857,
    },
    cost: {
      input: 0.1,
      output: 0.1,
      cache_read: 0.01,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/ministral-8b-2512', {
    name: 'Ministral 3 8B 2512',
    created: '2025-12-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 209715,
    },
    cost: {
      input: 0.15,
      output: 0.15,
      cache_read: 0.015,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-large', {
    name: 'Mistral Large',
    created: '2024-02-26',
    knowledge: '2024-11-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 102400,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-large-2407', {
    name: 'Mistral Large 2407',
    created: '2024-11-19',
    knowledge: '2024-03-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 104857,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-large-2512', {
    name: 'Mistral Large 3',
    created: '2025-12-02',
    knowledge: '2024-11',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 209715,
    },
    cost: {
      input: 0.5,
      output: 1.5,
      cache_read: 0.05,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-medium-3', {
    name: 'Mistral Medium 3',
    created: '2025-05-07',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 104857,
    },
    cost: {
      input: 0.4,
      output: 2,
      cache_read: 0.04,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-medium-3-5', {
    name: 'Mistral Medium 3.5',
    created: '2026-04-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 209715,
    },
    cost: {
      input: 1.5,
      output: 7.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-medium-3.1', {
    name: 'Mistral Medium 3.1',
    created: '2025-08-13',
    knowledge: '2025-06-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 104857,
    },
    cost: {
      input: 0.4,
      output: 2,
      cache_read: 0.04,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-nemo', {
    name: 'Mistral Nemo',
    created: '2024-07-01',
    knowledge: '2024-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.019,
      output: 0.03,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-saba', {
    name: 'Saba',
    created: '2025-02-17',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 26214,
    },
    cost: {
      input: 0.2,
      output: 0.6,
      cache_read: 0.02,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-small-24b-instruct-2501', {
    name: 'Mistral Small 3',
    created: '2025-01-30',
    knowledge: '2023-10-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 16384,
    },
    cost: {
      input: 0.05,
      output: 0.08,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-small-2603', {
    name: 'Mistral Small 4',
    created: '2026-03-16',
    knowledge: '2025-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 209715,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.015,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-small-3.1-24b-instruct', {
    name: 'Mistral Small 3.1 24B',
    created: '2025-03-17',
    knowledge: '2023-10-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 102400,
    },
    cost: {
      input: 0.351,
      output: 0.555,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mistral-small-3.2-24b-instruct', {
    name: 'Mistral Small 3.2 24B',
    created: '2025-06-20',
    knowledge: '2023-10-31',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 16384,
    },
    cost: {
      input: 0.09375,
      output: 0.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/mixtral-8x22b-instruct', {
    name: 'Mixtral 8x22B Instruct',
    created: '2024-04-17',
    knowledge: '2024-01-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 65536,
      output: 52428,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/mistralai/voxtral-small-24b-2507', {
    name: 'Voxtral Small 24B 2507',
    created: '2025-07-15',
    modalities: {
      input: ['text', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 26214,
    },
    cost: {
      input: 0.1,
      output: 0.3,
      cache_read: 0.01,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/moonshotai/kimi-k2', {
    name: 'Kimi K2 0711',
    created: '2025-07-11',
    knowledge: '2024-12-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 98304,
    },
    cost: {
      input: 0.57,
      output: 2.3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/moonshotai/kimi-k2-0905', {
    name: 'Kimi K2 0905',
    created: '2025-09-04',
    knowledge: '2024-12-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 98304,
    },
    cost: {
      input: 0.6,
      output: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/moonshotai/kimi-k2-thinking', {
    name: 'Kimi K2 Thinking',
    created: '2025-11-06',
    knowledge: '2024-08',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 98304,
    },
    cost: {
      input: 0.6,
      output: 2.5,
      cache_read: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/moonshotai/kimi-k2.5', {
    name: 'Kimi K2.5',
    created: '2026-01',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.45,
      output: 2.25,
      cache_read: 0.07,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/moonshotai/kimi-k2.6', {
    name: 'Kimi K2.6',
    created: '2026-04-21',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.65,
      output: 3.41,
      cache_read: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/moonshotai/kimi-k2.7-code', {
    name: 'Kimi K2.7 Code',
    created: '2026-06-12',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.6712,
      output: 3.35,
      cache_read: 0.18,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/moonshotai/kimi-k3', {
    name: 'Kimi K3',
    created: '2026-07-16',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/morph/morph-v3-fast', {
    name: 'Morph V3 Fast',
    created: '2025-07-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 81920,
      output: 38000,
    },
    cost: {
      input: 0.8,
      output: 1.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/morph/morph-v3-large', {
    name: 'Morph V3 Large',
    created: '2025-07-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0.9,
      output: 1.9,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nex-agi/nex-n2.5-mini', {
    name: 'Nex-N2.5-Mini',
    created: '2026-09-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.025,
      output: 0.1,
      cache_read: 0.0025,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nex-agi/nex-n2.5-pro', {
    name: 'Nex-N2.5-Pro',
    created: '2026-09-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.075,
      output: 0.25,
      cache_read: 0.015,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nousresearch/hermes-3-llama-3.1-405b', {
    name: 'Hermes 3 405B Instruct',
    created: '2024-08-16',
    knowledge: '2023-12-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 1,
      output: 1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nousresearch/hermes-3-llama-3.1-70b', {
    name: 'Hermes 3 70B Instruct',
    created: '2024-08-18',
    knowledge: '2023-12-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.7,
      output: 0.7,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nousresearch/hermes-4-405b', {
    name: 'Hermes 4 405B',
    created: '2025-08-26',
    knowledge: '2024-08-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 1,
      output: 3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nvidia/nemotron-3-nano-30b-a3b', {
    name: 'Nemotron 3 Nano 30B A3B',
    created: '2025-12-15',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.05,
      output: 0.2,
      cache_read: 0.03,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', {
    name: 'Nemotron 3 Nano Omni (free)',
    created: '2026-04-28',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 65536,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nvidia/nemotron-3-super-120b-a12b', {
    name: 'Nemotron 3 Super 120B A12B',
    created: '2026-03-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.08,
      output: 0.45,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nvidia/nemotron-3-super-120b-a12b:free', {
    name: 'Nemotron 3 Super (free)',
    created: '2026-03-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nvidia/nemotron-3-ultra-550b-a55b', {
    name: 'Nemotron 3 Ultra 550B A55B',
    created: '2026-06-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['medium', 'high'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 182520,
    },
    cost: {
      input: 0.6,
      output: 2.4,
      cache_read: 0.12,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', {
    name: 'Nemotron 3 Ultra (free)',
    created: '2026-06-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['medium', 'high'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65536,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nvidia/nemotron-3.5-content-safety', {
    name: 'Nemotron 3.5 Content Safety',
    created: '2026-06-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 0.2,
      output: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nvidia/nemotron-3.5-content-safety:free', {
    name: 'Nemotron 3.5 Content Safety (free)',
    created: '2026-06-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8192,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nvidia/nemotron-3.5-lightning', {
    name: 'Nemotron 3.5 Lightning 30B A3B',
    created: '2026-08-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.06,
      output: 0.16,
      cache_read: 0.03,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/nvidia/nemotron-3.5-lightning:free', {
    name: 'Nemotron 3.5 Lightning (free)',
    created: '2026-08-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65536,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-3.5-turbo', {
    name: 'GPT-3.5-turbo',
    created: '2023-03-01',
    knowledge: '2021-09-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 16385,
      output: 4096,
    },
    cost: {
      input: 0.5,
      output: 1.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-3.5-turbo-0613', {
    name: 'GPT-3.5 Turbo (older v0613)',
    created: '2024-01-25',
    knowledge: '2021-09-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 4095,
      output: 3685,
    },
    cost: {
      input: 1,
      output: 2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-3.5-turbo-16k', {
    name: 'GPT-3.5 Turbo 16k',
    created: '2023-08-28',
    knowledge: '2021-09-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 16385,
      output: 4096,
    },
    cost: {
      input: 3,
      output: 4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-3.5-turbo-instruct', {
    name: 'GPT-3.5 Turbo Instruct',
    created: '2023-09-28',
    knowledge: '2021-09-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 4095,
      output: 3685,
    },
    cost: {
      input: 1.5,
      output: 2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-4', {
    name: 'GPT-4',
    created: '2023-11-06',
    knowledge: '2023-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 8191,
      output: 4096,
    },
    cost: {
      input: 30,
      output: 60,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-4-turbo', {
    name: 'GPT-4 Turbo',
    created: '2023-11-06',
    knowledge: '2023-12',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 10,
      output: 30,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-4.1', {
    name: 'GPT-4.1',
    created: '2025-04-14',
    knowledge: '2024-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1047576,
      output: 32768,
    },
    cost: {
      input: 2,
      output: 8,
      cache_read: 0.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-4.1-mini', {
    name: 'GPT-4.1 mini',
    created: '2025-04-14',
    knowledge: '2024-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1047576,
      output: 32768,
    },
    cost: {
      input: 0.4,
      output: 1.6,
      cache_read: 0.1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-4.1-nano', {
    name: 'GPT-4.1 nano',
    created: '2025-04-14',
    knowledge: '2024-04',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1047576,
      output: 32768,
    },
    cost: {
      input: 0.1,
      output: 0.4,
      cache_read: 0.025,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-4o', {
    name: 'GPT-4o',
    created: '2024-05-13',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 2.5,
      output: 10,
      cache_read: 1.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-4o-2024-05-13', {
    name: 'GPT-4o (2024-05-13)',
    created: '2024-05-13',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 5,
      output: 15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-4o-2024-08-06', {
    name: 'GPT-4o (2024-08-06)',
    created: '2024-08-06',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 2.5,
      output: 10,
      cache_read: 1.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-4o-2024-11-20', {
    name: 'GPT-4o (2024-11-20)',
    created: '2024-11-20',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 2.5,
      output: 10,
      cache_read: 1.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-4o-mini', {
    name: 'GPT-4o mini',
    created: '2024-07-18',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.075,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-4o-mini-2024-07-18', {
    name: 'GPT-4o-mini (2024-07-18)',
    created: '2024-07-18',
    knowledge: '2023-10-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.075,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5', {
    name: 'GPT-5',
    created: '2025-08-07',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5-mini', {
    name: 'GPT-5 Mini',
    created: '2025-08-07',
    knowledge: '2024-05-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.25,
      output: 2,
      cache_read: 0.025,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5-nano', {
    name: 'GPT-5 Nano',
    created: '2025-08-07',
    knowledge: '2024-05-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.05,
      output: 0.4,
      cache_read: 0.005,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5-pro', {
    name: 'GPT-5 Pro',
    created: '2025-10-06',
    knowledge: '2024-09-30',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 15,
      output: 120,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.1', {
    name: 'GPT-5.1',
    created: '2025-11-13',
    knowledge: '2024-09-30',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.1-codex', {
    name: 'GPT-5.1 Codex',
    created: '2025-11-13',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.13,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.1-codex-max', {
    name: 'GPT-5.1 Codex Max',
    created: '2025-11-13',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.1-codex-mini', {
    name: 'GPT-5.1 Codex mini',
    created: '2025-11-13',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.25,
      output: 2,
      cache_read: 0.03,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.2', {
    name: 'GPT-5.2',
    created: '2025-12-11',
    knowledge: '2025-08-31',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.75,
      output: 14,
      cache_read: 0.175,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.2-chat', {
    name: 'GPT-5.2 Chat',
    created: '2025-12-10',
    knowledge: '2025-08-31',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 32000,
    },
    cost: {
      input: 1.75,
      output: 14,
      cache_read: 0.175,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.2-codex', {
    name: 'GPT-5.2 Codex',
    created: '2025-12-11',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.75,
      output: 14,
      cache_read: 0.175,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.2-pro', {
    name: 'GPT-5.2 Pro',
    created: '2025-12-11',
    knowledge: '2025-08-31',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 21,
      output: 168,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.3-codex', {
    name: 'GPT-5.3 Codex',
    created: '2026-02-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.75,
      output: 14,
      cache_read: 0.175,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.4', {
    name: 'GPT-5.4',
    created: '2026-03-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2.5,
      output: 15,
      cache_read: 0.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.4-mini', {
    name: 'GPT-5.4 mini',
    created: '2026-03-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.75,
      output: 4.5,
      cache_read: 0.075,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.4-nano', {
    name: 'GPT-5.4 nano',
    created: '2026-03-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.2,
      output: 1.25,
      cache_read: 0.02,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.4-pro', {
    name: 'GPT-5.4 Pro',
    created: '2026-03-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 30,
      output: 180,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.5', {
    name: 'GPT-5.5',
    created: '2026-04-23',
    knowledge: '2025-12-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.5-pro', {
    name: 'GPT-5.5 Pro',
    created: '2026-04-23',
    knowledge: '2025-12-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 30,
      output: 180,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.6-luna', {
    name: 'GPT-5.6 Luna',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.2,
      output: 1.2,
      cache_read: 0.02,
      cache_write: 0.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.6-luna-pro', {
    name: 'GPT-5.6 Luna Pro',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.2,
      output: 1.2,
      cache_read: 0.02,
      cache_write: 0.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.6-sol', {
    name: 'GPT-5.6 Sol',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.6-sol-pro', {
    name: 'GPT-5.6 Sol Pro',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.4,
      cache_write: 5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.6-terra', {
    name: 'GPT-5.6 Terra',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-5.6-terra-pro', {
    name: 'GPT-5.6 Terra Pro',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-6-astra', {
    name: 'GPT-6 Astra',
    created: '2026-09-04',
    knowledge: '2026-04-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-6-astra-pro', {
    name: 'GPT-6 Astra Pro',
    created: '2026-09-04',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-6-luna', {
    name: 'GPT-6 Luna',
    created: '2026-09-22',
    knowledge: '2026-05-18',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.1,
      output: 0.5,
      cache_read: 0.01,
      cache_write: 0.125,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-6-luna-pro', {
    name: 'GPT-6 Luna Pro',
    created: '2026-09-22',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.1,
      output: 0.5,
      cache_read: 0.01,
      cache_write: 0.125,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-6-sol', {
    name: 'GPT-6 Sol',
    created: '2026-09-22',
    knowledge: '2026-04-20',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-6-sol-pro', {
    name: 'GPT-6 Sol Pro',
    created: '2026-09-22',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-6.1-sol', {
    name: 'GPT-6.1 Sol',
    created: '2026-09-29',
    knowledge: '2026-04-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.1,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-6.1-sol-pro', {
    name: 'GPT-6.1 Sol Pro',
    created: '2026-09-29',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.1,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-chat-latest', {
    name: 'GPT Chat Latest',
    created: '2026-05-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-oss-120b', {
    name: 'GPT OSS 120B',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 0.037,
      output: 0.17,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-oss-20b', {
    name: 'GPT OSS 20B',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.018,
      output: 0.09,
      cache_read: 0.009,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/gpt-oss-safeguard-20b', {
    name: 'GPT OSS Safeguard 20B',
    created: '2025-10-29',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 65536,
    },
    cost: {
      input: 0.075,
      output: 0.3,
      cache_read: 0.0375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/o1', {
    name: 'o1',
    created: '2024-12-05',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 15,
      output: 60,
      cache_read: 7.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/o1-pro', {
    name: 'o1-pro',
    created: '2025-03-19',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 150,
      output: 600,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/o3', {
    name: 'o3',
    created: '2025-04-16',
    knowledge: '2024-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 2,
      output: 8,
      cache_read: 0.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/o3-mini', {
    name: 'o3-mini',
    created: '2024-12-20',
    knowledge: '2024-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 1.1,
      output: 4.4,
      cache_read: 0.55,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/o3-mini-high', {
    name: 'o3 Mini High',
    created: '2025-02-12',
    knowledge: '2023-10-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 1.1,
      output: 4.4,
      cache_read: 0.55,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/o3-pro', {
    name: 'o3-pro',
    created: '2025-06-10',
    knowledge: '2024-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 20,
      output: 80,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/o4-mini', {
    name: 'o4-mini',
    created: '2025-04-16',
    knowledge: '2024-05',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 1.1,
      output: 4.4,
      cache_read: 0.275,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openai/o4-mini-high', {
    name: 'o4 Mini High',
    created: '2025-04-16',
    knowledge: '2024-06-30',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 1.1,
      output: 4.4,
      cache_read: 0.275,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/openrouter/free', {
    name: 'Free Models Router',
    created: '2026-02-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 8000,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/perceptron/perceptron-mk1', {
    name: 'Perceptron Mk1',
    created: '2026-05-12',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 8192,
    },
    cost: {
      input: 0.15,
      output: 1.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/perceptron/perceptron-mk1.5', {
    name: 'Perceptron Mk1.5',
    created: '2026-09-25',
    modalities: {
      input: ['text', 'image', 'video', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 36864,
      output: 8192,
    },
    cost: {
      input: 0.15,
      output: 1.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/perplexity/sonar', {
    name: 'Sonar',
    created: '2025-01-27',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 127072,
      output: 114364,
    },
    cost: {
      input: 1,
      output: 1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/perplexity/sonar-deep-research', {
    name: 'Sonar Deep Research',
    created: '2025-03-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 128000,
      output: 115200,
    },
    cost: {
      input: 2,
      output: 8,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/perplexity/sonar-pro', {
    name: 'Sonar Pro',
    created: '2025-03-07',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 8000,
    },
    cost: {
      input: 3,
      output: 15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/perplexity/sonar-pro-search', {
    name: 'Sonar Pro Search',
    created: '2025-10-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 8000,
    },
    cost: {
      input: 3,
      output: 15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/perplexity/sonar-reasoning-pro', {
    name: 'Sonar Reasoning Pro',
    created: '2025-03-07',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 115200,
    },
    cost: {
      input: 2,
      output: 8,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/poolside/laguna-s-2.1', {
    name: 'Laguna S 2.1',
    created: '2026-07-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.09,
      output: 0.18,
      cache_read: 0.009,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/poolside/laguna-s-2.1:free', {
    name: 'Laguna S 2.1 (free)',
    created: '2026-07-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/poolside/laguna-xs-2.1', {
    name: 'Laguna XS 2.1',
    created: '2026-07-02',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.06,
      output: 0.12,
      cache_read: 0.03,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/poolside/laguna-xs-2.1:free', {
    name: 'Laguna XS 2.1 (free)',
    created: '2026-07-02',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/prism-ml/ternary-bonsai-2-27b', {
    name: 'Ternary Bonsai 2 27B',
    created: '2026-09-18',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['medium', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.075,
      output: 0.5,
      cache_read: 0.0375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen-2.5-72b-instruct', {
    name: 'Qwen2.5 72B Instruct',
    created: '2024-09-19',
    knowledge: '2024-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 16384,
    },
    cost: {
      input: 0.36,
      output: 0.4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen-2.5-7b-instruct', {
    name: 'Qwen2.5 7B Instruct',
    created: '2024-10-16',
    knowledge: '2024-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 29491,
    },
    cost: {
      input: 0.1,
      output: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen-2.5-coder-32b-instruct', {
    name: 'Qwen2.5 Coder 32B Instruct',
    created: '2024-11-11',
    knowledge: '2024-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 32768,
      output: 29491,
    },
    cost: {
      input: 0.66,
      output: 1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen-plus', {
    name: 'Qwen Plus',
    created: '2024-01-25',
    knowledge: '2024-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 32768,
    },
    cost: {
      input: 0.26,
      output: 0.78,
      cache_read: 0.052,
      cache_write: 0.325,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen-plus-2025-07-28', {
    name: 'Qwen Plus 0728',
    created: '2025-09-08',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 32768,
    },
    cost: {
      input: 0.26,
      output: 0.78,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen2.5-vl-72b-instruct', {
    name: 'Qwen2.5 VL 72B Instruct',
    created: '2025-02-01',
    knowledge: '2024-06-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 115200,
    },
    cost: {
      input: 0.8,
      output: 1,
      cache_read: 0.4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-14b', {
    name: 'Qwen3 14B',
    created: '2025-04-28',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.12,
      output: 0.24,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-235b-a22b', {
    name: 'Qwen3 235B-A22B',
    created: '2025-04',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    cost: {
      input: 0.455,
      output: 1.82,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-235b-a22b-2507', {
    name: 'Qwen3 235B A22B Instruct 2507',
    created: '2025-07-21',
    knowledge: '2025-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.0875,
      output: 0.35,
      cache_read: 0.0175,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-235b-a22b-thinking-2507', {
    name: 'Qwen3 235B A22B Thinking 2507',
    created: '2025-07-25',
    knowledge: '2025-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 0.23,
      output: 2.3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-30b-a3b', {
    name: 'Qwen3 30B A3B',
    created: '2025-04-28',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    cost: {
      input: 0.13,
      output: 0.52,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-30b-a3b-instruct-2507', {
    name: 'Qwen3 30B A3B Instruct 2507',
    created: '2025-07-29',
    knowledge: '2025-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32000,
    },
    cost: {
      input: 0.04815,
      output: 0.19305,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-30b-a3b-thinking-2507', {
    name: 'Qwen3 30B A3B Thinking 2507',
    created: '2025-08-28',
    knowledge: '2025-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 81920,
      output: 32768,
    },
    cost: {
      input: 0.2,
      output: 2.4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-32b', {
    name: 'Qwen3 32B',
    created: '2025-04',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.08,
      output: 0.28,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-8b', {
    name: 'Qwen3 8B',
    created: '2025-04-28',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    cost: {
      input: 0.117,
      output: 0.455,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-coder', {
    name: 'Qwen3 Coder 480B A35B',
    created: '2025-07-23',
    knowledge: '2025-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.3,
      output: 1,
      cache_read: 0.1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-coder-30b-a3b-instruct', {
    name: 'Qwen3-Coder 30B-A3B Instruct',
    created: '2025-04',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.07,
      output: 0.28,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-coder-flash', {
    name: 'Qwen3 Coder Flash',
    created: '2025-07-28',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65536,
    },
    cost: {
      input: 0.195,
      output: 0.975,
      cache_read: 0.039,
      cache_write: 0.24375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-coder-next', {
    name: 'Qwen3 Coder Next',
    created: '2026-02-03',
    knowledge: '2025-09',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.12,
      output: 0.8,
      cache_read: 0.07,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-coder-plus', {
    name: 'Qwen3 Coder Plus',
    created: '2025-07-23',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65536,
    },
    cost: {
      input: 0.65,
      output: 3.25,
      cache_read: 0.13,
      cache_write: 0.8125,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-max', {
    name: 'Qwen3 Max',
    created: '2025-09-23',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.78,
      output: 3.9,
      cache_read: 0.156,
      cache_write: 0.975,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-max-thinking', {
    name: 'Qwen3 Max Thinking',
    created: '2026-02-09',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.78,
      output: 3.9,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-next-80b-a3b-instruct', {
    name: 'Qwen3-Next 80B-A3B Instruct',
    created: '2025-09',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.1,
      output: 1.1,
      cache_read: 0.07,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-next-80b-a3b-thinking', {
    name: 'Qwen3-Next 80B-A3B (Thinking)',
    created: '2025-09',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.15,
      output: 1.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-vl-235b-a22b-instruct', {
    name: 'Qwen3 VL 235B A22B Instruct',
    created: '2025-09-23',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.21,
      output: 1.9,
      cache_read: 0.1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-vl-235b-a22b-thinking', {
    name: 'Qwen3 VL 235B A22B Thinking',
    created: '2025-09-23',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.4,
      output: 4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-vl-30b-a3b-instruct', {
    name: 'Qwen3 VL 30B A3B Instruct',
    created: '2025-10-06',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 16384,
    },
    cost: {
      input: 0.15,
      output: 0.6,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-vl-30b-a3b-thinking', {
    name: 'Qwen3 VL 30B A3B Thinking',
    created: '2025-10-06',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.2,
      output: 2.4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-vl-32b-instruct', {
    name: 'Qwen3 VL 32B Instruct',
    created: '2025-10-23',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.104,
      output: 0.416,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-vl-8b-instruct', {
    name: 'Qwen3 VL 8B Instruct',
    created: '2025-10-14',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.117,
      output: 0.455,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3-vl-8b-thinking', {
    name: 'Qwen3 VL 8B Thinking',
    created: '2025-10-14',
    modalities: {
      input: ['image', 'text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.18,
      output: 2.1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.5-122b-a10b', {
    name: 'Qwen3.5 122B-A10B',
    created: '2026-02-23',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.26,
      output: 2.08,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.5-27b', {
    name: 'Qwen3.5 27B',
    created: '2026-02-23',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.195,
      output: 1.56,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.5-35b-a3b', {
    name: 'Qwen3.5 35B-A3B',
    created: '2026-02-23',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.1625,
      output: 1.3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.5-397b-a17b', {
    name: 'Qwen3.5 397B-A17B',
    created: '2026-02-15',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.55,
      output: 3.5,
      cache_read: 0.225,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.5-9b', {
    name: 'Qwen3.5 9B',
    created: '2026-02-23',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0.1,
      output: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.5-flash-02-23', {
    name: 'Qwen3.5-Flash',
    created: '2026-02-25',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65536,
    },
    cost: {
      input: 0.065,
      output: 0.26,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.5-plus-02-15', {
    name: 'Qwen3.5 Plus 2026-02-15',
    created: '2026-02-16',
    knowledge: '2025-04',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65536,
    },
    cost: {
      input: 0.26,
      output: 1.56,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.5-plus-20260420', {
    name: 'Qwen3.5 Plus 2026-04-20',
    created: '2026-04-27',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65536,
    },
    cost: {
      input: 0.3,
      output: 1.8,
      cache_write: 0.375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.6-27b', {
    name: 'Qwen3.6 27B',
    created: '2026-04-22',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 81920,
    },
    cost: {
      input: 0.32,
      output: 3.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.6-35b-a3b', {
    name: 'Qwen3.6 35B-A3B',
    created: '2026-04-17',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.15,
      output: 1,
      cache_read: 0.05,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.6-flash', {
    name: 'Qwen3.6 Flash',
    created: '2026-04-27',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65536,
    },
    cost: {
      input: 0.1875,
      output: 1.125,
      cache_write: 0.234375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.6-max-preview', {
    name: 'Qwen3.6 Max Preview',
    created: '2026-04-20',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 1.027,
      output: 6.162,
      cache_write: 1.28375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.6-plus', {
    name: 'Qwen3.6 Plus',
    created: '2026-04-02',
    knowledge: '2025-04',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65536,
    },
    cost: {
      input: 0.325,
      output: 1.95,
      cache_write: 0.40625,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.7-flash', {
    name: 'Qwen3.7 Flash',
    created: '2026-07-15',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65536,
    },
    cost: {
      input: 0.03,
      output: 0.13,
      cache_read: 0.006,
      cache_write: 0.038,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.7-max', {
    name: 'Qwen3.7 Max',
    created: '2026-05-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 1.475,
      output: 4.425,
      cache_read: 0.295,
      cache_write: 1.84375,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.7-plus', {
    name: 'Qwen3.7 Plus',
    created: '2026-06-02',
    knowledge: '2025-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 0.32,
      output: 1.28,
      cache_read: 0.064,
      cache_write: 0.4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.8-2.4t-a95b', {
    name: 'Qwen3.8 2.4T A95B',
    created: '2026-08-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'xhigh'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.8-27b', {
    name: 'Qwen3.8 27B',
    created: '2026-08-14',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 0.42,
      output: 3,
      cache_read: 0.085,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.8-27b:free', {
    name: 'Qwen3.8 27B (free)',
    created: '2026-08-14',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'xhigh'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.8-flash', {
    name: 'Qwen3.8 Flash',
    created: '2026-08-26',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 0.15,
      output: 0.47,
      cache_read: 0.016,
      cache_write: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.8-max-0902', {
    name: 'Qwen3.8 Max 0902',
    created: '2026-09-02',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.25,
      cache_write: 2.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.8-max-prime', {
    name: 'Qwen 3.8 Max Prime',
    created: '2026-09-23',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 4,
      output: 12,
      cache_read: 0.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/qwen/qwen3.8-omni-flash', {
    name: 'Qwen3.8 Omni Flash',
    created: '2026-09-17',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 0.15,
      output: 0.47,
      cache_read: 0.016,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/rekaai/reka-edge', {
    name: 'Reka Edge',
    created: '2026-03-20',
    modalities: {
      input: ['image', 'text', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 16384,
      output: 14745,
    },
    cost: {
      input: 0.1,
      output: 0.1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/rekaai/reka-flash-3', {
    name: 'Reka Flash 3',
    created: '2025-03-12',
    knowledge: '2025-01-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 65536,
      output: 58982,
    },
    cost: {
      input: 0.1,
      output: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/relace/relace-apply-3', {
    name: 'Relace Apply 3',
    created: '2025-09-26',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 256000,
      output: 128000,
    },
    cost: {
      input: 0.85,
      output: 1.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/relace/relace-search', {
    name: 'Relace Search',
    created: '2025-12-08',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 128000,
    },
    cost: {
      input: 1,
      output: 3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/sakana/fugu-max', {
    name: 'Fugu Max',
    created: '2026-09-11',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/sakana/fugu-ultra', {
    name: 'Fugu Ultra',
    created: '2026-06-15',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/sakana/fugu-ultra-v2', {
    name: 'Fugu Ultra v2',
    created: '2026-09-11',
    knowledge: '2026-08-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/sakana/sakana-namazu', {
    name: 'Sakana Namazu',
    created: '2026-08-03',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.95,
      output: 4,
      cache_read: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/sao10k/l3-lunaris-8b', {
    name: 'Llama 3 8B Lunaris',
    created: '2024-08-13',
    knowledge: '2023-12-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 8192,
      output: 7372,
    },
    cost: {
      input: 0.04,
      output: 0.05,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/sao10k/l3.1-euryale-70b', {
    name: 'Llama 3.1 Euryale 70B v2.2',
    created: '2024-08-28',
    knowledge: '2023-12-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.85,
      output: 0.85,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/sao10k/l3.3-euryale-70b', {
    name: 'Llama 3.3 Euryale 70B',
    created: '2024-12-18',
    knowledge: '2023-12-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 16384,
    },
    cost: {
      input: 0.65,
      output: 0.75,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/stealth/space-bunny-alpha', {
    name: 'Space Bunny Alpha',
    created: '2026-09-23',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 524288,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/stepfun/step-3.5-flash', {
    name: 'Step 3.5 Flash',
    created: '2026-01-29',
    knowledge: '2025-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.1,
      output: 0.3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/stepfun/step-3.7-flash', {
    name: 'Step 3.7 Flash',
    created: '2026-05-29',
    knowledge: '2026-03-01',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 230400,
    },
    cost: {
      input: 0.2,
      output: 1.15,
      cache_read: 0.04,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/tencent/hunyuan-a13b-instruct', {
    name: 'Hunyuan A13B Instruct',
    created: '2025-07-08',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 0.14,
      output: 0.57,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/tencent/hy-mt2-1.8b', {
    name: 'Hy-MT2-1.8B',
    created: '2026-08-20',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 8192,
      output: 4096,
    },
    cost: {
      input: 0.044,
      output: 0.177,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/tencent/hy-mt2-30b-a3b', {
    name: 'Hy-MT2-30B-A3B',
    created: '2026-08-20',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 8192,
      output: 4096,
    },
    cost: {
      input: 0.074,
      output: 0.295,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/tencent/hy-mt2-7b', {
    name: 'Hy-MT2-7B',
    created: '2026-08-19',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 8192,
      output: 4096,
    },
    cost: {
      input: 0.074,
      output: 0.295,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/tencent/hy3', {
    name: 'Hy3',
    created: '2026-07-06',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 128000,
    },
    cost: {
      input: 0.132,
      output: 0.528,
      cache_read: 0.033,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/tencent/hy3-preview', {
    name: 'Hy3 preview',
    created: '2026-04-20',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 235929,
    },
    cost: {
      input: 0.18,
      output: 0.6,
      cache_read: 0.06,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/tencent/hy4-preview', {
    name: 'Hy4 preview',
    created: '2026-08-28',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 64000,
    },
    cost: {
      input: 0.834,
      output: 2.501,
      cache_read: 0.042,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/thedrummer/cydonia-24b-v4.1', {
    name: 'Cydonia 24B V4.1',
    created: '2025-09-27',
    knowledge: '2024-04-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 0.3,
      output: 0.5,
      cache_read: 0.15,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/thedrummer/skyfall-36b-v2', {
    name: 'Skyfall 36B V2',
    created: '2025-03-10',
    knowledge: '2024-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 29491,
    },
    cost: {
      input: 0.55,
      output: 0.8,
      cache_read: 0.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/thedrummer/unslopnemo-12b', {
    name: 'UnslopNemo 12B',
    created: '2024-11-08',
    knowledge: '2024-04-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 1024000,
      output: 819200,
    },
    cost: {
      input: 0.4,
      output: 0.4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/thinkingmachines/inkling', {
    name: 'Inkling',
    created: '2026-07-15',
    modalities: {
      input: ['text', 'image', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 524288,
      output: 471859,
    },
    cost: {
      input: 1,
      output: 4.05,
      cache_read: 0.17,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/thinkingmachines/inkling-small', {
    name: 'Inkling Small',
    created: '2026-07-30',
    modalities: {
      input: ['text', 'image', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 524288,
      output: 262144,
    },
    cost: {
      input: 0.45,
      output: 1.2,
      cache_read: 0.1,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/thinkingmachines/inkling-small:free', {
    name: 'Inkling Small (free)',
    created: '2026-07-30',
    modalities: {
      input: ['text', 'image', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'max'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 262144,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/thinkingmachines/inkling:free', {
    name: 'Inkling (free)',
    created: '2026-07-15',
    modalities: {
      input: ['text', 'image', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'max'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 262144,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/unbiased/pareto', {
    name: 'Pareto',
    created: '2026-09-17',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 2.5,
      output: 7.5,
      cache_read: 0.25,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/undi95/remm-slerp-l2-13b', {
    name: 'ReMM SLERP 13B',
    created: '2023-07-22',
    knowledge: '2023-06-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 6144,
      output: 5529,
    },
    cost: {
      input: 0.35,
      output: 0.65,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/upstage/solar-mini4', {
    name: 'Solar Mini 4',
    created: '2026-09-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 524288,
      output: 131072,
    },
    cost: {
      input: 0.05,
      output: 0.2,
      cache_read: 0.005,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/upstage/solar-pro-3', {
    name: 'Solar Pro 3',
    created: '2026-01-27',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 117964,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.015,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/upstage/solar-pro4', {
    name: 'Solar Pro 4',
    created: '2026-08-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 524288,
      output: 131072,
    },
    cost: {
      input: 0.09,
      output: 0.36,
      cache_read: 0.018,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/writer/palmyra-x5', {
    name: 'Palmyra X5',
    created: '2026-01-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 1040000,
      output: 8192,
    },
    cost: {
      input: 0.6,
      output: 6,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/x-ai/grok-4.20', {
    name: 'Grok 4.20',
    created: '2026-03-31',
    knowledge: '2025-09-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 2000000,
      output: 1800000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/x-ai/grok-4.20-multi-agent', {
    name: 'Grok 4.20 Multi-Agent',
    created: '2026-03-31',
    knowledge: '2025-09-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 2000000,
      output: 1800000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/x-ai/grok-4.3', {
    name: 'Grok 4.3',
    created: '2026-04-17',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 900000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/x-ai/grok-4.5', {
    name: 'Grok 4.5',
    created: '2026-07-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 450000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.3,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/x-ai/grok-4.6', {
    name: 'Grok 4.6',
    created: '2026-08-12',
    knowledge: '2026-02-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 450000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/x-ai/grok-4.7', {
    name: 'Grok 4.7',
    created: '2026-09-21',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 450000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.5,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/x-ai/grok-build-0.1', {
    name: 'Grok Build 0.1',
    created: '2026-04-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 230400,
    },
    cost: {
      input: 1,
      output: 2,
      cache_read: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/xiaomi/mimo-v2.5', {
    name: 'MiMo-V2.5',
    created: '2026-04-22',
    knowledge: '2024-12',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 131072,
    },
    cost: {
      input: 0.14,
      output: 0.28,
      cache_read: 0.0028,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/xiaomi/mimo-v2.5-pro', {
    name: 'MiMo-V2.5-Pro',
    created: '2026-04-22',
    knowledge: '2024-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 131072,
    },
    cost: {
      input: 0.435,
      output: 0.87,
      cache_read: 0.0036,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/xiaomi/mimo-v2.6-flash', {
    name: 'MiMo-V2.6-Flash',
    created: '2026-09-22',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.14,
      output: 0.28,
      cache_read: 0.0028,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/xiaomi/mimo-v2.6-pro', {
    name: 'MiMo-V2.6-Pro',
    created: '2026-09-22',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 131072,
    },
    cost: {
      input: 0.435,
      output: 0.87,
      cache_read: 0.0036,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/xiaomi/mimo-v2.6-pro-ultraspeed', {
    name: 'MiMo-V2.6-Pro-UltraSpeed',
    created: '2026-09-21',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 4.35,
      output: 8.7,
      cache_read: 0.036,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-4.5', {
    name: 'GLM-4.5',
    created: '2025-07-28',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 98304,
    },
    cost: {
      input: 0.6,
      output: 2.2,
      cache_read: 0.11,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-4.5-air', {
    name: 'GLM-4.5-Air',
    created: '2025-07-28',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 98304,
    },
    cost: {
      input: 0.13,
      output: 0.85,
      cache_read: 0.025,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-4.5v', {
    name: 'GLM-4.5V',
    created: '2025-08-11',
    knowledge: '2025-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 65536,
      output: 16384,
    },
    cost: {
      input: 0.6,
      output: 1.8,
      cache_read: 0.11,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-4.6', {
    name: 'GLM-4.6',
    created: '2025-09-30',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 16384,
    },
    cost: {
      input: 0.43,
      output: 1.75,
      cache_read: 0.08,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-4.6v', {
    name: 'GLM-4.6V',
    created: '2025-12-08',
    knowledge: '2025-04',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.3,
      output: 0.9,
      cache_read: 0.055,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-4.7', {
    name: 'GLM-4.7',
    created: '2025-12-22',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 131072,
    },
    cost: {
      input: 0.6,
      output: 2.2,
      cache_read: 0.11,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-4.7-flash', {
    name: 'GLM-4.7-Flash',
    created: '2026-01-19',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 200000,
      output: 117964,
    },
    cost: {
      input: 0.0605,
      output: 0.4,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-5', {
    name: 'GLM-5',
    created: '2026-02-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 128000,
    },
    cost: {
      input: 0.6,
      output: 1.92,
      cache_read: 0.12,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-5-turbo', {
    name: 'GLM-5-Turbo',
    created: '2026-03-16',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 202752,
      output: 131072,
    },
    cost: {
      input: 1.2,
      output: 4,
      cache_read: 0.24,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-5.1', {
    name: 'GLM-5.1',
    created: '2026-04-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 131072,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.26,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-5.2', {
    name: 'GLM-5.2',
    created: '2026-06-13',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['high', 'xhigh'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943718,
    },
    cost: {
      input: 0.25,
      output: 3.99,
      cache_read: 0.2,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-5.3', {
    name: 'GLM-5.3',
    created: '2026-08-14',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943717,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.26,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-5.3-flash', {
    name: 'GLM-5.3-Flash',
    created: '2026-08-26',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 943717,
    },
    cost: {
      input: 0.15,
      output: 0.5,
      cache_read: 0.03,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-5.3-flashx', {
    name: 'GLM 5.3 FlashX',
    created: '2026-09-18',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.37,
      output: 1.25,
      cache_read: 0.09,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-5.3-prime', {
    name: 'GLM 5.3 Prime',
    created: '2026-09-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 2.8,
      output: 8.8,
      cache_read: 0.56,
    },
    providers: ['openrouter'],
  }),
  model('openrouter/z-ai/glm-5v-turbo', {
    name: 'GLM-5V-Turbo',
    created: '2026-04-01',
    modalities: {
      input: ['image', 'text', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 202752,
      output: 131072,
    },
    cost: {
      input: 1.2,
      output: 4,
      cache_read: 0.24,
    },
    providers: ['openrouter'],
  }),
  model('perplexity/sonar', {
    name: 'Sonar',
    created: '2024-01-01',
    knowledge: '2025-09-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 1,
      output: 1,
    },
    providers: ['perplexity'],
  }),
  model('perplexity/sonar-deep-research', {
    name: 'Perplexity Sonar Deep Research',
    created: '2025-02-01',
    knowledge: '2025-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 128000,
      output: 32768,
    },
    cost: {
      input: 2,
      output: 8,
    },
    providers: ['perplexity'],
  }),
  model('perplexity/sonar-pro', {
    name: 'Sonar Pro',
    created: '2024-01-01',
    knowledge: '2025-09-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      vision: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 8192,
    },
    cost: {
      input: 3,
      output: 15,
    },
    providers: ['perplexity'],
  }),
  model('perplexity/sonar-reasoning-pro', {
    name: 'Sonar Reasoning Pro',
    created: '2024-01-01',
    knowledge: '2025-09-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 2,
      output: 8,
    },
    providers: ['perplexity'],
  }),
  model('togetherai/deepcogito/cogito-v2-1-671b', {
    name: 'Cogito v2.1 671B',
    created: '2025-11-13',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 163840,
      output: 163840,
    },
    cost: {
      input: 1.25,
      output: 1.25,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/deepseek-ai/DeepSeek-V4-Flash-0731', {
    name: 'DeepSeek V4 Flash 0731',
    created: '2026-07-31',
    knowledge: '2025-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 384000,
    },
    cost: {
      input: 0.14,
      output: 0.28,
      cache_read: 0.03,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/deepseek-ai/DeepSeek-V4-Pro', {
    name: 'DeepSeek V4 Pro',
    created: '2026-04-24',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 512000,
      output: 384000,
    },
    cost: {
      input: 1.74,
      output: 3.48,
      cache_read: 0.2,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/deepseek-ai/DeepSeek-V4-Pro-0813', {
    name: 'DeepSeek V4 Pro 0813',
    created: '2026-08-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 384000,
    },
    cost: {
      input: 1.32,
      output: 3.96,
      cache_read: 0.13,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/deepseek-ai/DeepSeek-V4.1-Flash', {
    name: 'DeepSeek V4.1 Flash',
    created: '2026-09-10',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 384000,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.006,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/google/gemma-3n-E4B-it', {
    name: 'Gemma 3N E4B Instruct',
    created: '2025-05-20',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 32768,
    },
    cost: {
      input: 0.06,
      output: 0.12,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/google/gemma-4-31B-it', {
    name: 'Gemma 4 31B Instruct',
    created: '2026-04-07',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0.39,
      output: 0.97,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/LiquidAI/LFM2-24B-A2B', {
    name: 'LFM2-24B-A2B',
    created: '2026-02-25',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 32768,
      output: 32768,
    },
    cost: {
      input: 0.03,
      output: 0.12,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/meta-llama/Llama-3.3-70B-Instruct-Turbo', {
    name: 'Llama 3.3 70B',
    created: '2024-12-06',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 1.04,
      output: 1.04,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/meta-llama/Meta-Llama-3-8B-Instruct-Lite', {
    name: 'Meta Llama 3 8B Instruct Lite',
    created: '2024-04-18',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 8192,
      output: 8192,
    },
    cost: {
      input: 0.14,
      output: 0.14,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/MiniMaxAI/MiniMax-M2.7', {
    name: 'MiniMax-M2.7',
    created: '2026-03-18',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 196608,
      output: 131072,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.06,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/MiniMaxAI/MiniMax-M3', {
    name: 'MiniMax-M3',
    created: '2026-06-12',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 524288,
      output: 250000,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.06,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/moonshotai/Kimi-K3', {
    name: 'Kimi K3',
    created: '2026-07-16',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/nvidia/nemotron-3-ultra-550b-a55b', {
    name: 'Nemotron 3 Ultra 550B A55B',
    created: '2026-06-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 512300,
      output: 512300,
    },
    cost: {
      input: 0.6,
      output: 3.6,
      cache_read: 0.2,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/openai/gpt-oss-120b', {
    name: 'GPT OSS 120B',
    created: '2025-08-05',
    knowledge: '2025-08',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.15,
      output: 0.6,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/openai/gpt-oss-20b', {
    name: 'GPT OSS 20B',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.05,
      output: 0.2,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/pearl-ai/gemma-4-31b-it', {
    name: 'Pearl AI Gemma 4 31B Instruct',
    created: '2026-04-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 32000,
      output: 32000,
    },
    cost: {
      input: 0.28,
      output: 0.86,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/Qwen/Qwen2.5-7B-Instruct-Turbo', {
    name: 'Qwen 2.5 7B Instruct Turbo',
    created: '2024-09-19',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 32768,
      output: 32768,
    },
    cost: {
      input: 0.3,
      output: 0.3,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/Qwen/Qwen3.5-9B', {
    name: 'Qwen3.5 9B',
    created: '2026-03-03',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 0.17,
      output: 0.25,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/Qwen/Qwen3.6-Plus', {
    name: 'Qwen3.6 Plus',
    created: '2026-04-30',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 500000,
    },
    cost: {
      input: 0.5,
      output: 3,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/Qwen/Qwen3.7-Max', {
    name: 'Qwen3.7 Max',
    created: '2026-05-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 500000,
    },
    cost: {
      input: 1.25,
      output: 3.75,
      cache_read: 0.125,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/thinkingmachines/Inkling', {
    name: 'Inkling',
    created: '2026-07-15',
    modalities: {
      input: ['text', 'image', 'audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['max', 'xhigh', 'high', 'medium', 'low', 'none'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 524288,
      output: 131072,
    },
    cost: {
      input: 1,
      output: 4.05,
      cache_read: 0.17,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/zai-org/GLM-5.2', {
    name: 'GLM-5.2',
    created: '2026-06-16',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048575,
      output: 164000,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.26,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/zai-org/GLM-5.3', {
    name: 'GLM-5.3',
    created: '2026-08-14',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 262144,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.26,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/zai-org/GLM-5.3-Flash', {
    name: 'GLM-5.3-Flash',
    created: '2026-08-26',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048575,
      output: 400000,
    },
    cost: {
      input: 0.15,
      output: 0.5,
      cache_read: 0.03,
    },
    providers: ['togetherai'],
  }),
  model('typesafe-ai/jev', {
    name: 'Jev',
    modalities: {
      input: ['text'],
      output: [],
    },
    operations: ['evaluate'],
    capabilities: {},
    context: {
      input: 64000,
      output: 0,
    },
    cost: {
      input: 0.042,
      output: 0,
    },
    providers: ['typesafe-ai'],
  }),
  model('typesafe-ai/jev-latest', {
    name: 'Jev Latest',
    modalities: {
      input: ['text'],
      output: [],
    },
    operations: ['evaluate'],
    capabilities: {},
    context: {
      input: 64000,
      output: 0,
    },
    cost: {
      input: 0.042,
      output: 0,
    },
    providers: ['typesafe-ai'],
  }),
  model('vercel/alibaba/qwen-3-14b', {
    name: 'Qwen3-14B',
    created: '2025-04-28',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 40960,
      output: 16384,
    },
    cost: {
      input: 0.12,
      output: 0.24,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen-3-235b', {
    name: 'Qwen3 235B A22B Instruct 2507',
    created: '2025-04-28',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 262144,
      output: 16384,
    },
    cost: {
      input: 0.22,
      output: 0.88,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen-3-30b', {
    name: 'Qwen3-30B-A3B',
    created: '2025-04-28',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 40960,
      output: 16384,
    },
    cost: {
      input: 0.12,
      output: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen-3-32b', {
    name: 'Qwen 3.32B',
    created: '2025-04-28',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1,
          max: 38912,
        },
      ],
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8192,
    },
    cost: {
      input: 0.16,
      output: 0.64,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen-3.6-max-preview', {
    name: 'Qwen 3.6 Max Preview',
    created: '2026-04-20',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1,
          max: 131072,
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 240000,
      output: 64000,
    },
    cost: {
      input: 1.3,
      output: 7.8,
      cache_read: 0.13,
      cache_write: 1.625,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-235b-a22b-thinking', {
    name: 'Qwen3 235B A22B Thinking 2507',
    created: '2025-09-23',
    knowledge: '2025-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 1,
          max: 81920,
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.4,
      output: 4,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-coder', {
    name: 'Qwen3 Coder 480B A35B Instruct',
    created: '2025-07-22',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 65536,
    },
    cost: {
      input: 1.5,
      output: 7.5,
      cache_read: 0.3,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-coder-30b-a3b', {
    name: 'Qwen 3 Coder 30B A3B Instruct',
    created: '2025-07-31',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 8192,
    },
    cost: {
      input: 0.15,
      output: 0.6,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-coder-next', {
    name: 'Qwen3 Coder Next',
    created: '2026-02-03',
    knowledge: '2025-09',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 256000,
    },
    cost: {
      input: 0.5,
      output: 1.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-coder-plus', {
    name: 'Qwen3 Coder Plus',
    created: '2025-07-23',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65536,
    },
    cost: {
      input: 1,
      output: 5,
      cache_read: 0.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-max', {
    name: 'Qwen3 Max',
    created: '2025-09-23',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 1.2,
      output: 6,
      cache_read: 0.24,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-max-preview', {
    name: 'Qwen3 Max Preview',
    created: '2025-09-05',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 1.2,
      output: 6,
      cache_read: 0.24,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-max-thinking', {
    name: 'Qwen 3 Max Thinking',
    created: '2026-01-23',
    knowledge: '2025-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 1,
          max: 81920,
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 65536,
    },
    cost: {
      input: 1.2,
      output: 6,
      cache_read: 0.24,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-next-80b-a3b-instruct', {
    name: 'Qwen3 Next 80B A3B Instruct',
    created: '2025-09',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 262114,
      output: 262114,
    },
    cost: {
      input: 0.15,
      output: 1.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-next-80b-a3b-thinking', {
    name: 'Qwen3 Next 80B A3B Thinking',
    created: '2025-09',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 1,
        },
      ],
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 0.15,
      output: 1.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-vl-235b-a22b-instruct', {
    name: 'Qwen3 VL 235B A22B Instruct',
    created: '2025-09-23',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 129024,
    },
    cost: {
      input: 0.4,
      output: 1.6,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-vl-instruct', {
    name: 'Qwen3 VL Instruct',
    created: '2025-09-23',
    knowledge: '2025-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 129024,
    },
    cost: {
      input: 0.4,
      output: 1.6,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3-vl-thinking', {
    name: 'Qwen3 VL Thinking',
    created: '2025-09-23',
    knowledge: '2025-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 1,
          max: 81920,
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.4,
      output: 4,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.5-flash', {
    name: 'Qwen 3.5 Flash',
    created: '2026-02-23',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1,
          max: 81920,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 0.1,
      output: 0.4,
      cache_read: 0.01,
      cache_write: 0.125,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.5-plus', {
    name: 'Qwen 3.5 Plus',
    created: '2026-02-16',
    knowledge: '2025-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1,
          max: 81920,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 0.4,
      output: 2.4,
      cache_read: 0.04,
      cache_write: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.6-27b', {
    name: 'Qwen 3.6 27B',
    created: '2026-04-22',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1,
          max: 131072,
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 65536,
    },
    cost: {
      input: 0.6,
      output: 3.6,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.6-plus', {
    name: 'Qwen 3.6 Plus',
    created: '2026-04-02',
    knowledge: '2025-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1,
          max: 131072,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 0.5,
      output: 3,
      cache_read: 0.05,
      cache_write: 0.625,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.7-flash', {
    name: 'Qwen 3.7 Flash',
    created: '2026-07-15',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 991000,
      output: 64000,
    },
    cost: {
      input: 0.03,
      output: 0.13,
      cache_read: 0.006,
      cache_write: 0.038,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.7-max', {
    name: 'Qwen 3.7 Max',
    created: '2026-05-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1,
          max: 262144,
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 991000,
      output: 64000,
    },
    cost: {
      input: 2.5,
      output: 7.5,
      cache_read: 0.5,
      cache_write: 3.125,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.7-plus', {
    name: 'Qwen 3.7 Plus',
    created: '2026-06-02',
    knowledge: '2025-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
          min: 1,
          max: 262144,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 0.4,
      output: 1.6,
      cache_read: 0.08,
      cache_write: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.8-2.4t-a95b', {
    name: 'Qwen3.8 2.4T A95B',
    created: '2026-08-12',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.8-27b', {
    name: 'Qwen3.8 27B',
    created: '2026-08-14',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 0.5,
      output: 3,
      cache_read: 0.1,
      cache_write: 0.625,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.8-flash', {
    name: 'Qwen 3.8 Flash',
    created: '2026-08-26',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'xhigh'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 991000,
      output: 128000,
    },
    cost: {
      input: 0.15,
      output: 0.47,
      cache_read: 0.016,
      cache_write: 0.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.8-max', {
    name: 'Qwen 3.8 Max',
    created: '2026-07-19',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'xhigh'],
        },
        {
          type: 'budget_tokens',
          min: 0,
          max: 262144,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.8-max-0902', {
    name: 'Qwen3.8 Max 0902',
    created: '2026-09-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'xhigh'],
        },
        {
          type: 'budget_tokens',
          min: 0,
          max: 262144,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 991000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.25,
      cache_write: 2.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.8-max-prime', {
    name: 'Qwen 3.8 Max Prime',
    created: '2026-09-23',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'xhigh'],
        },
        {
          type: 'budget_tokens',
          min: 0,
          max: 262144,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 4,
      output: 12,
      cache_read: 0.5,
      cache_write: 5,
    },
    providers: ['vercel'],
  }),
  model('vercel/alibaba/qwen3.8-omni-flash', {
    name: 'Qwen 3.8 Omni Flash',
    created: '2026-09-17',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 0.15,
      output: 0.47,
      cache_read: 0.016,
    },
    providers: ['vercel'],
  }),
  model('vercel/amazon/nova-2-lite', {
    name: 'Nova 2 Lite',
    created: '2025-12-02',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65535,
    },
    cost: {
      input: 0.3,
      output: 2.5,
      cache_read: 0.075,
    },
    providers: ['vercel'],
  }),
  model('vercel/amazon/nova-lite', {
    name: 'Nova Lite',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 10000,
    },
    cost: {
      input: 0.06,
      output: 0.24,
      cache_read: 0.015,
      cache_write: 0.06,
    },
    providers: ['vercel'],
  }),
  model('vercel/amazon/nova-micro', {
    name: 'Nova Micro',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 10000,
    },
    cost: {
      input: 0.035,
      output: 0.14,
      cache_read: 0.00875,
      cache_write: 0.035,
    },
    providers: ['vercel'],
  }),
  model('vercel/amazon/nova-pro', {
    name: 'Nova Pro',
    created: '2024-12-03',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 300000,
      output: 10000,
    },
    cost: {
      input: 0.8,
      output: 3.2,
      cache_read: 0.2,
      cache_write: 0.8,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-3-haiku', {
    name: 'Claude Haiku 3',
    created: '2024-03-13',
    knowledge: '2023-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 4096,
    },
    cost: {
      input: 0.25,
      output: 1.25,
      cache_read: 0.03,
      cache_write: 0.3,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-fable-5', {
    name: 'Claude Fable 5',
    created: '2026-06-09',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-fable-5.1', {
    name: 'Claude Fable 5.1',
    created: '2026-09-01',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 0.25,
      cache_write: 12.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-haiku-4.5', {
    name: 'Claude Haiku 4.5',
    created: '2025-10-15',
    knowledge: '2025-02-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 1,
      output: 5,
      cache_read: 0.1,
      cache_write: 1.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-opus-4', {
    name: 'Claude Opus 4',
    created: '2025-05-22',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 32000,
    },
    cost: {
      input: 15,
      output: 75,
      cache_read: 1.5,
      cache_write: 18.75,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-opus-4.5', {
    name: 'Claude Opus 4.5',
    created: '2025-11-24',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 64000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-opus-4.6', {
    name: 'Claude Opus 4.6',
    created: '2026-02-05',
    knowledge: '2025-05-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-opus-4.7', {
    name: 'Claude Opus 4.7',
    created: '2026-04-16',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-opus-4.8', {
    name: 'Claude Opus 4.8',
    created: '2026-05-28',
    knowledge: '2026-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-opus-4.8-fast', {
    name: 'Claude Opus 4.8 (Fast)',
    created: '2026-05-28',
    knowledge: '2026-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-opus-5', {
    name: 'Claude Opus 5',
    created: '2026-07-24',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 25,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-opus-5-fast', {
    name: 'Claude Opus 5 (Fast)',
    created: '2026-07-24',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-opus-5.5', {
    name: 'Claude Opus 5.5',
    created: '2026-09-22',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.2,
      cache_write: 5,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-opus-5.5-fast', {
    name: 'Claude Opus 5.5 (Fast)',
    created: '2026-09-22',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 8,
      output: 40,
      cache_read: 0.4,
      cache_write: 10,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-sonnet-4', {
    name: 'Claude Sonnet 4',
    created: '2025-05-22',
    knowledge: '2025-03-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-sonnet-4.5', {
    name: 'Claude Sonnet 4.5',
    created: '2025-09-29',
    knowledge: '2025-07-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-sonnet-4.6', {
    name: 'Claude Sonnet 4.6',
    created: '2026-02-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-sonnet-5', {
    name: 'Claude Sonnet 5',
    created: '2026-06-30',
    knowledge: '2026-01-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/anthropic/claude-sonnet-5.5', {
    name: 'Claude Sonnet 5.5',
    created: '2026-09-28',
    knowledge: '2026-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/arcee-ai/trinity-large-thinking', {
    name: 'Trinity Large Thinking',
    created: '2026-04-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 262100,
      output: 80000,
    },
    cost: {
      input: 0.25,
      output: 0.9,
    },
    providers: ['vercel'],
  }),
  model('vercel/bytedance/seed-1.6', {
    name: 'Seed 1.6',
    created: '2025-09-01',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32000,
    },
    cost: {
      input: 0.25,
      output: 2,
      cache_read: 0.05,
    },
    providers: ['vercel'],
  }),
  model('vercel/bytedance/seed-1.8', {
    name: 'Seed 1.8',
    created: '2025-09-01',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32768,
    },
    cost: {
      input: 0.25,
      output: 2,
      cache_read: 0.05,
    },
    providers: ['vercel'],
  }),
  model('vercel/bytedance/seed-2.1-turbo', {
    name: 'Seed 2.1 Turbo',
    created: '2026-06-23',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 0.5,
      output: 2.5,
      cache_read: 0.1,
    },
    providers: ['vercel'],
  }),
  model('vercel/cohere/command-a', {
    name: 'Command A',
    created: '2025-03-13',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 8000,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['vercel'],
  }),
  model('vercel/deepseek/deepseek-r1', {
    name: 'DeepSeek-R1',
    created: '2025-01-20',
    knowledge: '2024-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 32768,
    },
    cost: {
      input: 1.35,
      output: 5.4,
    },
    providers: ['vercel'],
  }),
  model('vercel/deepseek/deepseek-v3.1', {
    name: 'DeepSeek-V3.1',
    created: '2025-08-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 163840,
      output: 128000,
    },
    cost: {
      input: 0.25,
      output: 0.95,
      cache_read: 0.13,
    },
    providers: ['vercel'],
  }),
  model('vercel/deepseek/deepseek-v3.1-terminus', {
    name: 'DeepSeek V3.1 Terminus',
    created: '2025-09-22',
    knowledge: '2025-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 32768,
    },
    cost: {
      input: 0.27,
      output: 1,
      cache_read: 0.135,
    },
    providers: ['vercel'],
  }),
  model('vercel/deepseek/deepseek-v3.2', {
    name: 'DeepSeek V3.2',
    created: '2025-12-01',
    knowledge: '2024-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8000,
    },
    cost: {
      input: 0.62,
      output: 1.85,
    },
    providers: ['vercel'],
  }),
  model('vercel/deepseek/deepseek-v3.2-thinking', {
    name: 'DeepSeek V3.2 Thinking',
    created: '2025-12-01',
    knowledge: '2024-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8000,
    },
    cost: {
      input: 0.62,
      output: 1.85,
    },
    providers: ['vercel'],
  }),
  model('vercel/deepseek/deepseek-v4-flash', {
    name: 'DeepSeek V4 Flash',
    created: '2026-04-24',
    knowledge: '2025-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 384000,
    },
    cost: {
      input: 0.13,
      output: 0.26,
      cache_read: 0.028,
    },
    providers: ['vercel'],
  }),
  model('vercel/deepseek/deepseek-v4-flash-0731', {
    name: 'DeepSeek V4 Flash 0731',
    created: '2026-07-31',
    knowledge: '2025-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 384000,
    },
    cost: {
      input: 0.076,
      output: 0.153,
      cache_read: 0.014,
    },
    providers: ['vercel'],
  }),
  model('vercel/deepseek/deepseek-v4-flash-vision-exp', {
    name: 'DeepSeek V4 Flash Vision Exp',
    created: '2026-08-21',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 1048576,
    },
    cost: {
      input: 0.2156,
      output: 0.6468,
      cache_read: 0.0068,
    },
    providers: ['vercel'],
  }),
  model('vercel/deepseek/deepseek-v4-pro', {
    name: 'DeepSeek V4 Pro',
    created: '2026-04-24',
    knowledge: '2025-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 384000,
    },
    cost: {
      input: 0.66,
      output: 1.98,
      cache_read: 0.022,
    },
    providers: ['vercel'],
  }),
  model('vercel/deepseek/deepseek-v4-pro-0813', {
    name: 'DeepSeek V4 Pro 0813',
    created: '2026-08-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 384000,
    },
    cost: {
      input: 0.66,
      output: 1.98,
      cache_read: 0.066,
    },
    providers: ['vercel'],
  }),
  model('vercel/deepseek/deepseek-v4.1-flash', {
    name: 'DeepSeek V4.1 Flash',
    created: '2026-09-10',
    knowledge: '2025-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 32768,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.007,
    },
    providers: ['vercel'],
  }),
  model('vercel/fireworks/ember-1', {
    name: 'Ember-1',
    created: '2026-09-23',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
        {
          type: 'budget_tokens',
          min: 1024,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 1048576,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-2.5-flash', {
    name: 'Gemini 2.5 Flash',
    created: '2025-06-17',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 0,
          max: 24576,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 0.3,
      output: 2.5,
      cache_read: 0.03,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-2.5-flash-lite', {
    name: 'Gemini 2.5 Flash Lite',
    created: '2025-06-17',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65535,
    },
    cost: {
      input: 0.1,
      output: 0.4,
      cache_read: 0.01,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-2.5-pro', {
    name: 'Gemini 2.5 Pro',
    created: '2025-06-17',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image', 'audio', 'video'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
          min: 128,
          max: 32768,
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 65536,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-3-flash', {
    name: 'Gemini 3 Flash',
    created: '2025-12-17',
    knowledge: '2025-03',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65000,
    },
    cost: {
      input: 0.5,
      output: 3,
      cache_read: 0.05,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-3.1-flash-lite', {
    name: 'Gemini 3.1 Flash Lite',
    created: '2026-05-07',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65000,
    },
    cost: {
      input: 0.25,
      output: 1.5,
      cache_read: 0.03,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-3.1-pro-preview', {
    name: 'Gemini 3.1 Pro Preview',
    created: '2026-02-19',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-3.5-flash', {
    name: 'Gemini 3.5 Flash',
    created: '2026-05-19',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 1.5,
      output: 9,
      cache_read: 0.15,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-3.5-flash-lite', {
    name: 'Gemini 3.5 Flash Lite',
    created: '2026-07-21',
    knowledge: '2026-03',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65000,
    },
    cost: {
      input: 0.3,
      output: 2.5,
      cache_read: 0.03,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-3.5-transcribe', {
    name: 'Gemini 3.5 Transcribe',
    created: '2026-08-26',
    modalities: {
      input: ['audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 0,
      output: 0,
    },
    cost: {
      input: 2,
      output: 12,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-3.6-flash', {
    name: 'Gemini 3.6 Flash',
    created: '2026-07-21',
    knowledge: '2026-03',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 64000,
    },
    cost: {
      input: 0.75,
      output: 3.75,
      cache_read: 0.075,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-3.7-flash', {
    name: 'Gemini 3.7 Flash',
    created: '2026-08-13',
    knowledge: '2026-03',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65535,
    },
    cost: {
      input: 0.75,
      output: 3.75,
      cache_read: 0.075,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-3.8-flash', {
    name: 'Gemini 3.8 Flash',
    created: '2026-09-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65535,
    },
    cost: {
      input: 0.75,
      output: 3.75,
      cache_read: 0.075,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemini-omni-flash-preview', {
    name: 'Gemini Omni Flash Preview',
    created: '2026-06-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 57920,
    },
    cost: {
      input: 1.5,
      output: 9,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemma-4-26b-a4b-it', {
    name: 'Gemma 4 26B A4B IT',
    created: '2026-04-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.015,
    },
    providers: ['vercel'],
  }),
  model('vercel/google/gemma-4-31b-it', {
    name: 'Gemma 4 31B IT',
    created: '2026-04-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0.14,
      output: 0.4,
    },
    providers: ['vercel'],
  }),
  model('vercel/inception/mercury-2', {
    name: 'Mercury 2',
    created: '2026-02-24',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 50000,
    },
    cost: {
      input: 0.25,
      output: 0.75,
      cache_read: 0.024999999999999998,
    },
    providers: ['vercel'],
  }),
  model('vercel/inception/mercury-2.5', {
    name: 'Mercury 2.5',
    created: '2026-09-08',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 260000,
      output: 65536,
    },
    cost: {
      input: 0.04,
      output: 0.15,
      cache_read: 0.004,
    },
    providers: ['vercel'],
  }),
  model('vercel/inception/mercury-coder-small', {
    name: 'Mercury Coder Small Beta',
    created: '2025-02-26',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 32000,
      output: 16384,
    },
    cost: {
      input: 0.25,
      output: 1,
    },
    providers: ['vercel'],
  }),
  model('vercel/inclusionai/ling-3.0-flash', {
    name: 'Ling 3.0 Flash',
    created: '2026-08-06',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32000,
    },
    cost: {
      input: 0.021,
      output: 0.063,
      cache_read: 0.0042,
    },
    providers: ['vercel'],
  }),
  model('vercel/inclusionai/ling-3.0-flash-fin', {
    name: 'Ling 3.0 Flash Fin',
    created: '2026-08-27',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32000,
    },
    cost: {
      input: 0.075,
      output: 0.22,
      cache_read: 0.015,
    },
    providers: ['vercel'],
  }),
  model('vercel/inclusionai/ling-3.0-flash-sante', {
    name: 'Ling 3.0 Flash Sante',
    created: '2026-09-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32000,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['vercel'],
  }),
  model('vercel/inclusionai/ling-3.0-flash-sante-free', {
    name: 'Ling 3.0 Flash Sante (Free)',
    created: '2026-09-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32000,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['vercel'],
  }),
  model('vercel/inclusionai/ling-3.0-flash-vl', {
    name: 'Ling 3.0 Flash VL',
    created: '2026-09-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32000,
    },
    cost: {
      input: 0.075,
      output: 0.22,
      cache_read: 0.015,
    },
    providers: ['vercel'],
  }),
  model('vercel/inclusionai/ling-3.1-flash', {
    name: 'Ling 3.1 Flash',
    created: '2026-09-29',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['vercel'],
  }),
  model('vercel/inclusionai/ling-3.1-flash-free', {
    name: 'Ling 3.1 Flash (Free)',
    created: '2026-09-29',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['vercel'],
  }),
  model('vercel/inference-net/schematron-v2-small', {
    name: 'Schematron V2 Small',
    created: '2026-04-16',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0.05,
      output: 0.23,
      cache_read: 0.05,
    },
    providers: ['vercel'],
  }),
  model('vercel/inference-net/schematron-v2-turbo', {
    name: 'Schematron V2 Turbo',
    created: '2026-04-16',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8192,
    },
    cost: {
      input: 0.03,
      output: 0.15,
      cache_read: 0.03,
    },
    providers: ['vercel'],
  }),
  model('vercel/interfaze/interfaze-beta', {
    name: 'Interfaze Beta',
    created: '2025-10-07',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 32000,
    },
    cost: {
      input: 1.5,
      output: 3.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/liquid/d1', {
    name: 'Liquid d1',
    created: '2026-09-29',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 32000,
      output: 0,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['vercel'],
  }),
  model('vercel/meituan/longcat-2.5-preview', {
    name: 'LongCat 2.5 Preview',
    created: '2026-09-26',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.006,
    },
    providers: ['vercel'],
  }),
  model('vercel/meta/llama-3.1-70b', {
    name: 'Llama 3.1 70B Instruct',
    created: '2024-07-23',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8192,
    },
    cost: {
      input: 0.72,
      output: 0.72,
    },
    providers: ['vercel'],
  }),
  model('vercel/meta/llama-3.1-8b', {
    name: 'Llama 3.1 8B Instruct',
    created: '2024-07-23',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 8192,
    },
    cost: {
      input: 0.22,
      output: 0.22,
    },
    providers: ['vercel'],
  }),
  model('vercel/meta/llama-3.3-70b', {
    name: 'Llama-3.3-70B-Instruct',
    created: '2024-12-06',
    knowledge: '2023-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['vercel'],
  }),
  model('vercel/meta/llama-4-maverick', {
    name: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
    created: '2025-04-05',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['vercel'],
  }),
  model('vercel/meta/llama-4-scout', {
    name: 'Llama-4-Scout-17B-16E-Instruct-FP8',
    created: '2025-04-05',
    knowledge: '2024-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 4096,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['vercel'],
  }),
  model('vercel/meta/muse-glimmer-30b', {
    name: 'Muse Glimmer 30B',
    created: '2026-08-10',
    knowledge: '2026-01-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.35,
      output: 1.5,
      cache_read: 0.04,
    },
    providers: ['vercel'],
  }),
  model('vercel/meta/muse-spark-1.1', {
    name: 'Muse Spark 1.1',
    created: '2026-04-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 1048576,
    },
    cost: {
      input: 1.25,
      output: 4.25,
      cache_read: 0.15,
    },
    providers: ['vercel'],
  }),
  model('vercel/meta/muse-spark-1.2', {
    name: 'Muse Spark 1.2',
    created: '2026-08-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 1048576,
    },
    cost: {
      input: 1.25,
      output: 4.25,
      cache_read: 0.15,
    },
    providers: ['vercel'],
  }),
  model('vercel/meta/muse-spark-1.2-contributor', {
    name: 'Muse Spark 1.2 Contributor',
    created: '2026-08-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 1048576,
    },
    cost: {
      input: 0.1,
      output: 0.2,
      cache_read: 0.002,
    },
    providers: ['vercel'],
  }),
  model('vercel/meta/muse-spark-1.3', {
    name: 'Muse Spark 1.3',
    created: '2026-09-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 1048576,
    },
    cost: {
      input: 1.25,
      output: 4.25,
      cache_read: 0.15,
    },
    providers: ['vercel'],
  }),
  model('vercel/meta/muse-spark-1.3-contributor', {
    name: 'Muse Spark 1.3 Contributor',
    created: '2026-09-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 1048576,
    },
    cost: {
      input: 0.1,
      output: 0.2,
      cache_read: 0.002,
    },
    providers: ['vercel'],
  }),
  model('vercel/minimax/minimax-m2', {
    name: 'MiniMax M2',
    created: '2025-10-27',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 205000,
      output: 196608,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.03,
      cache_write: 0.375,
    },
    providers: ['vercel'],
  }),
  model('vercel/minimax/minimax-m2.1', {
    name: 'MiniMax M2.1',
    created: '2025-12-23',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 131072,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.03,
      cache_write: 0.375,
    },
    providers: ['vercel'],
  }),
  model('vercel/minimax/minimax-m2.1-lightning', {
    name: 'MiniMax M2.1 Lightning',
    created: '2025-12-23',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 131072,
    },
    cost: {
      input: 0.3,
      output: 2.4,
      cache_read: 0.03,
      cache_write: 0.375,
    },
    providers: ['vercel'],
  }),
  model('vercel/minimax/minimax-m2.5', {
    name: 'MiniMax M2.5',
    created: '2026-02-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 131000,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.03,
      cache_write: 0.375,
    },
    providers: ['vercel'],
  }),
  model('vercel/minimax/minimax-m2.5-highspeed', {
    name: 'MiniMax M2.5 High Speed',
    created: '2026-02-13',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 131000,
    },
    cost: {
      input: 0.6,
      output: 2.4,
      cache_read: 0.03,
      cache_write: 0.375,
    },
    providers: ['vercel'],
  }),
  model('vercel/minimax/minimax-m2.7', {
    name: 'Minimax M2.7',
    created: '2026-03-18',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 131000,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.06,
      cache_write: 0.375,
    },
    providers: ['vercel'],
  }),
  model('vercel/minimax/minimax-m2.7-highspeed', {
    name: 'MiniMax M2.7 High Speed',
    created: '2026-03-18',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 204800,
      output: 131100,
    },
    cost: {
      input: 0.6,
      output: 2.4,
      cache_read: 0.06,
      cache_write: 0.375,
    },
    providers: ['vercel'],
  }),
  model('vercel/minimax/minimax-m3', {
    name: 'MiniMax M3',
    created: '2026-06-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'budget_tokens',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 512000,
      output: 512000,
    },
    cost: {
      input: 0.3,
      output: 1.2,
      cache_read: 0.06,
    },
    providers: ['vercel'],
  }),
  model('vercel/mistral/codestral', {
    name: 'Codestral (latest)',
    created: '2024-05-29',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 4096,
    },
    cost: {
      input: 0.3,
      output: 0.9,
      cache_read: 0.03,
    },
    providers: ['vercel'],
  }),
  model('vercel/mistral/ministral-14b', {
    name: 'Ministral 14B',
    created: '2025-12-02',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 256000,
    },
    cost: {
      input: 0.2,
      output: 0.2,
      cache_read: 0.02,
    },
    providers: ['vercel'],
  }),
  model('vercel/mistral/ministral-3b', {
    name: 'Ministral 3B (latest)',
    created: '2024-10-01',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 128000,
    },
    cost: {
      input: 0.04,
      output: 0.04,
    },
    providers: ['vercel'],
  }),
  model('vercel/mistral/ministral-8b', {
    name: 'Ministral 8B (latest)',
    created: '2024-10-01',
    knowledge: '2024-10',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 128000,
    },
    cost: {
      input: 0.1,
      output: 0.1,
    },
    providers: ['vercel'],
  }),
  model('vercel/mistral/mistral-large-3', {
    name: 'Mistral Large 3',
    created: '2025-12-02',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 256000,
    },
    cost: {
      input: 0.5,
      output: 1.5,
      cache_read: 0.05,
    },
    providers: ['vercel'],
  }),
  model('vercel/mistral/mistral-medium-3.5', {
    name: 'Mistral Medium Latest',
    created: '2026-04-29',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 256000,
    },
    cost: {
      input: 1.5,
      output: 7.5,
      cache_read: 0.15,
    },
    providers: ['vercel'],
  }),
  model('vercel/mistral/mistral-nemo', {
    name: 'Mistral Nemo',
    created: '2024-07-18',
    knowledge: '2024-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 60288,
      output: 16000,
    },
    cost: {
      input: 0.04,
      output: 0.17,
    },
    providers: ['vercel'],
  }),
  model('vercel/mistral/mistral-small', {
    name: 'Mistral Small (latest)',
    created: '2024-09-17',
    knowledge: '2025-06',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 4000,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.015,
    },
    providers: ['vercel'],
  }),
  model('vercel/mixedbread/toast-1', {
    name: 'Toast 1',
    created: '2026-08-13',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131000,
      output: 4000,
    },
    cost: {
      input: 0.3,
      output: 0.72,
      cache_read: 0.036,
    },
    providers: ['vercel'],
  }),
  model('vercel/moonshotai/kimi-k2', {
    name: 'Kimi K2 Instruct',
    created: '2025-07-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.57,
      output: 2.3,
    },
    providers: ['vercel'],
  }),
  model('vercel/moonshotai/kimi-k2-thinking', {
    name: 'Kimi K2 Thinking',
    created: '2025-11-06',
    knowledge: '2024-08',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 216144,
      output: 216144,
    },
    cost: {
      input: 0.47,
      output: 2,
      cache_read: 0.141,
    },
    providers: ['vercel'],
  }),
  model('vercel/moonshotai/kimi-k2.5', {
    name: 'Kimi K2.5',
    created: '2026-01',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 256000,
    },
    cost: {
      input: 0.6,
      output: 3,
    },
    providers: ['vercel'],
  }),
  model('vercel/moonshotai/kimi-k2.6', {
    name: 'Kimi K2.6',
    created: '2026-04-21',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262000,
      output: 262000,
    },
    cost: {
      input: 0.95,
      output: 4,
      cache_read: 0.16,
    },
    providers: ['vercel'],
  }),
  model('vercel/moonshotai/kimi-k2.7-code', {
    name: 'Kimi K2.7 Code',
    created: '2026-06-12',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32768,
    },
    cost: {
      input: 0.95,
      output: 4,
      cache_read: 0.19,
    },
    providers: ['vercel'],
  }),
  model('vercel/moonshotai/kimi-k2.7-code-highspeed', {
    name: 'Kimi K2.7 Code High Speed',
    created: '2026-06-12',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 32768,
    },
    cost: {
      input: 1.9,
      output: 8,
      cache_read: 0.38,
    },
    providers: ['vercel'],
  }),
  model('vercel/moonshotai/kimi-k3', {
    name: 'Kimi K3',
    created: '2026-07-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
    },
    providers: ['vercel'],
  }),
  model('vercel/moonshotai/kimi-k3-fast', {
    name: 'Kimi K3 Fast',
    created: '2026-07-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 4.5,
      output: 22.5,
      cache_read: 0.45,
    },
    providers: ['vercel'],
  }),
  model('vercel/morph/morph-v3-fast', {
    name: 'Morph v3 Fast',
    created: '2024-08-15',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 16000,
      output: 16000,
    },
    cost: {
      input: 0.8,
      output: 1.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/morph/morph-v3-large', {
    name: 'Morph v3 Large',
    created: '2024-08-15',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 32000,
      output: 32000,
    },
    cost: {
      input: 0.9,
      output: 1.9,
    },
    providers: ['vercel'],
  }),
  model('vercel/nvidia/nemotron-3-nano-30b-a3b', {
    name: 'Nemotron 3 Nano 30B A3B',
    created: '2025-12-15',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 0.05,
      output: 0.2,
      cache_read: 0.025,
    },
    providers: ['vercel'],
  }),
  model('vercel/nvidia/nemotron-3-super-120b-a12b', {
    name: 'NVIDIA Nemotron 3 Super 120B A12B',
    created: '2026-03-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32000,
    },
    cost: {
      input: 0.15,
      output: 0.65,
    },
    providers: ['vercel'],
  }),
  model('vercel/nvidia/nemotron-3-ultra-550b-a55b', {
    name: 'Nemotron 3 Ultra',
    created: '2026-06-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 65000,
    },
    cost: {
      input: 0.6,
      output: 2.4,
      cache_read: 0.12,
    },
    providers: ['vercel'],
  }),
  model('vercel/nvidia/nemotron-3.5-lightning', {
    name: 'Nemotron 3.5 Lightning 30B',
    created: '2026-08-11',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
        {
          type: 'budget_tokens',
          min: 1,
          max: 32768,
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0.05,
      output: 0.2,
      cache_read: 0.01,
    },
    providers: ['vercel'],
  }),
  model('vercel/nvidia/nemotron-nano-12b-v2-vl', {
    name: 'Nvidia Nemotron Nano 12B V2 VL',
    created: '2025-10-28',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.2,
      output: 0.6,
    },
    providers: ['vercel'],
  }),
  model('vercel/nvidia/nemotron-nano-9b-v2', {
    name: 'Nvidia Nemotron Nano 9B V2',
    created: '2025-08-18',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.06,
      output: 0.23,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-3.5-turbo', {
    name: 'GPT-3.5 Turbo',
    created: '2023-03-01',
    knowledge: '2021-09',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 16385,
      output: 4096,
    },
    cost: {
      input: 0.5,
      output: 1.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-4.1', {
    name: 'GPT-4.1',
    created: '2025-04-14',
    knowledge: '2024-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1047576,
      output: 32768,
    },
    cost: {
      input: 2,
      output: 8,
      cache_read: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-4.1-fast', {
    name: 'GPT-4.1 (Fast)',
    created: '2025-04-14',
    knowledge: '2024-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1047576,
      output: 32768,
    },
    cost: {
      input: 3.5,
      output: 14,
      cache_read: 0.875,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-4.1-mini', {
    name: 'GPT-4.1 mini',
    created: '2025-04-14',
    knowledge: '2024-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1047576,
      output: 32768,
    },
    cost: {
      input: 0.4,
      output: 1.6,
      cache_read: 0.1,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-4.1-mini-fast', {
    name: 'GPT-4.1 mini (Fast)',
    created: '2025-04-14',
    knowledge: '2024-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1047576,
      output: 32768,
    },
    cost: {
      input: 0.7,
      output: 2.8,
      cache_read: 0.175,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-4.1-nano-fast', {
    name: 'GPT-4.1 nano (Fast)',
    created: '2025-04-14',
    knowledge: '2024-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1047576,
      output: 32768,
    },
    cost: {
      input: 0.2,
      output: 0.8,
      cache_read: 0.05,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-4o', {
    name: 'GPT-4o',
    created: '2024-05-13',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 2.5,
      output: 10,
      cache_read: 1.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-4o-fast', {
    name: 'GPT-4o (Fast)',
    created: '2024-05-13',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 4.25,
      output: 17,
      cache_read: 2.125,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-4o-mini', {
    name: 'GPT-4o mini',
    created: '2024-07-18',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 0.15,
      output: 0.6,
      cache_read: 0.075,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-4o-mini-fast', {
    name: 'GPT-4o mini (Fast)',
    created: '2024-07-18',
    knowledge: '2023-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16384,
    },
    cost: {
      input: 0.25,
      output: 1,
      cache_read: 0.125,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-4o-mini-transcribe', {
    name: 'GPT-4o mini Transcribe',
    created: '2024-03-13',
    modalities: {
      input: ['audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 0,
      output: 0,
    },
    cost: {
      input: 1.25,
      output: 5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-4o-transcribe', {
    name: 'GPT-4o Transcribe',
    created: '2024-03-13',
    modalities: {
      input: ['audio'],
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 0,
      output: 0,
    },
    cost: {
      input: 2.5,
      output: 10,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5', {
    name: 'GPT-5',
    created: '2025-08-07',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5-codex', {
    name: 'GPT-5-Codex',
    created: '2025-09-15',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.13,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5-fast', {
    name: 'GPT-5 (Fast)',
    created: '2025-08-07',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 2.5,
      output: 20,
      cache_read: 0.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5-mini', {
    name: 'GPT-5 Mini',
    created: '2025-08-07',
    knowledge: '2024-05-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.25,
      output: 2,
      cache_read: 0.025,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5-mini-fast', {
    name: 'GPT-5 mini (Fast)',
    created: '2025-08-07',
    knowledge: '2024-05-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.45,
      output: 3.6,
      cache_read: 0.045,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5-nano', {
    name: 'GPT-5 Nano',
    created: '2025-08-07',
    knowledge: '2024-05-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.05,
      output: 0.4,
      cache_read: 0.005,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5-pro', {
    name: 'GPT-5 pro',
    created: '2025-10-06',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 272000,
    },
    cost: {
      input: 15,
      output: 120,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.1-codex', {
    name: 'GPT-5.1-Codex',
    created: '2025-11-13',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.13,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.1-codex-max', {
    name: 'GPT 5.1 Codex Max',
    created: '2025-11-13',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.1-codex-mini', {
    name: 'GPT-5.1 Codex mini',
    created: '2025-11-13',
    knowledge: '2024-09-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.25,
      output: 2,
      cache_read: 0.03,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.1-thinking', {
    name: 'GPT 5.1 Thinking',
    created: '2025-11-12',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.1-thinking-fast', {
    name: 'GPT 5.1 Thinking (Fast)',
    created: '2025-11-12',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 2.5,
      output: 20,
      cache_read: 0.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.2', {
    name: 'GPT-5.2',
    created: '2025-12-11',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.75,
      output: 14,
      cache_read: 0.175,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.2-codex', {
    name: 'GPT-5.2-Codex',
    created: '2025-12-11',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.75,
      output: 14,
      cache_read: 0.175,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.2-fast', {
    name: 'GPT 5.2 (Fast)',
    created: '2025-12-11',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 3.5,
      output: 28,
      cache_read: 0.35,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.2-pro', {
    name: 'GPT 5.2 ',
    created: '2025-12-11',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 21,
      output: 168,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.3-codex', {
    name: 'GPT 5.3 Codex',
    created: '2026-02-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.75,
      output: 14,
      cache_read: 0.175,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.3-codex-fast', {
    name: 'GPT 5.3 Codex (Fast)',
    created: '2026-02-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 3.5,
      output: 28,
      cache_read: 0.35,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.4', {
    name: 'GPT 5.4',
    created: '2026-03-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2.5,
      output: 15,
      cache_read: 0.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.4-fast', {
    name: 'GPT 5.4 (Fast)',
    created: '2026-03-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.4-mini', {
    name: 'GPT 5.4 Mini',
    created: '2026-03-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.75,
      output: 4.5,
      cache_read: 0.075,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.4-mini-fast', {
    name: 'GPT 5.4 Mini (Fast)',
    created: '2026-03-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 1.5,
      output: 9,
      cache_read: 0.15,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.4-nano', {
    name: 'GPT 5.4 Nano',
    created: '2026-03-17',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 400000,
      output: 128000,
    },
    cost: {
      input: 0.2,
      output: 1.25,
      cache_read: 0.02,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.4-pro', {
    name: 'GPT 5.4 Pro',
    created: '2026-03-05',
    knowledge: '2025-08-31',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 30,
      output: 180,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.5', {
    name: 'GPT 5.5',
    created: '2026-04-23',
    knowledge: '2025-12-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.5-fast', {
    name: 'GPT 5.5 (Fast)',
    created: '2026-04-23',
    knowledge: '2025-12-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 12.5,
      output: 75,
      cache_read: 1.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.5-pro', {
    name: 'GPT 5.5 Pro',
    created: '2026-04-23',
    knowledge: '2025-12-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 30,
      output: 180,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.6-luna', {
    name: 'GPT 5.6 Luna',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.2,
      output: 1.2,
      cache_read: 0.02,
      cache_write: 0.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.6-luna-fast', {
    name: 'GPT 5.6 Luna (Fast)',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.4,
      output: 2.4,
      cache_read: 0.04,
      cache_write: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.6-sol', {
    name: 'GPT 5.6 Sol',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.4,
      cache_write: 5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.6-sol-fast', {
    name: 'GPT 5.6 Sol (Fast)',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 8,
      output: 40,
      cache_read: 0.8,
      cache_write: 10,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.6-terra', {
    name: 'GPT 5.6 Terra',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 12,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-5.6-terra-fast', {
    name: 'GPT 5.6 Terra (Fast)',
    created: '2026-07-09',
    knowledge: '2026-02-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 24,
      cache_read: 0.4,
      cache_write: 5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-6-astra', {
    name: 'GPT-6 Astra',
    created: '2026-09-04',
    knowledge: '2026-04-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 10,
      output: 50,
      cache_read: 1,
      cache_write: 12.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-6-astra-fast', {
    name: 'GPT-6 Astra (Fast)',
    created: '2026-09-04',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 20,
      output: 100,
      cache_read: 2,
      cache_write: 25,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-6-luna', {
    name: 'GPT-6 Luna',
    created: '2026-09-22',
    knowledge: '2026-05-18',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.1,
      output: 0.5,
      cache_read: 0.01,
      cache_write: 0.125,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-6-luna-fast', {
    name: 'GPT-6 Luna (Fast)',
    created: '2026-09-22',
    knowledge: '2026-05-18',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 0.2,
      output: 1,
      cache_read: 0.02,
      cache_write: 0.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-6-sol', {
    name: 'GPT-6 Sol',
    created: '2026-09-22',
    knowledge: '2026-04-20',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write: 2.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-6-sol-fast', {
    name: 'GPT-6 Sol (Fast)',
    created: '2026-09-22',
    knowledge: '2026-04-20',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.4,
      cache_write: 5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-6.1-sol', {
    name: 'GPT-6.1 Sol',
    created: '2026-09-29',
    knowledge: '2026-04-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 2,
      output: 10,
      cache_read: 0.1,
      cache_write: 2.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-6.1-sol-fast', {
    name: 'GPT-6.1 Sol (Fast)',
    created: '2026-09-29',
    knowledge: '2026-04-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 128000,
    },
    cost: {
      input: 4,
      output: 20,
      cache_read: 0.2,
      cache_write: 5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-oss-120b', {
    name: 'GPT OSS 120B',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 131072,
      output: 131072,
    },
    cost: {
      input: 0.1,
      output: 0.5,
      cache_read: 0.1,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-oss-20b', {
    name: 'GPT OSS 20B',
    created: '2025-08-05',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 131072,
      output: 8192,
    },
    cost: {
      input: 0.03,
      output: 0.14,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-oss-safeguard-120b', {
    name: 'GPT OSS Safeguard 120B',
    created: '2025-10-29',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16000,
    },
    cost: {
      input: 0.15,
      output: 0.6,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/gpt-oss-safeguard-20b', {
    name: 'gpt-oss-safeguard-20b',
    created: '2025-10-29',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      streaming: true,
    },
    context: {
      input: 128000,
      output: 16000,
    },
    cost: {
      input: 0.07,
      output: 0.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/o3', {
    name: 'o3',
    created: '2025-04-16',
    knowledge: '2024-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 2,
      output: 8,
      cache_read: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/o3-fast', {
    name: 'o3 (Fast)',
    created: '2025-04-16',
    knowledge: '2024-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 3.5,
      output: 14,
      cache_read: 0.875,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/o3-pro', {
    name: 'o3 Pro',
    created: '2025-06-10',
    knowledge: '2024-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 20,
      output: 80,
    },
    providers: ['vercel'],
  }),
  model('vercel/openai/o4-mini-fast', {
    name: 'o4-mini (Fast)',
    created: '2025-04-16',
    knowledge: '2024-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 100000,
    },
    cost: {
      input: 2,
      output: 8,
      cache_read: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/perplexity/sonar', {
    name: 'Sonar',
    created: '2025-02-19',
    knowledge: '2025-02',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      streaming: true,
    },
    context: {
      input: 127000,
      output: 8000,
    },
    cost: {
      input: 0.25,
      output: 2.5,
      cache_write: 0.0625,
    },
    providers: ['vercel'],
  }),
  model('vercel/poolside/laguna-s-2.1', {
    name: 'Laguna S 2.1',
    created: '2026-07-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 0.1,
      output: 0.2,
      cache_read: 0.01,
    },
    providers: ['vercel'],
  }),
  model('vercel/poolside/laguna-s-2.1-free', {
    name: 'Laguna S 2.1 Free',
    created: '2026-07-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 256000,
      output: 32768,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['vercel'],
  }),
  model('vercel/sakana/fugu-max', {
    name: 'Fugu Max',
    created: '2026-09-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 1000000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.25,
    },
    providers: ['vercel'],
  }),
  model('vercel/sakana/fugu-ultra', {
    name: 'Fugu Ultra',
    created: '2026-06-15',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 1000000,
    },
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/sakana/fugu-ultra-v2', {
    name: 'Fugu Ultra v2',
    created: '2026-09-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 1000000,
    },
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/sakana/namazu', {
    name: 'Sakana Namazu',
    created: '2026-08-03',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 256000,
    },
    cost: {
      input: 0.95,
      output: 4,
      cache_read: 0.15,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.1-fast-non-reasoning', {
    name: 'Grok 4.1 Fast Non-Reasoning',
    created: '2025-11-19',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 1000000,
    },
    cost: {
      input: 0.2,
      output: 0.5,
      cache_read: 0.05,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.1-fast-reasoning', {
    name: 'Grok 4.1 Fast Reasoning',
    created: '2025-11-19',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 1000000,
    },
    cost: {
      input: 0.2,
      output: 0.5,
      cache_read: 0.05,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.20-multi-agent', {
    name: 'Grok 4.20 Multi-Agent',
    created: '2026-03-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 2000000,
      output: 2000000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.20-multi-agent-beta', {
    name: 'Grok 4.20 Multi Agent Beta',
    created: '2026-03-11',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 2000000,
      output: 2000000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.20-non-reasoning', {
    name: 'Grok 4.20 Non-Reasoning',
    created: '2026-03-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 2000000,
      output: 2000000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.20-non-reasoning-beta', {
    name: 'Grok 4.20 Beta Non-Reasoning',
    created: '2026-03-11',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 2000000,
      output: 2000000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.4,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.20-reasoning', {
    name: 'Grok 4.20 Reasoning',
    created: '2026-03-10',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 2000000,
      output: 2000000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.20-reasoning-beta', {
    name: 'Grok 4.20 Beta Reasoning',
    created: '2026-03-11',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 2000000,
      output: 2000000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.3', {
    name: 'Grok 4.3',
    created: '2026-04-17',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 1000000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.5', {
    name: 'Grok 4.5',
    created: '2026-07-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 500000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.3,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.6', {
    name: 'Grok 4.6',
    created: '2026-08-12',
    knowledge: '2026-02-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 500000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-4.7', {
    name: 'Grok 4.7',
    created: '2026-09-21',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 500000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.5,
    },
    providers: ['vercel'],
  }),
  model('vercel/spacexai/grok-build-0.1', {
    name: 'Grok Build 0.1',
    created: '2026-04-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 256000,
    },
    cost: {
      input: 1,
      output: 2,
      cache_read: 0.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/stealth/pixel-canary', {
    name: 'Pixel Canary',
    created: '2026-09-25',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'xhigh'],
        },
      ],
      vision: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 131072,
    },
    cost: {
      input: 0,
      output: 0,
    },
    providers: ['vercel'],
  }),
  model('vercel/stepfun/step-3.5-flash', {
    name: 'StepFun 3.5 Flash',
    created: '2026-01-29',
    knowledge: '2025-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262114,
      output: 262114,
    },
    cost: {
      input: 0.09,
      output: 0.3,
      cache_read: 0.02,
    },
    providers: ['vercel'],
  }),
  model('vercel/stepfun/step-3.7-flash', {
    name: 'Step 3.7 Flash',
    created: '2026-05-29',
    knowledge: '2026-03-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 256000,
    },
    cost: {
      input: 0.2,
      output: 1.15,
      cache_read: 0.04,
    },
    providers: ['vercel'],
  }),
  model('vercel/stepfun/step-5-preview', {
    name: 'Step 5 Preview',
    created: '2026-09-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 1000000,
    },
    cost: {
      input: 1,
      output: 2.7,
      cache_read: 0.05,
    },
    providers: ['vercel'],
  }),
  model('vercel/tencent/hy-mt2-lite', {
    name: 'Tencent Hy-MT2-Lite',
    created: '2026-06-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 8000,
      output: 4000,
    },
    cost: {
      input: 0.044,
      output: 0.177,
    },
    providers: ['vercel'],
  }),
  model('vercel/tencent/hy-mt2-plus', {
    name: 'Tencent Hy-MT2-Plus',
    created: '2026-06-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 8000,
      output: 4000,
    },
    cost: {
      input: 0.074,
      output: 0.295,
    },
    providers: ['vercel'],
  }),
  model('vercel/tencent/hy-mt2-pro', {
    name: 'Tencent Hy-MT2-Pro',
    created: '2026-05-21',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      streaming: true,
    },
    context: {
      input: 8000,
      output: 4000,
    },
    cost: {
      input: 0.074,
      output: 0.295,
    },
    providers: ['vercel'],
  }),
  model('vercel/tencent/hy3', {
    name: 'Hy3',
    created: '2026-07-06',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 0.14,
      output: 0.58,
      cache_read: 0.035,
    },
    providers: ['vercel'],
  }),
  model('vercel/tencent/hy4-preview', {
    name: 'Tencent Hy4 Preview',
    created: '2026-08-28',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1024000,
      output: 64000,
    },
    cost: {
      input: 0.834,
      output: 2.501,
      cache_read: 0.042,
    },
    providers: ['vercel'],
  }),
  model('vercel/thinkingmachines/inkling', {
    name: 'Inkling',
    created: '2026-07-15',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 256000,
    },
    cost: {
      input: 1,
      output: 4.05,
      cache_read: 0.17,
    },
    providers: ['vercel'],
  }),
  model('vercel/thinkingmachines/inkling-small', {
    name: 'Inkling Small',
    created: '2026-07-30',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 1000000,
    },
    cost: {
      input: 0.45,
      output: 1.2,
      cache_read: 0.1,
    },
    providers: ['vercel'],
  }),
  model('vercel/xiaomi/mimo-v2.5', {
    name: 'MiMo M2.5',
    created: '2026-04-22',
    knowledge: '2024-12',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 131100,
    },
    cost: {
      input: 0.14,
      output: 0.28,
      cache_read: 0.0028,
    },
    providers: ['vercel'],
  }),
  model('vercel/xiaomi/mimo-v2.5-pro', {
    name: 'MiMo V2.5 Pro',
    created: '2026-04-22',
    knowledge: '2024-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1050000,
      output: 131000,
    },
    cost: {
      input: 0.435,
      output: 0.87,
      cache_read: 0.0036,
    },
    providers: ['vercel'],
  }),
  model('vercel/xiaomi/mimo-v2.6-flash', {
    name: 'MiMo V2.6 Flash',
    created: '2026-09-22',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.14,
      output: 0.28,
      cache_read: 0.0028,
    },
    providers: ['vercel'],
  }),
  model('vercel/xiaomi/mimo-v2.6-pro', {
    name: 'MiMo V2.6 Pro',
    created: '2026-09-22',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 0.435,
      output: 0.87,
      cache_read: 0.0036,
    },
    providers: ['vercel'],
  }),
  model('vercel/xiaomi/mimo-v2.6-pro-ultraspeed', {
    name: 'MiMo V2.6 Pro UltraSpeed',
    created: '2026-09-21',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'minimal', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 131072,
    },
    cost: {
      input: 4.35,
      output: 8.7,
      cache_read: 0.036,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-4.5', {
    name: 'GLM 4.5',
    created: '2025-07-28',
    knowledge: '2025-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 96000,
    },
    cost: {
      input: 0.6,
      output: 2.2,
      cache_read: 0.11,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-4.5-air', {
    name: 'GLM 4.5 Air',
    created: '2025-07-28',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 128000,
      output: 96000,
    },
    cost: {
      input: 0.2,
      output: 1.1,
      cache_read: 0.03,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-4.5v', {
    name: 'GLM 4.5V',
    created: '2025-08-11',
    knowledge: '2025-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 66000,
      output: 16000,
    },
    cost: {
      input: 0.6,
      output: 1.8,
      cache_read: 0.11,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-4.6', {
    name: 'GLM 4.6',
    created: '2025-09-30',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 96000,
    },
    cost: {
      input: 0.6,
      output: 2.2,
      cache_read: 0.11,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-4.7', {
    name: 'GLM 4.7',
    created: '2025-12-22',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 200000,
      output: 120000,
    },
    cost: {
      input: 0.6,
      output: 2.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-4.7-flash', {
    name: 'GLM 4.7 Flash',
    created: '2026-01-19',
    knowledge: '2025-04',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 200000,
      output: 131000,
    },
    cost: {
      input: 0.07,
      output: 0.4,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-4.7-flashx', {
    name: 'GLM 4.7 FlashX',
    created: '2026-01-19',
    knowledge: '2025-01',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 128000,
    },
    cost: {
      input: 0.06,
      output: 0.4,
      cache_read: 0.01,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-5', {
    name: 'GLM-5',
    created: '2026-02-12',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      streaming: true,
    },
    context: {
      input: 202800,
      output: 131100,
    },
    cost: {
      input: 1,
      output: 3.2,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-5-turbo', {
    name: 'GLM 5 Turbo',
    created: '2026-03-16',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 202800,
      output: 131072,
    },
    cost: {
      input: 1.2,
      output: 4,
      cache_read: 0.24,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-5.1', {
    name: 'GLM 5.1',
    created: '2026-04-07',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 202800,
      output: 64000,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.26,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-5.2', {
    name: 'GLM 5.2',
    created: '2026-06-13',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 0.8,
      output: 2.55,
      cache_read: 0.16,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-5.2-fast', {
    name: 'GLM 5.2 Fast',
    created: '2026-06-13',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 128000,
    },
    cost: {
      input: 2.8,
      output: 8.8,
      cache_read: 0.56,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-5.3', {
    name: 'GLM 5.3',
    created: '2026-08-14',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 1000000,
    },
    cost: {
      input: 1.4,
      output: 4.4,
      cache_read: 0.14,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-5.3-fast', {
    name: 'GLM 5.3 Fast',
    created: '2026-08-14',
    modalities: {
      input: ['text'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 262144,
    },
    cost: {
      input: 2.1,
      output: 6.6,
      cache_read: 0.21,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-5.3-flash', {
    name: 'GLM 5.3 Flash',
    created: '2026-08-26',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131000,
    },
    cost: {
      input: 0.15,
      output: 0.5,
      cache_read: 0.03,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-5.3-flashx', {
    name: 'GLM 5.3 FlashX',
    created: '2026-08-26',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'high', 'max'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 131072,
    },
    cost: {
      input: 0.37,
      output: 1.25,
      cache_read: 0.075,
    },
    providers: ['vercel'],
  }),
  model('vercel/zai/glm-5v-turbo', {
    name: 'GLM 5V Turbo',
    created: '2026-04-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'toggle',
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 200000,
      output: 128000,
    },
    cost: {
      input: 1.2,
      output: 4,
      cache_read: 0.24,
    },
    providers: ['vercel'],
  }),
  model('voyage/voyage-3', {
    name: 'Voyage 3',
    modalities: {
      input: ['text'],
      output: ['embedding'],
    },
    operations: ['embeddings'],
    capabilities: {},
    context: {
      input: 32000,
      output: 1024,
    },
    providers: ['voyage'],
  }),
  model('voyage/voyage-3-lite', {
    name: 'Voyage 3 Lite',
    modalities: {
      input: ['text'],
      output: ['embedding'],
    },
    operations: ['embeddings'],
    capabilities: {},
    context: {
      input: 32000,
      output: 1024,
    },
    providers: ['voyage'],
  }),
  model('voyage/voyage-code-3', {
    name: 'Voyage Code 3',
    modalities: {
      input: ['text'],
      output: ['embedding'],
    },
    operations: ['embeddings'],
    capabilities: {},
    context: {
      input: 32000,
      output: 1024,
    },
    providers: ['voyage'],
  }),
  model('xai/grok-4.20-0309-non-reasoning', {
    name: 'Grok 4.20 (Non-Reasoning)',
    created: '2026-03-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 30000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['xai'],
  }),
  model('xai/grok-4.20-0309-reasoning', {
    name: 'Grok 4.20 (Reasoning)',
    created: '2026-03-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 30000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['xai'],
  }),
  model('xai/grok-4.20-multi-agent-0309', {
    name: 'Grok 4.20 Multi-Agent',
    created: '2026-03-09',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 30000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['xai'],
  }),
  model('xai/grok-4.3', {
    name: 'Grok 4.3',
    created: '2026-04-17',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['none', 'low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1000000,
      output: 30000,
    },
    cost: {
      input: 1.25,
      output: 2.5,
      cache_read: 0.2,
    },
    providers: ['xai'],
  }),
  model('xai/grok-4.5', {
    name: 'Grok 4.5',
    created: '2026-07-08',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 500000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.3,
    },
    providers: ['xai'],
  }),
  model('xai/grok-4.6', {
    name: 'Grok 4.6',
    created: '2026-08-12',
    knowledge: '2026-02-01',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 500000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.5,
    },
    providers: ['xai'],
  }),
  model('xai/grok-4.7', {
    name: 'Grok 4.7',
    created: '2026-09-21',
    knowledge: '2026-05',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      reasoningOptions: [
        {
          type: 'effort',
          values: ['low', 'medium', 'high', 'xhigh'],
        },
      ],
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 500000,
      output: 500000,
    },
    cost: {
      input: 2,
      output: 6,
      cache_read: 0.5,
    },
    providers: ['xai'],
  }),
  model('xai/grok-build-0.1', {
    name: 'Grok Build 0.1',
    created: '2026-04-16',
    modalities: {
      input: ['text', 'image'],
      output: ['text'],
    },
    operations: ['chat.completions'],
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      reasoning: true,
      vision: true,
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 256000,
      output: 256000,
    },
    cost: {
      input: 1,
      output: 2,
      cache_read: 0.2,
    },
    providers: ['xai'],
  }),
  model('xai/grok-imagine-image', {
    name: 'Grok Imagine Image',
    created: '2026-01-28',
    modalities: {
      input: ['text', 'image'],
      output: ['image'],
    },
    operations: ['images.generations'],
    capabilities: {
      vision: true,
    },
    context: {
      input: 16000,
      output: 0,
    },
    providers: ['xai'],
  }),
  model('xai/grok-imagine-image-quality', {
    name: 'Grok Imagine Image Quality',
    created: '2026-04-03',
    modalities: {
      input: ['text', 'image'],
      output: ['image'],
    },
    operations: ['images.generations'],
    capabilities: {
      vision: true,
    },
    context: {
      input: 16000,
      output: 0,
    },
    providers: ['xai'],
  }),
  model('xai/grok-imagine-video', {
    name: 'Grok Imagine Video',
    created: '2026-01-28',
    modalities: {
      input: ['text', 'image', 'video'],
      output: ['video'],
    },
    operations: ['video.generations'],
    capabilities: {
      vision: true,
    },
    context: {
      input: 1024,
      output: 0,
    },
    providers: ['xai'],
  }),
  model('xai/grok-imagine-video-1.5', {
    name: 'Grok Imagine Video 1.5',
    created: '2026-05-30',
    modalities: {
      input: ['text', 'image', 'audio'],
      output: ['video'],
    },
    operations: ['video.generations'],
    capabilities: {
      vision: true,
    },
    context: {
      input: 1024,
      output: 0,
    },
    providers: ['xai'],
  }),
);
