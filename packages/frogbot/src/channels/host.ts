import { generateId } from 'ai';
import type {
  Adapter,
  Message as ChatMessage,
  SerializedMessage,
  SerializedThread,
  Thread,
} from 'chat';
import { Message, ThreadImpl } from 'chat';

import { AgentServiceError, assertAgentAccess } from '../agents/service.js';
import type { AgentInstance } from '../agents/types.js';
import { createChannelChatAccess } from '../chat/channelAccess.js';
import type { FrogBot } from '../frogbot.js';
import { pieceInstanceRuntime } from '../pieces/definePiece.js';
import type { PieceInstance } from '../pieces/types.js';
import { requiresAdapterVerification } from '../triggers/registry.js';
import { ChannelChat } from './chat.js';
import { channelConversationKey, resolveChannelChat } from './conversation.js';
import { runChannelLock } from './lock.js';
import { createChannelStateAdapter } from './state.js';
import type { ChannelConversationIdentity } from './types.js';

const GATEWAY_LEASE_KEY = 'channels:gateway:listener';
const GATEWAY_LEASE_TTL = 30_000;
const GATEWAY_RETRY_DELAY = 5_000;
const GATEWAY_CYCLE_DURATION = 10 * 60_000;

type GatewayAdapter = Adapter & {
  startGatewayListener(
    options: { waitUntil(task: Promise<unknown>): void },
    durationMs?: number,
    signal?: AbortSignal,
    webhookUrl?: string,
  ): Promise<void>;
};

type ChannelGatewayListenerOptions = {
  durationMs: number;
  signal?: AbortSignal;
};

export type ChannelTaskInput = {
  agentSlug: string;
  instanceSlug: string;
  message: SerializedMessage;
  thread: SerializedThread;
};

type ChannelBinding = {
  adapter: Adapter;
  chat: ChannelChat;
  instance: PieceInstance;
} & ({ kind: 'conversation'; agent: AgentInstance } | { kind: 'ingress' });

type ChannelConversationBinding = Extract<ChannelBinding, { kind: 'conversation' }>;

const hosts = new WeakMap<FrogBot, ChannelHost>();

export class ChannelHost {
  private readonly bindings = new Map<string, ChannelBinding>();
  private readonly gatewayController = new AbortController();
  private readonly gatewayRuns = new Set<Promise<boolean>>();
  private gatewayLoop?: Promise<void>;

  constructor(private readonly frogbot: FrogBot) {}

  async initialize(startGateway = true): Promise<void> {
    try {
      for (const agent of Object.values(this.frogbot.agents)) {
        for (const instance of agent.config.channels ?? []) {
          await this.initializeBinding({ instance, agent });
        }
      }

      for (const entry of Object.values(this.frogbot.config._internal.triggers)) {
        if (this.bindings.has(entry.instance.slug) || !requiresAdapterVerification(entry)) continue;

        await this.initializeBinding({ instance: entry.instance });
      }
    } catch (error) {
      await Promise.allSettled([...this.bindings.values()].map(({ chat }) => chat.shutdown()));
      this.bindings.clear();

      throw error;
    }

    if (startGateway && this.hasGatewayAdapters()) {
      this.gatewayLoop = this.runGatewayLoop(this.gatewayController.signal);
    }
  }

  private async initializeBinding({
    instance,
    agent,
  }: {
    instance: PieceInstance;
    agent?: AgentInstance;
  }): Promise<void> {
    const runtime = pieceInstanceRuntime(instance);

    if (runtime.definition.auth && runtime.auth === undefined) {
      throw new Error(`[frogbot] Channel adapter '${instance.slug}' requires factory credentials.`);
    }

    const adapter = runtime.definition.channel!.adapter({
      auth: runtime.auth as never,
      options: runtime.options as never,
    });

    const chat = new ChannelChat({
      userName: agent?.slug ?? instance.slug,
      adapters: { [adapter.name]: adapter },
      state: createChannelStateAdapter({
        kv: this.frogbot.kv,
        namespace: `${agent?.slug ?? 'ingress'}:${instance.slug}`,
      }),
      concurrency: 'concurrent',
    });

    const binding: ChannelBinding = agent
      ? { kind: 'conversation', adapter, agent, chat, instance }
      : { kind: 'ingress', adapter, chat, instance };

    this.bindings.set(instance.slug, binding);

    if (binding.kind === 'conversation') {
      const enqueue = (thread: Thread, message: ChatMessage) =>
        this.enqueue(binding, thread, message);

      chat.onNewMention(enqueue);
      chat.onDirectMessage((thread, message) => enqueue(thread, message));
      chat.onSubscribedMessage(enqueue);

      if (adapter.name === 'telegram') {
        chat.onSlashCommand(async (event) => {
          const message = adapter.parseMessage(event.raw);

          await chat.processMessage(adapter, message.threadId, message);
        });
      }
    }

    await chat.initialize();
  }

