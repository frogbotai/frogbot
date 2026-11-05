import type { LanguageModelMiddleware, ModelMessage, ToolSet, UIMessage } from 'ai';
import { generateId } from 'ai';
import { convertToLanguageModelPrompt, createDefaultDownloadFunction } from 'ai/internal';

import { aiErrorMessage } from '../../ai/errorMessage.js';
import { resolveModelInputs } from '../../ai/modelInputs.js';
import type { SanitizedAIConfig } from '../../ai/types.js';
import type { DocID } from '../../collections/config/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { toAgentModelMessages } from '../../uploads/toAgentModelMessages.js';
import { toModelInput } from '../../uploads/toModelInput.js';
import { messagesConfig, type TurnMessageDocument } from '../turn/messages.js';
import { compactionCeiling } from './ceiling.js';
import { checkpointMessage } from './checkpoint.js';
import { estimateModelMessages, estimateUIMessages } from './estimate.js';
import type { CompactionPartData } from './history.js';
import { beforeLatestCompaction, compactedHistory, withCheckpoint } from './history.js';
import { isOverflowError } from './overflow.js';
import type { CompactedHistory } from './split.js';
import { lastIndex, splitHistory } from './split.js';
import type { CompactionEvent } from './stream.js';
import { CompactionError, summarize } from './summarize.js';
import { contextWindow } from './window.js';

/** What a chat run needs to compact: the chat's stored messages and where to send parts. */
export type CompactionOptions = {
  history: UIMessage[];
  emit: (event: CompactionEvent) => void;
};

export type CompactionRun = {
  req: FrogBotRequest;
  chatId: DocID;
  config: SanitizedAIConfig;
  tools: ToolSet;
  emit: CompactionOptions['emit'];
  abortSignal?: AbortSignal;
  history: CompactedHistory;
  /** Stored replies measured before the latest compaction, so not a starting estimate. */
  stale: ReadonlySet<string>;
  /** The model messages the step's input starts with: the checkpointed history. */
  prefix?: ModelMessage[];
  /** How many of the SDK's carried messages are the prefix it was last given. */
  sdkPrefixLength: number;
  /** Whether the SDK's carried messages already start with `prefix`. */
  prefixSent: boolean;
  /** The step's messages after the prefix. */
  rest: ModelMessage[];
  shape: (messages: ModelMessage[]) => ModelMessage[];
  step: number;
  model: string;
  overflowRetried: boolean;
};

type MeasuredStep = {
  usage: { inputTokens?: number };
  response: { messages: readonly ModelMessage[] };
};

export function createCompactionRun({
  req,
  chatId,
  config,
  tools,
  options,
  abortSignal,
}: {
  req: FrogBotRequest;
  chatId: DocID;
  config: SanitizedAIConfig;
  tools: ToolSet;
  options: CompactionOptions;
  abortSignal?: AbortSignal;
}): CompactionRun {
  return {
    req,
    chatId,
    config,
    tools,
    emit: options.emit,
    abortSignal,
    history: compactedHistory(options.history),
    stale: beforeLatestCompaction(options.history),
    sdkPrefixLength: 0,
    prefixSent: true,
    rest: [],
    shape: (messages) => messages,
    step: 0,
    model: '',
    overflowRetried: false,
  };
}

/**
 * Builds a step's messages: the run's prefix, then everything the SDK carried after the prefix it
 * was last given, then `steered`. When the estimate reaches the model's ceiling, the prefix is
 * compacted first, so this run's replies, tool results and steered messages are never summarized.
 */
export async function compactionStep({
  run,
  messages,
  initialMessages,
  steps,
  stepNumber,
  model,
  steered,
  shape,
}: {
  run: CompactionRun;
  messages: ModelMessage[];
  initialMessages: ModelMessage[];
  steps: readonly MeasuredStep[];
  stepNumber: number;
  model: string;
  steered: ModelMessage[];
  shape: CompactionRun['shape'];
}): Promise<ModelMessage[]> {
  if (run.prefix === undefined) {
    run.prefix = initialMessages;
    run.sdkPrefixLength = initialMessages.length;
  }

  run.step = stepNumber;
  run.model = model;
  run.shape = shape;
  run.rest = [...messages.slice(run.sdkPrefixLength), ...steered];

  const { auto, buffer } = run.config.compaction;
  const ceiling = auto
    ? compactionCeiling({ window: contextWindow({ config: run.config, model }), buffer })
    : undefined;

  if (ceiling !== undefined && (await estimate({ run, steps, steered })) >= ceiling) {
    await compact(run, 'auto');
  }

  const stepMessages = run.prefixSent
    ? steered.length === 0
      ? messages
      : [...messages, ...steered]
    : [...run.prefix, ...run.rest];

  run.prefixSent = true;
  run.sdkPrefixLength = run.prefix.length;

  return stepMessages;
}

/**
 * Summarizes the run's older history and makes the checkpoint the new prefix. Emits the part as
 * `running`, then `completed` or `failed`. Returns `false` when there is nothing to compact.
 */
