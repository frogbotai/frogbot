import type { SharedV4ProviderMetadata } from '@ai-sdk/provider';

export type ProviderMetadata = SharedV4ProviderMetadata;

export type CacheControl = {
  type: 'ephemeral';
  ttl?: '5m' | '1h' | '24h';
};

export enum ReasoningEffort {
  NONE = 'none',
  MINIMAL = 'minimal',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  XHIGH = 'xhigh',
  MAX = 'max',
}

export enum ReasoningSummary {
  AUTO = 'auto',
  CONCISE = 'concise',
  DETAILED = 'detailed',
  NONE = 'none',
}
