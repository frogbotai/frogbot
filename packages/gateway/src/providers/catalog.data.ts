import { defineModelCatalog, type ModelCatalog,presetFor } from './catalog.js';

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
      streaming: true,
    },
    context: {
      input: 131072,
      output: 40960,
    },
    cost: {
      input: 0.99,
      output: 1.49,
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
  model('deepinfra/deepseek-ai/DeepSeek-V3-0324', {
    name: 'DeepSeek V3 0324',
    created: '2025-03-24',
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
      output: 163840,
    },
    cost: {
      input: 0.24,
      output: 0.9,
      cache_read: 0.135,
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
  model('deepinfra/moonshotai/Kimi-K2.7-Code', {
    name: 'Kimi K2.7 Code',
    created: '2026-06-12',
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
      output: 262144,
    },
    cost: {
      input: 0.68,
      output: 3.4,
      cache_read: 0.136,
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
  model('deepinfra/XiaomiMiMo/MiMo-V2.5', {
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
      input: 262144,
      output: 16384,
    },
    cost: {
      input: 0.14,
      output: 0.28,
      cache_read: 0.0028,
    },
    providers: ['deepinfra'],
  }),
  model('deepinfra/XiaomiMiMo/MiMo-V2.5-Pro', {
    name: 'MiMo-V2.5-Pro',
    created: '2026-04-22',
    knowledge: '2024-12',
    modalities: {
      input: ['text', 'audio'],
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
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048576,
      output: 16384,
    },
    cost: {
      input: 1,
      output: 3,
      cache_read: 0.2,
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
      input: 0.435,
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
  model('fireworks/accounts/fireworks/models/qwen3p7-plus', {
    name: 'Qwen 3.7 Plus',
    created: '2026-06-12',
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
          min: 1,
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
      input: 0.4,
      output: 1.6,
      cache_read: 0.08,
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
  model('fireworks/accounts/fireworks/routers/glm-5p2-fast', {
    name: 'GLM 5.2 Fast',
    created: '2026-06-26',
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
          values: ['high', 'max'],
        },
      ],
      promptCaching: true,
      streaming: true,
    },
    context: {
      input: 1048575,
      output: 131072,
    },
    cost: {
      input: 2.1,
      output: 6.6,
      cache_read: 0.21,
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
      output: ['text'],
    },
    operations: ['chat.completions'],
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
      output: ['text'],
    },
    operations: ['chat.completions', 'audio.transcriptions'],
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
      streaming: true,
    },
    context: {
      input: 256000,
      output: 4096,
    },
    cost: {
      input: 0.3,
      output: 0.9,
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
  model('mistral/magistral-small', {
    name: 'Magistral Small',
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
      output: 128000,
    },
    cost: {
      input: 0.5,
      output: 1.5,
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
      output: ['text'],
    },
    operations: ['chat.completions'],
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
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 0.5,
      output: 1.5,
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
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 0.5,
      output: 1.5,
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
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 1.5,
      output: 7.5,
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
      streaming: true,
    },
    context: {
      input: 262144,
      output: 262144,
    },
    cost: {
      input: 1.5,
      output: 7.5,
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
      streaming: true,
    },
    context: {
      input: 256000,
      output: 256000,
    },
    cost: {
      input: 0.15,
      output: 0.6,
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
      streaming: true,
    },
    context: {
      input: 256000,
      output: 256000,
    },
    cost: {
      input: 0.15,
      output: 0.6,
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
      output: ['text'],
    },
    operations: ['chat.completions'],
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
      output: ['text'],
    },
    operations: ['chat.completions'],
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
      output: ['text'],
    },
    operations: ['chat.completions'],
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
  model('togetherai/moonshotai/Kimi-K2.6', {
    name: 'Kimi K2.6',
    created: '2026-04-21',
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
      output: 131000,
    },
    cost: {
      input: 1.2,
      output: 4.5,
      cache_read: 0.2,
    },
    providers: ['togetherai'],
  }),
  model('togetherai/moonshotai/Kimi-K2.7-Code', {
    name: 'Kimi K2.7 Code',
    created: '2026-06-14',
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
      output: 131072,
    },
    cost: {
      input: 0.95,
      output: 4,
      cache_read: 0.19,
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
