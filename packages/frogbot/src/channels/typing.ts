import type { Thread } from 'chat';

import type { Logger } from '../frogbot.js';

const REFRESH_MS = 4000;
const THINKING = 'is thinking…';
const STATUS_OUTLIVES_TURN = new Set(['slack']);
const STATUS_NEVER_EXPIRES = new Set(['linear']);

export type Typing = {
  update: (chunk: unknown) => void;
  stop: (options: { clear: boolean }) => void;
};

export function startTyping({
  thread,
  labels,
  logger,
}: {
  thread: Thread;
  labels: ReadonlyMap<string, string>;
  logger: Logger;
}): Typing {
  let status = THINKING;
  let stopped = false;
  let warned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const adapter = adapterName(thread);

  const fail = (error: unknown) => {
    if (warned) return;

    warned = true;
    logger.warn({ error }, '[frogbot] Channel typing failed; the turn continues without it.');
  };

  const send = (text: string) => {
    try {
      Promise.resolve(thread.startTyping(text)).catch(fail);
    } catch (error) {
      fail(error);
    }
  };

  const refresh = () => {
    clearTimeout(timer);
    send(status);

    if (!STATUS_NEVER_EXPIRES.has(adapter)) timer = setTimeout(refresh, REFRESH_MS);
  };

  refresh();

  return {
    update(chunk) {
      if (stopped) return;

      const next = statusFor(chunk, labels) ?? status;

      if (next === status) return;

      status = next;
      refresh();
    },
    stop({ clear }) {
      if (stopped) return;

      stopped = true;
      clearTimeout(timer);
      timer = undefined;

      if (clear && STATUS_OUTLIVES_TURN.has(adapter)) send('');
    },
  };
}

function adapterName(thread: Thread): string {
  try {
    return thread.adapter.name;
  } catch {
    return '';
  }
}

function statusFor(chunk: unknown, labels: ReadonlyMap<string, string>): string | undefined {
  if (!chunk || typeof chunk !== 'object' || !('type' in chunk)) return undefined;

  switch (chunk.type) {
    case 'tool-input-start':
    case 'tool-call': {
      if (!('toolName' in chunk) || typeof chunk.toolName !== 'string') return undefined;

      return `is using ${labels.get(chunk.toolName) ?? chunk.toolName}…`;
    }

    case 'tool-result':
    case 'tool-error':
      return THINKING;
    default:
      return undefined;
  }
}
