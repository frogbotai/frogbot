import type { ResolvedAgentSelection } from '../../agents/service.js';
import { AgentServiceError, assertAgentSelection } from '../../agents/service.js';
import type { AgentInstance, AgentModelId, AgentSelection } from '../../agents/types.js';
import type { SanitizedAIConfig } from '../../ai/types.js';
import type { DocID } from '../../collections/config/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { TurnError } from './errors.js';
import type { TurnMessageDocument } from './messages.js';
import { messagesConfig } from './messages.js';

export function readSelection(
  message: Pick<TurnMessageDocument, 'model' | 'reasoning'>,
): AgentSelection {
  return {
    ...(message.model ? { model: message.model as AgentModelId } : {}),
    ...(message.reasoning ? { reasoning: message.reasoning } : {}),
  };
}

export function selectionData(selection: AgentSelection) {
  return { model: selection.model ?? null, reasoning: selection.reasoning ?? null };
}

export async function findGoverningSelection({
  req,
  chatId,
}: {
  req: FrogBotRequest;
  chatId: DocID;
}): Promise<AgentSelection> {
  const result = await req.frogbot.find({
    collection: messagesConfig(req).messagesSlug,
    where: {
      and: [
        { chat: { equals: chatId } },
        { role: { equals: 'user' } },
        { status: { not_equals: 'queued' } },
      ],
    },
    sort: ['-createdAt', '-id'],
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
  });

  const message = result.docs[0] as TurnMessageDocument | undefined;

  return message ? readSelection(message) : {};
}

export function assertStoredSelection({
  agent,
  config,
  selection,
  user,
}: {
  agent: AgentInstance;
  config: SanitizedAIConfig;
  selection: AgentSelection;
  user: FrogBotRequest['user'] | undefined;
}): ResolvedAgentSelection {
  try {
    return assertAgentSelection({ agent, config, selection, user });
  } catch (error) {
    if (error instanceof AgentServiceError) {
      throw new TurnError('selection-unavailable', error.message);
    }

    throw error;
  }
}
