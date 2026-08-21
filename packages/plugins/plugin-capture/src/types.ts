import type { Access } from 'frogbot';

export type CaptureStorage = {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  list(prefix: string): AsyncIterable<string>;
};

export type CaptureRecord = {
  captureId: string;
  requestId: string;
  operation: 'chat.completions' | 'messages' | 'responses';
  model: string;
  provider: string;
  requestedAt: string;
  completedAt: string;
  user?: string | number;
  apiKey?: string;
  request: {
    messages?: unknown[];
    system?: unknown;
    tools?: Record<string, unknown>;
    params?: Record<string, unknown>;
  };
  response?: unknown;
  error?: { name?: string; message: string };
};

export type CapturePluginOptions = {
  enabled?: boolean;
  storage?: CaptureStorage;
  storageRoot?: string;
  retentionDays?: number;
  sampleRate?: number;
  maxBodyBytes?: number;
  collectionSlug?: string;
  access?: Access;
};

export type CaptureRegistration = {
  collectionSlug: string;
  storage: CaptureStorage;
};
