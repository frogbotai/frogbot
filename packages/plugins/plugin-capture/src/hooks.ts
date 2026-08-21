import { randomUUID } from 'node:crypto';

import type {
  AIAfterErrorHookArgs,
  AIAfterUpstreamHookArgs,
  AIBeforeOperationHookArgs,
  AIBeforeUpstreamHookArgs,
  AIHooks,
  FrogbotRequest,
} from 'frogbot';

import { captureBlobKey, encodeCapture } from './blob.js';
import type { CapturePluginOptions, CaptureRecord, CaptureStorage } from './types.js';

const languageOperations = new Set(['chat.completions', 'messages', 'responses']);
const stateKey = 'frogbotCapture';

type CaptureState = {
  enabled: boolean;
  request?: CaptureRecord['request'];
  captureId?: string;
};

type HookOptions = Required<
  Pick<CapturePluginOptions, 'enabled' | 'maxBodyBytes' | 'sampleRate'>
> & {
  collectionSlug: string;
  storage: CaptureStorage;
};

function errorValue(error: unknown): CaptureRecord['error'] {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}

function logFailure(req: FrogbotRequest | undefined, error: unknown): void {
  req?.payload?.logger?.error({ err: error }, '[plugin-capture] capture failed');
}

async function persist(
  args: AIAfterUpstreamHookArgs | AIAfterErrorHookArgs,
  options: HookOptions,
): Promise<void> {
  const state = args.context[stateKey] as CaptureState | undefined;
  if (!state?.enabled || !state.request || !state.captureId || !args.req) return;
  const requestedAt = new Date(args.startedAt).toISOString();
  const completedAt = new Date().toISOString();
  const apiKey =
    args.req.user && typeof (args.req.user as Record<string, unknown>).apiKeyId === 'string'
      ? String((args.req.user as Record<string, unknown>).apiKeyId)
      : undefined;
  const capture: CaptureRecord = {
    captureId: state.captureId,
    requestId: args.requestId,
    operation: args.operation as CaptureRecord['operation'],
    model: args.model,
    provider: args.provider,
    requestedAt,
    completedAt,
    user: args.req.user?.id,
    apiKey,
    request: state.request,
    ...('error' in args ? { error: errorValue(args.error) } : { response: args.response }),
  };
  if (Buffer.byteLength(JSON.stringify(capture)) > options.maxBodyBytes) {
    throw new Error(`capture exceeds maxBodyBytes (${options.maxBodyBytes})`);
  }
  const bytes = await encodeCapture(capture);
  const blobKey = captureBlobKey(capture.captureId, new Date(args.startedAt));
  await options.storage.put(blobKey, bytes);
  await args.req.frogbot.create({
    collection: options.collectionSlug as never,
    data: {
      captureId: capture.captureId,
      requestId: capture.requestId,
      user: capture.user == null ? undefined : String(capture.user),
      apiKey,
      operation: capture.operation,
      model: capture.model,
      blobKey,
      sizeBytes: bytes.byteLength,
      status: capture.error ? 'error' : 'success',
      requestedAt,
      completedAt,
    } as never,
    overrideAccess: true,
    req: args.req,
  });
}

export function createCaptureHooks(options: HookOptions): AIHooks {
  return {
    beforeOperation: [
      (args: AIBeforeOperationHookArgs) => {
        if (!languageOperations.has(args.operation)) return;
        let enabled = options.enabled;
        let sampleRate = options.sampleRate;
        const actor = args.req?.user as Record<string, unknown> | undefined;
        if (typeof actor?.capture === 'boolean') enabled = actor.capture;
        if (actor?.capture === 'enabled') enabled = true;
        if (actor?.capture === 'disabled') enabled = false;
        if (typeof actor?.captureSampleRate === 'number') sampleRate = actor.captureSampleRate;
        args.context[stateKey] = {
          enabled: enabled && Math.random() < sampleRate,
        } satisfies CaptureState;
      },
    ],
    beforeUpstream: [
      (args: AIBeforeUpstreamHookArgs) => {
        const state = args.context[stateKey] as CaptureState | undefined;
        if (!state?.enabled) return;
        const request = {
          messages: args.messages,
          system: args.system,
          tools: args.tools,
          params: args.params,
        };
        if (Buffer.byteLength(JSON.stringify(request)) > options.maxBodyBytes) {
          state.enabled = false;
          logFailure(args.req, new Error(`capture exceeds maxBodyBytes (${options.maxBodyBytes})`));
          return;
        }
        state.captureId = randomUUID();
        state.request = structuredClone(request);
      },
    ],
    afterUpstream: [
      (args) => {
        void persist(args, options).catch((error) => logFailure(args.req, error));
      },
    ],
    afterError: [
      (args) => {
        void persist(args, options).catch((error) => logFailure(args.req, error));
      },
    ],
  };
}
