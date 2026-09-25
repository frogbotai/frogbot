import type { DynamicToolUIPart, ToolUIPart, UIMessage } from 'ai';
import { getToolName, isToolUIPart } from 'ai';

import type { DocID } from '../../collections/config/types.js';
import { updateIfVersion } from '../../database/compareAndSet.js';
import type { FrogBotRequest } from '../../types/request.js';
import type { StoredMessageUsage } from '../collections/messages.js';
import { mergeUsage, MESSAGE_USAGE_CONTEXT_KEY } from '../collections/messages.js';
import { messagesToUIMessages } from '../messagesToUIMessages.js';
import { validateChatMessages } from '../validateMessages.js';
import { TurnError } from './errors.js';
import type { ClientToolSettlement, MessageDelivery, PendingCall, TurnActor } from './types.js';

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type TurnMessageDocument = {
  id: string;
  chat: DocID | { id: DocID };
  role: UIMessage['role'];
  parts: UIMessage['parts'];
  metadata?: unknown;
  status?: 'active' | 'queued' | null;
  delivery?: MessageDelivery | null;
  author?: TurnActor | null;
  settlements?: Record<string, ClientToolSettlement> | null;
  version?: number | null;
  usage?: StoredMessageUsage | null;
  createdAt: string;
};

const MAX_WRITE_ATTEMPTS = 5;

export const INTERRUPTED_TOOL_ERROR = 'Interrupted before the tool call completed.';

export function isToolPart(part: UIMessage['parts'][number]): part is ToolPart {
  return isToolUIPart(part);
}

export function getPendingCalls({
  message,
  chatId,
  agentSlug,
}: {
  message: TurnMessageDocument;
  chatId: DocID;
  agentSlug: string;
}): PendingCall[] {
  return message.parts.filter(isPendingPart(message)).map((part) => ({
    toolCallId: part.toolCallId,
    toolName: getToolName(part),
    input: part.input,
    messageId: message.id,
    chatId,
    agentSlug,
    createdAt: message.createdAt,
  }));
}

export function hasPendingCalls(message: TurnMessageDocument): boolean {
  return message.parts.some(isPendingPart(message));
}

export function hasPendingParts(message: Pick<UIMessage, 'parts'>): boolean {
  return message.parts.some(isPendingPart({ settlements: null }));
}

export function repairInterruptedParts(parts: UIMessage['parts']): UIMessage['parts'] {
  return parts.map((part) =>
    isToolPart(part) &&
    part.providerExecuted !== true &&
    (part.state === 'input-streaming' || part.state === 'input-available')
      ? ({
          ...part,
          state: 'output-error',
          errorText: INTERRUPTED_TOOL_ERROR,
        } as unknown as ToolPart)
      : part,
  );
}

export async function findMessage({
  req,
  id,
}: {
  req: FrogBotRequest;
  id: string;
}): Promise<TurnMessageDocument | undefined> {
  const chat = messagesConfig(req);

  const message = await req.frogbot.findByID({
    collection: chat.messagesSlug,
    id,
    depth: 0,
    disableErrors: true,
    req,
    overrideAccess: true,
  });

  return (message ?? undefined) as TurnMessageDocument | undefined;
}

export async function findTurnMessage({
  req,
  chatId,
}: {
  req: FrogBotRequest;
  chatId: DocID;
}): Promise<TurnMessageDocument | undefined> {
  const chat = messagesConfig(req);

  const result = await req.frogbot.find({
    collection: chat.messagesSlug,
    where: { and: [{ chat: { equals: chatId } }, { status: { not_equals: 'queued' } }] },
    sort: ['-createdAt', '-id'],
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
  });

  const message = result.docs[0] as TurnMessageDocument | undefined;

  return message?.role === 'assistant' ? message : undefined;
}

export async function loadChatHistory({
  req,
  chatId,
  tools,
}: {
  req: FrogBotRequest;
  chatId: DocID;
  tools: unknown;
}): Promise<UIMessage[]> {
  const chat = messagesConfig(req);

  const history = await req.frogbot.find({
    collection: chat.messagesSlug,
    where: { and: [{ chat: { equals: chatId } }, { status: { not_equals: 'queued' } }] },
    sort: ['createdAt', 'id'],
    pagination: false,
    depth: 0,
    req,
    overrideAccess: true,
  });

  return validateChatMessages(messagesToUIMessages(history.docs as never), tools as never);
}

export async function persistTurnMessage({
  req,
  chatId,
  message,
  createdAt,
}: {
  req: FrogBotRequest;
  chatId: DocID;
  message: UIMessage;
  createdAt?: string;
}): Promise<void> {
  const chat = messagesConfig(req);
  const { metadata, usage } = splitMetadata(message.metadata);

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const stored = await findMessage({ req, id: message.id });

    if (!stored) {
      const created = await req.frogbot
        .create({
          collection: chat.messagesSlug,
          data: {
            id: message.id,
            chat: chatId,
            role: message.role,
            parts: message.parts,
            version: 0,
            ...(createdAt ? { createdAt } : {}),
            ...(metadata === undefined ? {} : { metadata }),
          },
          context: { [MESSAGE_USAGE_CONTEXT_KEY]: usage ?? null },
          req,
          overrideAccess: true,
        })
        .then(
          () => true,
          async (error: unknown) => {
            if (await findMessage({ req, id: message.id })) return false;

            throw error;
          },
        );

      if (created) return;

      continue;
    }

    const written = await updateIfVersion({
      req,
      collection: chat.messagesSlug,
      id: stored.id,
      version: stored.version ?? 0,
      data: {
        parts: preserveSettledParts({ parts: message.parts, stored }),
        ...(metadata === undefined ? {} : { metadata }),
        ...(usage === undefined ? {} : { usage: mergeUsage(stored.usage, usage) }),
      },
    });

    if (written) return;
  }

  throw new TurnError(
    'write-conflict',
    `Message '${message.id}' changed during every write attempt.`,
  );
}

export function messagesConfig(req: FrogBotRequest) {
  const chat = req.frogbot.config.chat;

  if (!chat.enabled) throw new Error('[frogbot] Chat turns require chat persistence.');

  return chat;
}

function isPendingPart({
  settlements,
}: Pick<TurnMessageDocument, 'settlements'>): (
  part: UIMessage['parts'][number],
) => part is ToolPart {
  return (part): part is ToolPart =>
    isToolPart(part) &&
    part.state === 'input-available' &&
    part.providerExecuted !== true &&
    !settlements?.[part.toolCallId];
}

function preserveSettledParts({
  parts,
  stored,
}: {
  parts: UIMessage['parts'];
  stored: TurnMessageDocument;
}): UIMessage['parts'] {
  const settlements = stored.settlements ?? {};

  const settled = new Map(
    stored.parts
      .filter((part): part is ToolPart => isToolPart(part) && !!settlements[part.toolCallId])
      .map((part) => [part.toolCallId, part]),
  );

  if (settled.size === 0) return parts;

  return parts.map((part) => (isToolPart(part) && settled.get(part.toolCallId)) || part);
}

function splitMetadata(metadata: unknown): { metadata?: unknown; usage?: StoredMessageUsage } {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return { metadata };

  const { usage, ...rest } = metadata as Record<string, unknown> & { usage?: StoredMessageUsage };

  return {
    ...(Object.keys(rest).length === 0 ? {} : { metadata: rest }),
    ...(usage === undefined ? {} : { usage }),
  };
}
