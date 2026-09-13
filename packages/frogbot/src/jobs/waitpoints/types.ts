import type { Job, JsonObject } from 'payload';

export type WaitpointResult<T = unknown> = { expired: false; data: T } | { expired: true };

export type WaitpointReplay = {
  jobId: string;
  results: Record<string, WaitpointResult | null>;
};

export type WaitpointSnapshot = {
  workflow: string;
  input: JsonObject;
  queue: string;
  log: Job['log'];
  meta?: Job['meta'];
  results?: WaitpointReplay['results'];
};

export type Waitpoint = {
  id: number | string;
  jobId: string;
  name: string;
  token: string;
  kind: 'delay' | 'resumable';
  ready: boolean;
  status: 'pending' | 'resumed' | 'expired';
  expiresAt?: string;
  until?: string;
  data?: unknown;
  snapshot: WaitpointSnapshot;
  dispatched: boolean;
  dispatchOwner?: string | null;
  dispatchLeaseUntil?: string | null;
};

export type WaitFor = {
  (
    name: string,
    options: { until: Date | string; onWait?: never; expiresIn?: never },
  ): Promise<void>;
  <T = unknown>(
    name: string,
    options: {
      until?: never;
      expiresIn?: number;
      onWait: (args: { resumeUrl: string }) => void | Promise<void>;
    },
  ): Promise<WaitpointResult<T>>;
};

export type WaitpointOptions = {
  defaultExpiresIn: number;
  maxExpiresIn: number;
};
