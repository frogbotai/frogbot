export type WaitpointResult<T = unknown> = { expired: false; data: T } | { expired: true };

export type WaitpointReplay = {
  jobId: string;
  results: Record<string, WaitpointResult | null>;
  waiting?: string;
};

export type Waitpoint = {
  id: number | string;
  jobId: string;
  name: string;
  holder?: number | string | null;
  token: string;
  kind: 'delay' | 'resumable';
  ready: boolean;
  status: 'pending' | 'resumed' | 'expired';
  expiresAt?: string;
  until?: string;
  data?: unknown;
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
