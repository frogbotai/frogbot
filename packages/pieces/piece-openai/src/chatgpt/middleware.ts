import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4Middleware,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { GatewayError } from '@frogbotai/gateway/errors';

import { USAGE_URL } from './constants.js';

const REJECTED_OPTIONS = [
  'conversation',
  'logprobs',
  'maxToolCalls',
  'metadata',
  'previousResponseId',
  'promptCacheRetention',
  'reasoningEffortUpdate',
  'safetyIdentifier',
  'truncation',
  'user',
];

const HOSTED_TOOLS = new Set(['openai.web_search', 'openai.web_search_preview']);

const RECONNECT = 'Reconnect ChatGPT in Settings → Linked accounts.';
const UNSUPPORTED = "This request isn't supported on a ChatGPT plan.";
const BUSY = 'ChatGPT is busy. Try again in a moment.';

type PlanError = { status: number; message: string; busy?: true };

const PLAN_ERRORS: Record<string, PlanError> = {
  subscription_sharing_usage_limit_exceeded: {
    status: 429,
    message: `You've reached your ChatGPT plan's usage limit. Manage usage at ${USAGE_URL}.`,
  },
  subscription_sharing_user_not_eligible: {
    status: 403,
    message:
      "This ChatGPT account can't use its plan in other apps. Paste an OpenAI API key in Settings → Linked accounts instead.",
  },
  subscription_sharing_invalid_user: { status: 401, message: RECONNECT },
  chatpass_v2_scope_not_authorized: { status: 403, message: RECONNECT },
  chatpass_v2_invalid_authorization_context: { status: 403, message: RECONNECT },
  subscription_sharing_unsupported_capability: { status: 400, message: UNSUPPORTED },
  subscription_sharing_route_not_supported: { status: 403, message: UNSUPPORTED },
  subscription_sharing_usage_unavailable: { status: 503, message: BUSY, busy: true },
  subscription_sharing_user_unavailable: { status: 503, message: BUSY, busy: true },
};

function errorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);

  const { responseBody, data, code, message } = error as Record<string, unknown>;
  let json = '';

  try {
    json = JSON.stringify(data) ?? '';
  } catch {
    json = '';
  }

  return [responseBody, json, code, message].filter((value) => typeof value === 'string').join(' ');
}

function matchPlanError(error: unknown): PlanError | undefined {
  const text = errorText(error);
  const code = Object.keys(PLAN_ERRORS).find((candidate) => text.includes(candidate));

  if (code) return PLAN_ERRORS[code];

  return (error as { statusCode?: unknown } | undefined)?.statusCode === 401
    ? { status: 401, message: RECONNECT }
    : undefined;
}

const toGatewayError = ({ status, message }: PlanError) =>
  new GatewayError({ message, status, code: 'upstream_refused' });

/**
 * The error a plan call shows: OpenAI's plan codes, matched in the body or stream error as
 * OpenCode does, and a bare 401. `undefined` leaves the error as it is.
 */
export function planError(error: unknown): GatewayError | undefined {
  const known = matchPlanError(error);

  return known && toGatewayError(known);
}

/** Call options the plan route takes: no store, developer system text, no rejected fields. */
export function planParams(params: LanguageModelV4CallOptions): LanguageModelV4CallOptions {
  const {
    temperature: _temperature,
    topP: _topP,
    maxOutputTokens: _maxOutputTokens,
    ...rest
  } = params;

  const openai: Record<string, unknown> = { ...params.providerOptions?.openai };

  for (const option of REJECTED_OPTIONS) delete openai[option];

  const tools = params.tools?.filter(
    (tool) => tool.type === 'function' || HOSTED_TOOLS.has(tool.id),
  );

  const toolChoice =
    params.toolChoice?.type === 'tool' &&
    !tools?.some((tool) => tool.name === (params.toolChoice as { toolName: string }).toolName)
      ? undefined
      : params.toolChoice;

  return {
    ...rest,
    prompt: params.prompt.map((message) => {
      const options = message.providerOptions?.openai;

      if (!options || !('reasoningEffortUpdate' in options)) return message;

      const { reasoningEffortUpdate: _update, ...kept } = options;

      return { ...message, providerOptions: { ...message.providerOptions, openai: kept } };
    }),
    ...(tools ? { tools } : {}),
    ...(toolChoice ? { toolChoice } : {}),
    providerOptions: {
      ...params.providerOptions,
      openai: { ...openai, store: false, systemMessageMode: 'developer' },
    },
  };
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error);

      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason as Error);
      },
      { once: true },
    );
  });
}

