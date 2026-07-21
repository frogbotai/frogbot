import { consumeStream, generateId, toUIMessageStream } from 'ai';
import type { UIMessage } from 'ai';

import type { AgentGenerateResult } from '../types/agent.js';
import { createMessageUsage } from './messagePersistence.js';

export type GenerateMessageProps = {
  result: AgentGenerateResult;
  originalMessages: UIMessage[];
  tools: Record<string, unknown>;
  model: string;
};

export async function generateMessage({
  result,
  originalMessages,
  tools,
  model,
}: GenerateMessageProps): Promise<UIMessage> {
  let responseMessage: UIMessage | undefined;
  const stream = toUIMessageStream({
    stream: streamResult(result),
    tools: tools as never,
    originalMessages,
    generateMessageId: generateId,
    sendSources: true,
    messageMetadata: ({ part }) =>
      part.type === 'finish' ? { usage: createMessageUsage(part.totalUsage, model) } : undefined,
    onFinish: ({ responseMessage: message }) => {
      responseMessage = message;
    },
  });

  await consumeStream({ stream });
  if (!responseMessage) throw new Error('Agent generation produced no assistant message');
  return responseMessage;
}

function streamResult(result: AgentGenerateResult): ReadableStream<never> {
  const parts: unknown[] = [{ type: 'start' }];

  for (const step of result.steps) {
    parts.push({ type: 'start-step' });
    for (const part of step.content) {
      parts.push(...toStreamParts(part));
    }
    parts.push({ type: 'finish-step' });
  }

  parts.push({
    type: 'finish',
    finishReason: result.finishReason,
    rawFinishReason: result.rawFinishReason,
    totalUsage: result.totalUsage,
  });

  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part as never);
      }
      controller.close();
    },
  });
}

function toStreamParts(part: AgentGenerateResult['steps'][number]['content'][number]): unknown[] {
  if (part.type === 'text') {
    const id = generateId();
    return [
      { type: 'text-start', id, providerMetadata: part.providerMetadata },
      { type: 'text-delta', id, text: part.text, providerMetadata: part.providerMetadata },
      { type: 'text-end', id, providerMetadata: part.providerMetadata },
    ];
  }

  if (part.type === 'reasoning') {
    const id = generateId();
    return [
      { type: 'reasoning-start', id, providerMetadata: part.providerMetadata },
      { type: 'reasoning-delta', id, text: part.text, providerMetadata: part.providerMetadata },
      { type: 'reasoning-end', id, providerMetadata: part.providerMetadata },
    ];
  }

  return [part];
}
