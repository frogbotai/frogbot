import { createPieceHelpers, type definePiece } from 'frogbot/pieces';
import { z } from 'zod';

type PollOptions = { prefix: string };

type PollCursor = { since: number };

const isCursor = (cursor: unknown): cursor is PollCursor =>
  typeof cursor === 'object' && cursor !== null && 'since' in cursor;

type PollRun = (args: {
  input: { folder: string };
  cursor?: PollCursor;
}) => Promise<{ events: Array<{ message: string }>; cursor?: PollCursor | string }>;

const defaultRun: PollRun = ({ cursor }) =>
  Promise.resolve({ events: [], cursor: cursor ?? { since: 0 } });

export const pollControl: { run: PollRun; calls: Parameters<PollRun>[0][] } = {
  run: defaultRun,
  calls: [],
};

export function resetPollControl(): void {
  pollControl.run = defaultRun;
  pollControl.calls.length = 0;
}

const { definePollingTrigger } = createPieceHelpers<PollOptions, PollOptions>();

export function definePollPiece(define: typeof definePiece) {
  const polledTrigger = definePollingTrigger({
    slug: 'polled',
    type: 'polling',
    description: 'Poll for new messages.',
    input: z.object({ folder: z.string() }),
    output: z.object({ message: z.string() }),
    schedule: '*/5 * * * *',
    run({ input, cursor }) {
      const call = { input, cursor: isCursor(cursor) ? cursor : undefined };

      pollControl.calls.push(call);

      return pollControl.run(call);
    },
  });

  return define({
    slug: 'poll',
    label: 'Poll',
    actions: [],
    options: z.object({ prefix: z.string() }),
    client: ({ options }) => options,
    triggers: [polledTrigger],
  });
}

const lockedAuth = z.object({ token: z.string() });

const lockedHelpers = createPieceHelpers<Record<string, never>, { token: string }>();

const lockedTrigger = lockedHelpers.definePollingTrigger({
  slug: 'polled',
  type: 'polling',
  description: 'Poll with a credential.',
  input: z.object({}),
  run: ({ cursor }) => Promise.resolve({ events: [], cursor: cursor ?? { since: 0 } }),
});

/** A polling piece with `auth`, so a poll with nothing linked fails before `run`. */
export function defineLockedPollPiece(define: typeof definePiece) {
  return define({
    slug: 'locked-poll',
    label: 'Locked poll',
    actions: [],
    auth: lockedAuth,
    client: ({ auth }: { auth: unknown }) => lockedAuth.parse(auth),
    triggers: [lockedTrigger],
  });
}