export async function compact(
  run: CompactionRun,
  reason: CompactionPartData['reason'],
): Promise<boolean> {
  const split = splitHistory(run.history, run.config.compaction.keep);

  if (split.older.length === 0) return false;

  const id = generateId();
  const emit = (data: CompactionPartData) =>
    run.emit({ step: run.step, part: { type: 'data-compaction', id, data } });

  emit({ status: 'running', reason });

  try {
    const { inputs, provider } = resolveModelInputs({ config: run.config, model: run.model });
    const summary = await summarize({
      req: run.req,
      model: run.model,
      messages: toModelInput({
        messages: await convert(run, split.older),
        inputs,
        provider,
        hashes: new Map(),
      }),
      update: run.history.checkpoint !== undefined,
      abortSignal: run.abortSignal,
    });

    run.history = {
      checkpoint: checkpointMessage({ id, summary: summary.text }),
      messages: split.kept,
    };

    run.prefix = await convert(run, withCheckpoint(run.history));
    run.prefixSent = false;

    emit({
      status: 'completed',
      reason,
      summary: summary.text,
      tokens: summary.tokens,
      keepFrom: split.keepFrom,
    });

    return true;
  } catch (error) {
    if (run.abortSignal?.aborted) {
      emit({ status: 'failed', reason, error: 'Compaction stopped.' });

      throw error;
    }

    const failure =
      error instanceof CompactionError
        ? error
        : new CompactionError(
            `Compaction failed. ${
              aiErrorMessage({ error, model: run.model, config: run.config }) ??
              'The summary request did not complete.'
            }`,
            { cause: error },
          );

    emit({ status: 'failed', reason, error: failure.message });

    throw failure;
  }
}

/**
 * Model middleware that answers the first "too long" rejection of a run with one compaction and
 * one retry of the same step. Any later rejection is thrown.
 */
export function overflowRetry(run: CompactionRun): LanguageModelMiddleware {
  const retry = async <T>(
    call: () => PromiseLike<T>,
    again: (prompt: Prompt) => PromiseLike<T>,
    prompt: Prompt,
    supportedUrls: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>>,
    provider: string,
  ): Promise<T> => {
    try {
      return await call();
    } catch (error) {
      if (run.overflowRetried || !isOverflowError(error)) throw error;

      run.overflowRetried = true;

      if (!(await compact(run, 'auto'))) throw error;

      const first = prompt.findIndex(({ role }) => role !== 'system');
      const system = first < 0 ? prompt : prompt.slice(0, first);
      const messages = await convertToLanguageModelPrompt({
        prompt: { instructions: undefined, messages: run.shape([...run.prefix!, ...run.rest]) },
        supportedUrls: await supportedUrls,
        download: createDefaultDownloadFunction(),
        abortSignal: run.abortSignal,
        provider: provider.split('.')[0],
      });

      return again([...system, ...messages]);
    }
  };

  return {
    specificationVersion: 'v4',
    wrapGenerate: ({ doGenerate, params, model }) =>
      retry(
        doGenerate,
        (prompt) => model.doGenerate({ ...params, prompt }),
        params.prompt,
        model.supportedUrls,
        model.provider,
      ),
    wrapStream: ({ doStream, params, model }) =>
      retry(
        doStream,
        (prompt) => model.doStream({ ...params, prompt }),
        params.prompt,
        model.supportedUrls,
        model.provider,
      ),
  };
}

type Prompt = Parameters<NonNullable<LanguageModelMiddleware['wrapStream']>>[0]['params']['prompt'];

function convert(run: CompactionRun, messages: UIMessage[]): Promise<ModelMessage[]> {
  return toAgentModelMessages({
    req: run.req,
    messages,
    chatId: run.chatId,
    model: run.model,
    tools: run.tools,
    onUnavailable: 'marker',
  });
}

async function estimate({
  run,
  steps,
  steered,
}: {
  run: CompactionRun;
  steps: readonly MeasuredStep[];
  steered: ModelMessage[];
}): Promise<number> {
  const previous = steps.at(-1);
  const measured = previous?.usage.inputTokens;

  if (previous && measured !== undefined) {
    return measured + estimateModelMessages([...previous.response.messages, ...steered]);
  }

  const rest = estimateModelMessages(run.rest);
  const anchor = previous ? undefined : await newestMeasuredReply(run);
  const index =
    anchor && !run.stale.has(anchor.id)
      ? run.history.messages.findIndex(({ id }) => id === anchor.id)
      : -1;

  const tokens = anchor?.usage?.lastStepInputTokens;

  if (index < 0 || tokens === undefined || tokens === null) {
    return estimateModelMessages(run.prefix!) + rest;
  }

  const message = run.history.messages[index];
  const lastStep = lastIndex(message.parts, (part) => part.type === 'step-start');

  return (
    tokens +
    estimateUIMessages([
      { parts: message.parts.slice(Math.max(lastStep, 0)) },
      ...run.history.messages.slice(index + 1),
    ]) +
    rest
  );
}

async function newestMeasuredReply(run: CompactionRun): Promise<TurnMessageDocument | undefined> {
  const { docs } = await run.req.frogbot.find({
    collection: messagesConfig(run.req).messagesSlug,
    where: {
      and: [
        { chat: { equals: run.chatId } },
        { role: { equals: 'assistant' } },
        { status: { not_equals: 'queued' } },
        { 'usage.lastStepInputTokens': { exists: true } },
      ],
    },
    sort: ['-createdAt', '-id'],
    limit: 1,
    depth: 0,
    req: run.req,
    overrideAccess: true,
  });

  return docs[0] as TurnMessageDocument | undefined;
}