function mapStreamErrors(result: LanguageModelV4StreamResult): LanguageModelV4StreamResult {
  return {
    ...result,
    stream: result.stream.pipeThrough(
      new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
        transform(part, controller) {
          controller.enqueue(
            part.type === 'error'
              ? { type: 'error', error: planError(part.error) ?? part.error }
              : part,
          );
        },
      }),
    ),
  };
}

const emptyUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

async function collect(
  result: LanguageModelV4StreamResult,
): Promise<LanguageModelV4GenerateResult> {
  const content: LanguageModelV4Content[] = [];
  const open = new Map<
    string,
    { type: 'text' | 'reasoning'; text: string; providerMetadata?: unknown }
  >();

  const generated: LanguageModelV4GenerateResult = {
    content,
    finishReason: { unified: 'other', raw: undefined },
    usage: emptyUsage,
    warnings: [],
    ...(result.request ? { request: result.request } : {}),
    response: { ...result.response },
  };

  const reader = result.stream.getReader();

  for (;;) {
    const { done, value: part } = await reader.read();

    if (done) break;

    switch (part.type) {
      case 'text-start':
      case 'reasoning-start': {
        const block = {
          type: part.type === 'text-start' ? ('text' as const) : ('reasoning' as const),
          text: '',
          ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
        };

        open.set(`${block.type}:${part.id}`, block);
        content.push(block);
        break;
      }

      case 'text-delta':
      case 'reasoning-delta': {
        const block = open.get(`${part.type === 'text-delta' ? 'text' : 'reasoning'}:${part.id}`);

        if (block) block.text += part.delta;
        break;
      }

      case 'text-end':
      case 'reasoning-end': {
        const block = open.get(`${part.type === 'text-end' ? 'text' : 'reasoning'}:${part.id}`);

        if (block && part.providerMetadata) block.providerMetadata = part.providerMetadata;
        break;
      }

      case 'stream-start':
        generated.warnings = part.warnings;
        break;

      case 'response-metadata': {
        const { type: _type, ...metadata } = part;

        generated.response = { ...generated.response, ...metadata };
        break;
      }

      case 'finish':
        generated.finishReason = part.finishReason;
        generated.usage = part.usage;
        if (part.providerMetadata) generated.providerMetadata = part.providerMetadata;
        break;

      case 'error':
        await reader.cancel().catch(() => undefined);
        throw part.error;

      case 'tool-input-start':
      case 'tool-input-delta':
      case 'tool-input-end':
      case 'raw':
        break;

      default:
        content.push(part);
    }
  }

  return generated;
}

const PREAMBLE = new Set(['stream-start', 'response-metadata', 'raw']);

async function untilOutput(
  result: LanguageModelV4StreamResult,
): Promise<LanguageModelV4StreamResult> {
  const reader = result.stream.getReader();
  const head: LanguageModelV4StreamPart[] = [];

  for (;;) {
    const { done, value: part } = await reader.read();

    if (done) break;

    if (part.type === 'error' && matchPlanError(part.error)?.busy) {
      await reader.cancel().catch(() => undefined);
      throw part.error;
    }

    head.push(part);
    if (!PREAMBLE.has(part.type)) break;
  }

  return {
    ...result,
    stream: new ReadableStream<LanguageModelV4StreamPart>({
      start(controller) {
        for (const part of head) controller.enqueue(part);
      },
      async pull(controller) {
        const { done, value } = await reader.read();

        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel: (reason) => reader.cancel(reason),
    }),
  };
}

/**
 * The middleware for language models on a ChatGPT plan. It reshapes each call for the plan route,
 * always streams (building non-streamed calls from the stream), and turns OpenAI's plan errors
 * into messages: the seven refusal codes fail at once, the two busy codes retry after each delay
 * while no output has arrived. That includes a busy error OpenAI sends after
 * `response.in_progress`, past the SDK's own early-error check, so each stream is read up to its
 * first output part before it is returned.
 */
export function createChatGPTMiddleware({
  retryDelays = [1000, 2000],
}: { retryDelays?: readonly number[] } = {}): LanguageModelV4Middleware {
  const open = async (
    doStream: () => PromiseLike<LanguageModelV4StreamResult>,
    signal: AbortSignal | undefined,
  ) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return mapStreamErrors(await untilOutput(await doStream()));
      } catch (error) {
        const known = matchPlanError(error);

        if (!known?.busy || attempt >= retryDelays.length) {
          throw known ? toGatewayError(known) : error;
        }

        await wait(retryDelays[attempt], signal);
      }
    }
  };

  return {
    specificationVersion: 'v4',
    transformParams: ({ params }) => Promise.resolve(planParams(params)),
    wrapGenerate: async ({ doStream, params }) => collect(await open(doStream, params.abortSignal)),
    wrapStream: ({ doStream, params }) => open(doStream, params.abortSignal),
  };
}

export const chatgptMiddleware = createChatGPTMiddleware();
