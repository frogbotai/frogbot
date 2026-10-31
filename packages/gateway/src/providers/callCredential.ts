import { type LanguageModelMiddleware, wrapLanguageModel } from 'ai';

import type { AIProvider, GatewayLanguageModel } from './registry.js';

/** Where a call entered the gateway: an in-process model call, or an HTTP route. */
export type CallCredentialVia = 'app' | 'http';

/** Provider settings for one call, merged over the entry's own; `middleware` wraps its language model. */
export type CallCredentialResult<TSettings = Record<string, unknown>> = {
  settings: TSettings;
  middleware?: LanguageModelMiddleware | LanguageModelMiddleware[];
};

/**
 * Picks the credential for one call from its hook `context`. Return `undefined` to use the
 * entry's own settings; throw to fail the call before any request is sent.
 */
export type CallCredential<TSettings = Record<string, unknown>> = (
  context: Record<string, unknown>,
  options: { via: CallCredentialVia },
) =>
  | CallCredentialResult<TSettings>
  | undefined
  | Promise<CallCredentialResult<TSettings> | undefined>;

/** The call a resolved provider serves: its hook `context` and entry point. */
export type CallScope = {
  context: Record<string, unknown>;
  via: CallCredentialVia;
};

type ModelFactories = Partial<Record<ModelMethod, (modelId: string) => object>>;

type CallCredentialBinding = {
  credential: CallCredential;
  build: (settings: Record<string, unknown>) => object;
  instances: Map<string, ModelFactories>;
};

type ModelMethod =
  | 'languageModel'
  | 'embeddingModel'
  | 'imageModel'
  | 'videoModel'
  | 'speechModel'
  | 'transcriptionModel'
  | 'rerankingModel'
  | 'evaluationModel';

const MODEL_METHODS: readonly ModelMethod[] = [
  'languageModel',
  'embeddingModel',
  'imageModel',
  'videoModel',
  'speechModel',
  'transcriptionModel',
  'rerankingModel',
  'evaluationModel',
];

const MAX_INSTANCES = 256;
const usedTag = Symbol.for('frogbotai.gateway.callCredential');
const bindings = new WeakMap<object, CallCredentialBinding>();

/**
 * Wrap every `do*` call on a model. `call` runs the original method and may replace the model,
 * the result or the error; every other property reads from the model itself.
 */
export function wrapModelCalls<T extends object>(
  model: T,
  call: (args: { method: string; args: unknown[]; run: (target: object) => unknown }) => unknown,
): T {
  return new Proxy(model, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);

      if (typeof value !== 'function') return value;

      if (typeof key !== 'string' || !key.startsWith('do')) {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }

      return (...args: unknown[]) =>
        call({
          method: key,
          args,
          run: (other) =>
            (Reflect.get(other, key) as (...args: unknown[]) => unknown).apply(other, args),
        });
    },
  });
}

export function bindCallCredential(
  instance: object,
  binding: Omit<CallCredentialBinding, 'instances'>,
): void {
  bindings.set(instance, { ...binding, instances: new Map() });
}

/** True when the error came from a call that ran on a `credential()` result, not the entry's settings. */
export function usedCallCredential(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;

  while (current !== null && typeof current === 'object' && !seen.has(current)) {
    if (Object.hasOwn(current, usedTag)) return true;

    seen.add(current);

    current = 'lastError' in current ? current.lastError : (current as { cause?: unknown }).cause;
  }

  return false;
}

function markUsed(error: unknown): void {
  if (error === null || typeof error !== 'object' || Object.isFrozen(error)) return;
  if (Object.hasOwn(error, usedTag)) return;

  Object.defineProperty(error, usedTag, { value: true, enumerable: false });
}

function canonicalSettings(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalSettings).join(',')}]`;

  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalSettings(entry)}`)
      .join(',')}}`;
  }

  if (value === undefined || ['function', 'symbol', 'bigint'].includes(typeof value)) {
    throw new TypeError('[gateway] credential() settings must contain only JSON values.');
  }

  return JSON.stringify(value);
}

async function settingsHash(settings: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSettings(settings));
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function callInstance(
  binding: CallCredentialBinding,
  settings: Record<string, unknown>,
): Promise<ModelFactories> {
  const hash = await settingsHash(settings);
  const cached = binding.instances.get(hash);

  binding.instances.delete(hash);

  const instance = cached ?? binding.build(settings);

  binding.instances.set(hash, instance);
  if (binding.instances.size > MAX_INSTANCES) {
    binding.instances.delete(binding.instances.keys().next().value!);
  }

  return instance;
}

function asV4(
  model: GatewayLanguageModel,
  middleware: LanguageModelMiddleware | LanguageModelMiddleware[] = [],
): GatewayLanguageModel {
  return wrapLanguageModel({ model, middleware });
}

function markStreamErrors(result: unknown): unknown {
  const stream = (result as { stream?: unknown } | undefined)?.stream;

  if (!(stream instanceof ReadableStream)) return result;

  return {
    ...(result as object),
    stream: stream.pipeThrough(
      new TransformStream<{ type?: string; error?: unknown }>({
        transform(part, controller) {
          if (part.type === 'error') markUsed(part.error);
          controller.enqueue(part);
        },
      }),
    ),
  };
}

function lazyModel(args: {
  method: ModelMethod;
  modelId: string;
  fallback: object;
  binding: CallCredentialBinding;
  scope: CallScope;
}): object {
  const { method, modelId, binding, scope } = args;
  const language = method === 'languageModel';
  const fallback = language ? asV4(args.fallback as GatewayLanguageModel) : args.fallback;

  const resolve = async (): Promise<{ model: object; used: boolean }> => {
    const result = await binding.credential(scope.context, { via: scope.via });

    if (!result) return { model: fallback, used: false };

    const instance = await callInstance(binding, result.settings);
    const model = instance[method]!.call(instance, modelId);

    return {
      model: language ? asV4(model as GatewayLanguageModel, result.middleware) : model,
      used: true,
    };
  };

  return wrapModelCalls(fallback, async ({ run }) => {
    const { model, used } = await resolve();

    if (!used) return run(model);

    try {
      return markStreamErrors(await run(model));
    } catch (error) {
      markUsed(error);
      throw error;
    }
  });
}

/**
 * The provider a call should use. An entry without `credential` returns its instance; an entry
 * with one returns a provider whose models await `credential(context, { via })` on every call.
 */
export function withCallCredential(instance: AIProvider, scope: CallScope): AIProvider {
  const binding = bindings.get(instance);

  if (!binding) return instance;

  const provider: ModelFactories = {};
  const factories: ModelFactories = instance;

  for (const method of MODEL_METHODS) {
    const factory = factories[method];

    if (typeof factory !== 'function') continue;

    provider[method] = (modelId) =>
      lazyModel({ method, modelId, fallback: factory.call(instance, modelId), binding, scope });
  }

  return provider as AIProvider;
}
