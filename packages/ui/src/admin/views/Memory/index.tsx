import { getCachedFrogBot } from 'frogbot';
import { hasFrogBot, toFrogBotRequest } from 'frogbot/internal';
import type { AdminViewServerProps } from 'payload';

import { MemoryViewClient } from './MemoryView.client.js';
import type { MemoryItem } from './types.js';

const PAGE_SIZE = 100;

/** The signed-in person's own memories, with forget. */
export async function MemoryView({ initPageResult, payload }: AdminViewServerProps) {
  const { req: payloadReq } = initPageResult;
  const frogbot = hasFrogBot(payloadReq) ? payloadReq.frogbot : getCachedFrogBot();

  if (!payloadReq.user || !frogbot?.config.memory) return null;

  let initial: { docs: MemoryItem[]; hasNextPage: boolean } = { docs: [], hasNextPage: false };
  let initialError: string | undefined;

  try {
    initial = await frogbot.memory.list({
      scope: 'me',
      limit: PAGE_SIZE,
      req: toFrogBotRequest(payloadReq, frogbot),
      overrideAccess: false,
    });
  } catch {
    initialError = 'Could not load your memories. Please try again.';
  }

  return (
    <MemoryViewClient
      apiPath={`${payload.config.routes.api.replace(/\/$/, '')}/frogbot/memory`}
      pageSize={PAGE_SIZE}
      initialMemories={initial.docs}
      initialHasNextPage={initial.hasNextPage}
      initialError={initialError}
    />
  );
}
