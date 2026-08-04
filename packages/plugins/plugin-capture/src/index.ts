import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

import type {
  AIAfterErrorHookArgs,
  AIAfterUpstreamHookArgs,
  AIBeforeOperationHookArgs,
  AIBeforeUpstreamHookArgs,
  FrogbotConfig,
  Plugin,
} from 'frogbot';

const compress = promisify(gzip);
const languageOperations = new Set(['chat.completions', 'messages', 'responses']);
const stateKey = 'pluginCapture';

export type CapturePolicy = 'off' | 'errors-only' | 'sample' | 'full';

export type CaptureStorage = {
  put: (key: string, bytes: Uint8Array) => void | Promise<void>;
  cleanup?: (capturedBefore: Date) => void | Promise<void>;
};

export type CaptureBlob = {
  requestId: string;
  model: string;
  provider: string;
  operation: string;
  params?: unknown;
  messages?: unknown[];
  tools?: Record<string, unknown>;
  system?: unknown;
  response?: unknown;
  finishReason?: string;
  usage?: unknown;
  error?: { name?: string; message: string; stack?: string } | unknown;
  capturedAt: string;
};

export type CapturePluginOptions = {
  defaultPolicy?: CapturePolicy;
  sampleRate?: number;
  storage?: CaptureStorage;
  directory?: string;
  apiKeysCollectionSlug?: string | false;
  retentionDays?: number | null;
  retentionCron?: string;
};

type CaptureSnapshot = Pick<CaptureBlob, 'messages' | 'params' | 'system' | 'tools'>;
type CaptureState = {
  policy: CapturePolicy;
  selected: boolean;
  snapshot?: CaptureSnapshot;
};

export function createCaptureFilesystemStorage(directory: string): CaptureStorage {
  return {
    async put(key, bytes) {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, key), bytes);
    },
    async cleanup(capturedBefore) {
      let entries: string[];
      try {
        entries = await readdir(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      await Promise.all(entries.filter((entry) => entry.endsWith('.json.gz')).map(async (entry) => {
        const path = join(directory, entry);
        if ((await stat(path)).mtime < capturedBefore) await unlink(path);
      }));
    },
  };
}

function validateOptions(options: CapturePluginOptions): void {
  const rate = options.sampleRate ?? 0.1;
  if (rate < 0 || rate > 1) throw new Error('[plugin-capture] sampleRate must be between 0 and 1.');
  if (options.retentionDays !== undefined && options.retentionDays !== null && options.retentionDays <= 0) {
    throw new Error('[plugin-capture] retentionDays must be positive or null.');
  }
  if (options.storage && options.retentionDays != null && !options.storage.cleanup) {
    throw new Error('[plugin-capture] Custom storage requires cleanup when retentionDays is configured.');
  }
}

function getState(context: Record<string, unknown>): CaptureState | undefined {
  return context[stateKey] as CaptureState | undefined;
}

function setState(context: Record<string, unknown>, state: CaptureState): void {
  context[stateKey] = state;
}

function errorValue(error: unknown): CaptureBlob['error'] {
  if (!(error instanceof Error)) return error;
  return { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) };
}

function snapshotValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function policyForRequest(
  args: AIBeforeOperationHookArgs,
  options: CapturePluginOptions,
): Promise<{ policy: CapturePolicy; sampleRate: number }> {
  const fallback = { policy: options.defaultPolicy ?? 'off', sampleRate: options.sampleRate ?? 0.1 };
  const slug = options.apiKeysCollectionSlug === false ? undefined : options.apiKeysCollectionSlug ?? 'api-keys';
  const apiKeyId = args.req?.user?.apiKeyId;
  if (!slug || apiKeyId === undefined || !args.req) return fallback;
  const key = await args.req.frogbot.findByID({
    collection: slug as never,
    id: apiKeyId as never,
    depth: 0,
    overrideAccess: true,
    req: args.req,
  }) as Record<string, unknown>;
  return {
    policy: typeof key.capture === 'string' ? key.capture as CapturePolicy : fallback.policy,
    sampleRate: typeof key.captureSampleRate === 'number' ? key.captureSampleRate : fallback.sampleRate,
  };
}