  async shutdown(): Promise<void> {
    this.gatewayController.abort();
    await this.gatewayLoop;
    await Promise.allSettled(this.gatewayRuns);

    await Promise.all([...this.bindings.values()].map(({ chat }) => chat.shutdown()));
    this.bindings.clear();
  }

  hasGatewayAdapters(): boolean {
    return [...this.bindings.values()].some(({ adapter }) => this.isGatewayAdapter(adapter));
  }

  async runGatewayListener(options: ChannelGatewayListenerOptions): Promise<boolean> {
    const run = this.listenGateway(options);

    this.gatewayRuns.add(run);

    try {
      return await run;
    } finally {
      this.gatewayRuns.delete(run);
    }
  }

  private async listenGateway({
    durationMs,
    signal,
  }: ChannelGatewayListenerOptions): Promise<boolean> {
    if (!this.hasGatewayAdapters()) return false;

    const controller = new AbortController();
    let work: Promise<void> | undefined;

    try {
      await this.frogbot.kv.lock(
        GATEWAY_LEASE_KEY,
        GATEWAY_LEASE_TTL,
        ({ signal: leaseSignal }) => {
          const timeoutSignal = AbortSignal.timeout(durationMs);
          const listenerSignal = AbortSignal.any([
            controller.signal,
            this.gatewayController.signal,
            leaseSignal,
            timeoutSignal,
            ...(signal ? [signal] : []),
          ]);

          work = (async () => {
            listenerSignal.throwIfAborted();

            const pending: Promise<unknown>[] = [];
            const pendingErrors: unknown[] = [];
            const waitUntil = (task: Promise<unknown>) => {
              pending.push(
                task.catch((error: unknown) => {
                  pendingErrors.push(error);
                }),
              );
            };
            const listeners = [...this.bindings.values()]
              .filter((binding): binding is ChannelBinding & { adapter: GatewayAdapter } =>
                this.isGatewayAdapter(binding.adapter),
              )
              .map(async ({ adapter, instance }) =>
                adapter.startGatewayListener(
                  { waitUntil },
                  durationMs,
                  listenerSignal,
                  `${this.frogbot.getAPIURL()}/webhooks/${instance.slug}`,
                ),
              );

            try {
              await Promise.all(listeners);
            } catch (error) {
              controller.abort(error);

              throw error;
            } finally {
              await Promise.allSettled(listeners);

              while (pending.length) {
                await Promise.all(pending.splice(0));
              }
            }

            if (pendingErrors.length) {
              throw new AggregateError(pendingErrors, 'Channel gateway background work failed.');
            }
          })();

          return work;
        },
      );

      return true;
    } catch (error) {
      if (!work && error instanceof Error && error.name === 'KVLockContentionError') return false;

      const aborted = signal?.aborted || this.gatewayController.signal.aborted;
      const abortError =
        (signal?.aborted && error === signal.reason) ||
        (this.gatewayController.signal.aborted && error === this.gatewayController.signal.reason) ||
        (error instanceof Error && error.name === 'AbortError');

      if (aborted && abortError) return true;

      throw error;
    } finally {
      controller.abort();

      if (work) {
        await Promise.allSettled([work]);
      }
    }
  }

  async webhook(instanceSlug: string, request: Request): Promise<Response | undefined> {
    const binding = this.bindings.get(instanceSlug);

    if (!binding) return undefined;

    const webhook = binding.chat.webhooks[binding.adapter.name];

    const pending: Promise<unknown>[] = [];
    const errors: unknown[] = [];
    const waitUntil = (task: Promise<unknown>) => {
      pending.push(
        task.catch((error: unknown) => {
          errors.push(error);
        }),
      );
    };

    let response: Response;

    try {
      response = await webhook(request, { waitUntil });
    } finally {
      while (pending.length) {
        await Promise.all(pending.splice(0));
      }
    }

    if (errors.length) {
      throw new AggregateError(errors, '[frogbot] Channel webhook processing failed.');
    }

    return response;
  }

  async run(input: ChannelTaskInput, signal?: AbortSignal): Promise<void> {
    const binding = this.bindings.get(input.instanceSlug);

    if (!binding || binding.kind !== 'conversation' || binding.agent.slug !== input.agentSlug) {
      throw new Error(
        `[frogbot] Channel binding '${input.agentSlug}:${input.instanceSlug}' is unavailable.`,
      );
    }

    if (input.thread.adapterName !== binding.adapter.name) {
      throw new Error('[frogbot] Channel task adapter does not match its binding.');
    }

    const message = Message.fromJSON(input.message);
    const thread = new ThreadImpl({
      id: input.thread.id,
      channelId: input.thread.channelId,
      channelVisibility: input.thread.channelVisibility,
      isDM: input.thread.isDM,
      currentMessage: input.thread.currentMessage
        ? Message.fromJSON(input.thread.currentMessage)
        : message,
      adapter: binding.adapter,
      stateAdapter: binding.chat.getState(),
      signal,
    });

    await this.respond(binding, thread, message);
  }

