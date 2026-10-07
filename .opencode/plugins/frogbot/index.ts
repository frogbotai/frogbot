import { execFile } from 'node:child_process';
import path from 'node:path';

import {
  backgroundCall,
  badTicketTag,
  capOutput,
  contextTokens,
  createAlerts,
  createResumeCap,
  createWatchdog,
  denial,
  failureAlert,
  MESSAGES,
  notification,
  readInput,
  searchesArchive,
  shellTimeout,
  STALL_CHECK_MS,
  stashes,
  type TokenUsage,
  worktreeCount,
} from './supervision.ts';

type Content = { type: string; text?: string };

type ToolBefore = {
  tool: string;
  readonly sessionID: string;
  readonly id: string;
  input: unknown;
};

type ToolAfter = {
  readonly tool: string;
  readonly sessionID: string;
  readonly id: string;
  readonly input: unknown;
} & (
  | {
      readonly status: 'completed';
      result: { content: readonly Content[]; metadata?: Record<string, unknown> };
    }
  | { readonly status: 'error'; error: { message: string } }
);

type Evaluation = {
  readonly action: string;
  readonly source?: { readonly id: string };
  effect: 'allow' | 'ask' | 'deny';
  message?: string;
};

type ShellCreateBefore = { command: string; timeout: number };

type OpenCodeEvent = { type: string; data?: Record<string, unknown> };

type Hook<Event> = (event: Event) => Promise<void> | void;

type Context = {
  readonly location: { readonly directory: string; readonly project: { readonly id: string } };
  readonly tool: {
    hook(name: 'execute.before', callback: Hook<ToolBefore>): Promise<unknown>;
    hook(name: 'execute.after', callback: Hook<ToolAfter>): Promise<unknown>;
  };
  readonly permission: { hook(name: 'evaluate', callback: Hook<Evaluation>): Promise<unknown> };
  readonly shell: {
    hook(name: 'create.before', callback: Hook<ShellCreateBefore>): Promise<unknown>;
  };
  readonly event: {
    subscribe(options?: { signal?: AbortSignal }): AsyncIterable<OpenCodeEvent>;
  };
  readonly session: {
    get(input: { sessionID: string }): Promise<{ parentID?: string; title?: string; cost: number }>;
    context(input: {
      sessionID: string;
    }): Promise<readonly { type: string; tokens?: TokenUsage }[]>;
    synthetic(input: { sessionID: string; text: string; description?: string }): Promise<unknown>;
  };
  readonly storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: number): Promise<void>;
  };
};

const STOPPED = new Set([
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
]);

const PROGRESS = new Set([
  'session.step.started',
  'session.step.ended',
  'session.text.ended',
  'session.reasoning.ended',
]);

function log(where: string, error: unknown) {
  console.error(`[frogbot] ${where} failed:`, error);
}

function field(value: unknown, key: string) {
  if (typeof value !== 'object' || value === null) return undefined;

  const found = (value as Record<string, unknown>)[key];

  return typeof found === 'string' && found !== '' ? found : undefined;
}

function worktreesAt(cwd: string) {
  return new Promise<number>((resolve) => {
    execFile('git', ['worktree', 'list', '--porcelain'], { cwd }, (error, stdout) => {
      if (error) log('git worktree list', error);

      resolve(error ? 1 : worktreeCount(stdout));
    });
  });
}