function addPolicyFields(config: FrogbotConfig, options: CapturePluginOptions): FrogbotConfig['collections'] {
  const slug = options.apiKeysCollectionSlug === false ? undefined : options.apiKeysCollectionSlug ?? 'api-keys';
  if (!slug) return config.collections;
  const target = config.collections.find((collection) => collection.slug === slug);
  if (!target) {
    if (options.apiKeysCollectionSlug) throw new Error(`[plugin-capture] API keys collection '${slug}' was not found. Place apiKeysPlugin before capturePlugin.`);
    return config.collections;
  }
  const names = new Set(target.fields.flatMap((field) => 'name' in field && field.name ? [field.name] : []));
  const fields = [...target.fields];
  if (!names.has('capture')) fields.push({
    name: 'capture',
    type: 'select',
    defaultValue: 'off',
    required: true,
    label: 'Request capture',
    admin: { description: 'Records AI requests and responses made with this key.' },
    options: [
      { label: 'Off', value: 'off' },
      { label: 'Errors only', value: 'errors-only' },
      { label: 'Sample', value: 'sample' },
      { label: 'Full', value: 'full' },
    ],
  });
  if (!names.has('captureSampleRate')) fields.push({
    name: 'captureSampleRate',
    type: 'number',
    defaultValue: options.sampleRate ?? 0.1,
    min: 0,
    max: 1,
    admin: { condition: (_, siblingData) => siblingData.capture === 'sample' },
  });
  return config.collections.map((collection) => collection === target ? { ...collection, fields } : collection);
}

export function capturePlugin(options: CapturePluginOptions = {}): Plugin {
  validateOptions(options);
  const storage = options.storage ?? createCaptureFilesystemStorage(options.directory ?? join(process.cwd(), '.frogbot', 'captures'));
  return (config) => {
    if (!config.ai) throw new Error('[plugin-capture] AI configuration is required.');
    const beforeOperation = async (args: AIBeforeOperationHookArgs) => {
      if (args.context.capture === false) {
        setState(args.context, { policy: 'off', selected: false });
        return;
      }
      try {
        const { policy, sampleRate } = await policyForRequest(args, options);
        setState(args.context, { policy, selected: policy === 'sample' ? Math.random() < sampleRate : policy !== 'off' });
      } catch (error) {
        setState(args.context, { policy: 'off', selected: false });
        args.req?.frogbot.logger.error({ err: error, requestId: args.requestId }, '[plugin-capture] Policy lookup failed');
      }
    };
    const beforeUpstream = (args: AIBeforeUpstreamHookArgs) => {
      const state = getState(args.context);
      if (!state?.selected || !languageOperations.has(args.operation)) return;
      try {
        state.snapshot = snapshotValue({
          messages: args.messages,
          params: args.params,
          system: args.system,
          tools: args.tools,
        });
      } catch (error) {
        state.selected = false;
        args.req?.frogbot.logger.error({ err: error, requestId: args.requestId }, '[plugin-capture] Request snapshot failed');
      }
    };
    const write = (args: AIAfterUpstreamHookArgs | AIAfterErrorHookArgs) => {
      const state = getState(args.context);
      if (!state?.selected || !state.snapshot) return;
      const isError = args.phase === 'afterError';
      if (state.policy === 'errors-only' && !isError) return;
      const blob: CaptureBlob = {
        requestId: args.requestId,
        model: args.model,
        provider: args.provider,
        operation: args.operation,
        ...state.snapshot,
        ...(isError
          ? { error: errorValue(args.error) }
          : { response: args.response, finishReason: args.finishReason, usage: args.usage }),
        capturedAt: new Date().toISOString(),
      };
      void compress(JSON.stringify(blob)).then((bytes) => storage.put(`${args.requestId}.json.gz`, bytes)).catch((error) => {
        args.req?.frogbot.logger.error({ err: error, requestId: args.requestId }, '[plugin-capture] Capture write failed');
      });
    };
    const retentionDays = options.retentionDays;
    const configuredAutoRun = config.jobs?.autoRun;
    const resolveAutoRun = typeof configuredAutoRun === 'function' ? configuredAutoRun : undefined;
    const autoRunList = Array.isArray(configuredAutoRun) ? configuredAutoRun : [];
    const jobs = retentionDays == null ? config.jobs : {
      ...config.jobs,
      tasks: [
        ...(config.jobs?.tasks ?? []),
        {
          slug: 'frogbot-cleanup-captures',
          schedule: [{ cron: options.retentionCron ?? '0 3 * * *', queue: 'frogbot-capture-retention' }],
          handler: async () => {
            await storage.cleanup!(new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000));
            return { output: {} };
          },
        },
      ],
      autoRun: resolveAutoRun
        ? async (payload: Parameters<typeof resolveAutoRun>[0]) => [
            ...(await resolveAutoRun(payload)),
            { allQueues: true as const, cron: '* * * * *' },
          ]
        : [
            ...autoRunList,
            { allQueues: true as const, cron: '* * * * *' },
          ],
    };
    return {
      ...config,
      collections: addPolicyFields(config, options),
      jobs,
      ai: {
        ...config.ai,
        hooks: {
          ...config.ai.hooks,
          beforeOperation: [...(config.ai.hooks?.beforeOperation ?? []), beforeOperation],
          beforeUpstream: [...(config.ai.hooks?.beforeUpstream ?? []), beforeUpstream],
          afterUpstream: [...(config.ai.hooks?.afterUpstream ?? []), write],
          afterError: [...(config.ai.hooks?.afterError ?? []), write],
        },
      },
    };
  };
}