  private async enqueue(
    binding: ChannelConversationBinding,
    thread: Thread,
    message: ChatMessage,
  ): Promise<void> {
    await this.frogbot.queue({
      task: CHANNEL_TASK_SLUG,
      queue: `frogbot-channel:${binding.agent.slug}:${binding.instance.slug}`,
      input: {
        agentSlug: binding.agent.slug,
        instanceSlug: binding.instance.slug,
        message: message.toJSON(),
        thread: thread.toJSON(),
      },
    });
  }

  private async respond(
    binding: ChannelConversationBinding,
    thread: Thread,
    message: ChatMessage,
  ): Promise<void> {
    const runtime = pieceInstanceRuntime(binding.instance);
    const author = message.author;
    const baseReq = await this.frogbot.createRequest({
      context: {
        channel: {
          piece: binding.instance.piece,
          threadId: thread.id,
          author: {
            id: author.userId,
            ...(author.userName ? { username: author.userName } : {}),
            ...(author.fullName ? { name: author.fullName } : {}),
          },
        },
      },
    });
    const user = await runtime.definition.channel!.identity({
      author,
      client: (await runtime.client({ req: baseReq })) as never,
      req: baseReq,
    });
    const req = Object.assign(baseReq, { user });

    try {
      await assertAgentAccess({ req, agent: binding.agent });
    } catch (error) {
      if (error instanceof AgentServiceError && error.status === 403) {
        this.frogbot.logger.info(
          { agent: binding.agent.slug, piece: binding.instance.slug, author: author.userId },
          '[frogbot] Channel message denied by agent access.',
        );

        return;
      }

      throw error;
    }

    const identity: ChannelConversationIdentity = {
      agent: binding.agent.slug,
      piece: binding.instance.piece,
      account: binding.instance.slug,
      kind: thread.isDM ? 'direct' : 'thread',
      peer: thread.channelId,
      thread: thread.id,
    };

    const chatId = await resolveChannelChat({
      req,
      user: user?.id ?? null,
      identity,
    });

    await runChannelLock({
      kv: this.frogbot.kv,
      key: `chat:${chatId}`,
      signal: thread.signal,
      run: async ({ signal }) => {
        const controller = new AbortController();
        const channelAccess = createChannelChatAccess({
          req,
          agentSlug: binding.agent.slug,
          chatId,
          channelKey: channelConversationKey(identity),
        });

        await thread.subscribe();

        const result = await binding.agent.streamMessage({
          chatId,
          channelAccess,
          messages: [
            {
              id: message.id || generateId(),
              role: 'user',
              parts: [{ type: 'text', text: message.text }],
            },
          ],
          req,
          overrideAccess: true,
          abortSignal: AbortSignal.any([signal, controller.signal]),
        });

        try {
          await thread.post(result.stream);
        } catch (error) {
          controller.abort(error);

          throw error;
        } finally {
          await result.persistence;
        }
      },
    });
  }

  private isGatewayAdapter(adapter: Adapter): adapter is GatewayAdapter {
    return 'startGatewayListener' in adapter && typeof adapter.startGatewayListener === 'function';
  }

  private async runGatewayLoop(signal: AbortSignal): Promise<void> {
    if (!this.hasGatewayAdapters()) return;

    while (!signal.aborted) {
      try {
        const ran = await this.runGatewayListener({
          durationMs: GATEWAY_CYCLE_DURATION,
          signal,
        });

        if (!ran && !signal.aborted) {
          await this.waitForRetry(signal);
        }
      } catch (error) {
        this.frogbot.logger.error(
          { error },
          '[frogbot] Channel gateway listener failed; retrying.',
        );

        if (!signal.aborted) await this.waitForRetry(signal);
      }
    }
  }

  private waitForRetry(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, GATEWAY_RETRY_DELAY);

      signal.addEventListener('abort', done, { once: true });

      if (signal.aborted) done();
    });
  }
}

export const CHANNEL_TASK_SLUG = 'frogbot-run-channel-message';

export async function initializeChannelHost(frogbot: FrogBot, startGateway = true): Promise<void> {
  const host = new ChannelHost(frogbot);

  await host.initialize(startGateway);
  hosts.set(frogbot, host);
}

export async function shutdownChannelHost(frogbot: FrogBot): Promise<void> {
  const host = hosts.get(frogbot);

  if (!host) return;

  hosts.delete(frogbot);
  await host.shutdown();
}

export function getChannelHost(frogbot: FrogBot): ChannelHost | undefined {
  return hosts.get(frogbot);
}
