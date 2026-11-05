import type { UIMessage } from 'ai';
import { generateId } from 'ai';

import { assertAgentAccess, getAgent } from '../../agents/service.js';
import type { DocID } from '../../collections/config/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { findWritableChat } from '../findChat.js';
import { TurnError } from '../turn/errors.js';
import { loadChatHistory, persistTurnMessage } from '../turn/messages.js';
import { promoteQueuedMessage } from '../turn/queue.js';
import { assertStoredSelection, findGoverningSelection } from '../turn/selection.js';
import { claimTurn, holdTurn, releaseTurn } from '../turn/state.js';
import type { CompactionPart } from './history.js';
import { compact, createCompactionRun } from './run.js';

export type CompactChatResult = { message: UIMessage };

/**
 * Summarizes an idle chat now, whether or not automatic compaction is on, and stores the result as
 * an assistant message holding only the `manual` compaction part.
 */
export async function compactChat({
  req,
  chatId,
}: {
  req: FrogBotRequest;
  chatId: DocID;
}): Promise<CompactChatResult> {
  const chat = await findWritableChat({ req, chatId });
  const agent = getAgent({ req, slug: chat.agent ?? undefined });

  await assertAgentAccess({ req, agent });

  const claim = await claimTurn({ req, chatId: chat.id, from: 'idle' });

  if (!claim) {
    throw new TurnError(
      'turn-in-progress',
      'This chat is busy. Compact it once the reply or the answer it waits for is done.',
    );
  }

  const lease = holdTurn({ req, claim });

  try {
    const config = req.frogbot.config.ai!;
    const { model } = await assertStoredSelection({
      agent,
      config,
      selection: await findGoverningSelection({ req, chatId: chat.id }),
      req,
    });

    let part: CompactionPart | undefined;

    const run = createCompactionRun({
      req,
      chatId: chat.id,
      config,
      tools: agent.aiAgent.tools,
      options: {
        history: await loadChatHistory({ req, chatId: chat.id, tools: agent.aiAgent.tools }),
        emit: (event) => {
          part = event.part;
        },
      },
      abortSignal: lease.signal,
    });

    run.model = model;

    if (!(await compact(run, 'manual'))) {
      throw new TurnError('nothing-to-compact', 'There is nothing to compact in this chat yet.');
    }

    const message: UIMessage = { id: generateId(), role: 'assistant', parts: [part!] };

    await persistTurnMessage({ req, chatId: chat.id, message });

    return { message };
  } finally {
    lease.stop();

    if (await releaseTurn({ req, claim, state: 'idle' })) {
      await promoteQueuedMessage({ req, chatId: chat.id });
    }
  }
}