export default {
  id: 'frogbot',

  async setup(ctx: Context) {
    const watchdog = createWatchdog();
    const parents = new Map<string, string | null>();
    const lookups = new Map<string, Promise<string | null>>();
    const background = new Set<string>();
    const controller = new AbortController();
    const alerts = createAlerts();
    const data = process.env.XDG_DATA_HOME || `${process.env.HOME}/.local/share`;

    const remember = (
      sessionID: string,
      parentID: string | undefined,
      title: string | undefined,
    ) => {
      parents.set(sessionID, parentID ?? null);
      if (parentID) watchdog.track(sessionID, parentID, title ?? sessionID);
    };

    const parentOf = (sessionID: string) => {
      if (parents.has(sessionID)) return Promise.resolve(parents.get(sessionID) ?? null);

      const pending =
        lookups.get(sessionID) ??
        ctx.session
          .get({ sessionID })
          .then((info) => {
            remember(sessionID, info.parentID, info.title);

            return info.parentID ?? null;
          })
          .catch((error: unknown) => {
            log('session.get', error);

            return null;
          })
          .finally(() => lookups.delete(sessionID));

      lookups.set(sessionID, pending);

      return pending;
    };

    const resumes = createResumeCap(ctx.storage, async (sessionID) => {
      const [info, messages] = await Promise.all([
        ctx.session.get({ sessionID }),
        ctx.session.context({ sessionID }),
      ]);

      return { title: info.title ?? sessionID, tokens: contextTokens(messages), cost: info.cost };
    });

    const before = async (event: ToolBefore) => {
      const subagent = (await parentOf(event.sessionID)) !== null;

      watchdog.activity(event.sessionID, `${event.tool} call`, Date.now());

      if (subagent && backgroundCall(event.tool, event.input)) return MESSAGES.background;

      if (event.tool === 'shell') {
        const command = field(event.input, 'command') ?? '';
        const cwd = path.resolve(ctx.location.directory, field(event.input, 'workdir') ?? '.');
        const worktrees = stashes(command) ? await worktreesAt(cwd) : 1;
        const denied = denial(command, { worktrees });

        if (denied) return MESSAGES[denied];
        if (backgroundCall(event.tool, event.input)) background.add(command);
      }

      if (subagent && searchesArchive(event.tool, event.input)) return MESSAGES.archive;

      if (event.tool === 'read') event.input = readInput(event.input);

      if (event.tool === 'subagent') {
        if (badTicketTag(event.input)) return MESSAGES.tag;
        resumes.record(event.id, event.input);
      }

      return undefined;
    };

    await ctx.tool.hook('execute.before', async (event) => {
      let denied: string | undefined;

      try {
        denied = await before(event);
      } catch (error) {
        log('execute.before', error);
      }

      if (denied) throw new Error(denied);
    });

    await ctx.tool.hook('execute.after', async (event) => {
      try {
        watchdog.activity(event.sessionID, `${event.tool} result`, Date.now());

        if (event.tool === 'subagent') await resumes.settle(event.id, event);

        if (event.tool === 'shell') {
          background.delete(field(event.input, 'command') ?? '');

          if (event.status !== 'completed') return;

          const shellID = field(event.result.metadata, 'shellID');
          const file =
            shellID && `${data}/opencode/shell/${ctx.location.project.id}/${shellID}.out`;

          event.result = {
            ...event.result,
            content: event.result.content.map((item) =>
              item.type === 'text' && item.text
                ? { ...item, text: capOutput(item.text, file) }
                : item,
            ),
          };
        }
      } catch (error) {
        log('execute.after', error);
      }
    });

    await ctx.permission.hook('evaluate', async (event) => {
      try {
        if (event.action !== 'subagent' || event.effect === 'deny' || !event.source) return;

        const decision = await resumes.evaluate(event.source.id);

        if (decision) {
          event.effect = decision.effect;
          event.message = decision.message;
        }
      } catch (error) {
        log('permission.evaluate', error);
      }
    });

    await ctx.shell.hook('create.before', (event) => {
      try {
        event.timeout = shellTimeout({
          command: event.command,
          timeout: event.timeout,
          background: background.has(event.command),
        });
      } catch (error) {
        log('shell.create.before', error);
      }
    });

    const alert = async (sessionID: string, error: unknown) => {
      const info = await ctx.session.get({ sessionID });
      const found = failureAlert({
        title: info.title ?? sessionID,
        root: !info.parentID,
        error,
      });

      if (!found || !alerts(found, Date.now())) return;

      console.error(`[frogbot] ${found.title}: ${found.message}`);

      if (process.platform !== 'darwin') return;

      const [command, args] = notification(found);

      execFile(command, args, (failure) => {
        if (failure) log('notification', failure);
      });
    };

    const onEvent = async (event: OpenCodeEvent) => {
      const sessionID = field(event.data, 'sessionID');
      if (!sessionID) return;

      if (event.type === 'session.created') {
        remember(sessionID, field(event.data, 'parentID'), field(event.data, 'title'));
      } else if (event.type === 'session.execution.started') {
        await parentOf(sessionID);
        watchdog.start(sessionID, Date.now());
      } else if (STOPPED.has(event.type)) {
        watchdog.stop(sessionID);
        if (event.type === 'session.execution.failed') await alert(sessionID, event.data?.error);
      } else if (event.type === 'session.deleted') {
        watchdog.forget(sessionID);
        parents.delete(sessionID);
      } else if (PROGRESS.has(event.type)) {
        watchdog.activity(sessionID, 'message', Date.now());
      }
    };

    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          await onEvent(event).catch((error: unknown) => log(`event ${event.type}`, error));
        }
      } catch (error) {
        if (!controller.signal.aborted) log('event.subscribe', error);
      }
    })();

    const timer = setInterval(() => {
      for (const notice of watchdog.due(Date.now())) {
        ctx.session
          .synthetic({
            sessionID: notice.parentID,
            text: notice.text,
            description: 'FrogBot stall watchdog',
          })
          .catch((error: unknown) => log('stall notice', error));
      }
    }, STALL_CHECK_MS);

    return () => {
      clearInterval(timer);
      controller.abort();
    };
  },
};
