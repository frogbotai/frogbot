import { generateId } from 'ai';
import type { Adapter, Message as ChatMessage, Thread } from 'chat';
import { Message } from 'chat';

import { canUseAgent } from '../agents/service.js';
import type { AgentInstance } from '../agents/types.js';
import type { ChatDocument } from '../chat/findChat.js';
import type { TurnRunnerArgs } from '../chat/turn/queue.js';
import { registerTurnRunner, runQueuedTurn } from '../chat/turn/queue.js';
import { streamTurn } from '../chat/turn/streamTurn.js';
import type { DocID } from '../collections/config/types.js';
import type { FrogBot } from '../frogbot.js';
import { pieceInstanceRuntime } from '../pieces/definePiece.js';
import type { PieceInstance } from '../pieces/types.js';
import { requiresAdapterVerification } from '../triggers/registry.js';
import { ChannelChat } from './chat.js';
import {
  channelThreadIdentity,
  createChannelThreadAccess,
  findChannelChat,
  resolveChannelChat,
} from './conversation.js';
import { createChannelRequest } from './createChannelRequest.js';
import { deserializeThread, serializeThread } from './deserializeThread.js';
import { postTurn } from './postTurn.js';
import { continueAfterQuestions } from './questions/continueAfterQuestions.js';
import { createQuestionsBinding } from './questions/createQuestionsBinding.js';
import { getQuestionClientTools } from './questions/getQuestionClientTools.js';
import { renderPendingQuestions } from './questions/renderPendingQuestions.js';
import { routeQuestionAction } from './questions/routeQuestionAction.js';
import { routeQuestionModalSubmit } from './questions/routeQuestionModalSubmit.js';
import { routeQuestionReply } from './questions/routeQuestionReply.js';
import { runQuestionUpdate } from './questions/runQuestionUpdate.js';
import { queueChannelTask } from './queueChannelTask.js';
import { createChannelStateAdapter } from './state.js';
import type {
  ChannelBinding,
  ChannelConversationBinding,
  ChannelTaskInput,
  ChannelThreadReference,
} from './types.js';

export { CHANNEL_QUESTION_UPDATE_TASK_SLUG, CHANNEL_TASK_SLUG } from './queueChannelTask.js';

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

const hosts = new WeakMap<FrogBot, ChannelHost>();

export class ChannelHost {
  private readonly bindings = new Map<string, ChannelBinding>();
  private readonly gatewayController = new AbortController();
  private readonly gatewayRuns = new Set<Promise<boolean>>();
  private gatewayLoop?: Promise<void>;
  private unregisterRunner?: () => void;

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

    this.unregisterRunner = registerTurnRunner(this.frogbot, {
      schedule: (args) => this.scheduleQueued(args),
      run: (args) => this.runQueued(args),
    });

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
      auth: runtime.auth,
      options: runtime.options as never,
    });

    const namespace = `${agent?.slug ?? 'ingress'}:${instance.slug}`;

    const chat = new ChannelChat({
      userName: agent?.slug ?? instance.slug,
      adapters: { [adapter.name]: adapter },
      state: createChannelStateAdapter({ kv: this.frogbot.kv, namespace }),
      concurrency: 'concurrent',
    });

    const questions = createQuestionsBinding({
      adapter,
      agent,
      hooks: runtime.definition.channel!.questions,
      kv: this.frogbot.kv,
      namespace,
    });

    const binding: ChannelBinding = agent
      ? { kind: 'conversation', adapter, agent, chat, instance, questions }
      : { kind: 'ingress', adapter, chat, instance };

    this.bindings.set(instance.slug, binding);

    if (binding.kind === 'conversation') {
      const enqueue = (thread: Thread, message: ChatMessage) =>
        this.enqueue(binding, thread, message);

      chat.onNewMention(enqueue);
      chat.onDirectMessage((thread, message) => enqueue(thread, message));
      chat.onSubscribedMessage(enqueue);

      if (binding.questions) {
        chat.onAction((event) => routeQuestionAction({ binding, event, frogbot: this.frogbot }));
        chat.onModalSubmit(async (event) => {
          await routeQuestionModalSubmit({ binding, event, frogbot: this.frogbot });
        });
      }

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
    this.unregisterRunner?.();
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

    if (input.kind === 'promote') {
      await runQueuedTurn({ frogbot: this.frogbot, chatId: input.chatId });

      return;
    }

    if (input.kind === 'continue') {
      await continueAfterQuestions({ binding, frogbot: this.frogbot, input, signal });

      return;
    }

    if (input.kind === 'update') {
      await runQuestionUpdate({ binding, frogbot: this.frogbot, input, signal });

      return;
    }

    const message = Message.fromJSON(input.message);
    const thread = deserializeThread({
      binding,
      thread: input.thread,
      currentMessage: message,
      signal,
    });

    await this.respond(binding, thread, message);
  }

  private async enqueue(
    binding: ChannelConversationBinding,
    thread: Thread,
    message: ChatMessage,
  ): Promise<void> {
    await queueChannelTask({
      binding,
      frogbot: this.frogbot,
      input: {
        kind: 'message',
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
    const author = message.author;
    const channel = await createChannelRequest({
      author,
      binding,
      frogbot: this.frogbot,
      thread,
    });
    const { req } = channel;
    const identity = channelThreadIdentity({ binding, thread });

    const access = await canUseAgent({ req, agent: binding.agent });

    if (!access.allowed) {
      this.frogbot.logger.info(
        { agent: binding.agent.slug, piece: binding.instance.slug, author: author.userId },
        access.denied === 'access'
          ? '[frogbot] Channel message denied by agent access.'
          : '[frogbot] Channel message denied by model access.',
      );

      const existing = binding.questions ? await findChannelChat({ req, identity }) : undefined;

      if (existing) {
        await routeQuestionReply({
          binding,
          chatId: existing.id,
          frogbot: this.frogbot,
          message,
          request: { ...channel, allowed: false },
        });
      }

      return;
    }

    const chatId = await resolveChannelChat({
      req,
      user: req.user?.id ?? null,
      identity,
      thread: threadReference(binding, thread),
    });

    const reply = await routeQuestionReply({
      binding,
      chatId,
      frogbot: this.frogbot,
      message,
      request: { ...channel, allowed: true },
    });

    if (reply.status !== 'ignored') return;

    await thread.subscribe();

    const controller = new AbortController();

    const result = await binding.agent.streamMessage({
      chatId,
      channelAccess: createChannelThreadAccess({ binding, chatId, req, thread }),
      clientTools: getQuestionClientTools({ binding, frogbot: this.frogbot, thread }),
      messages: [
        {
          id: message.id || generateId(),
          role: 'user',
          parts: [{ type: 'text', text: message.text }],
        },
      ],
      req,
      overrideAccess: true,
      abortSignal: AbortSignal.any([thread.signal, controller.signal]),
    });

    if (!('status' in result)) await postTurn({ thread, result, controller });

    await renderPendingQuestions({ binding, chatId, frogbot: this.frogbot, thread });
  }

  private async scheduleQueued({ chatId }: { chatId: DocID }): Promise<boolean> {
    const config = this.frogbot.config.chat;

    if (!config.enabled) return false;

    const chat = (await this.frogbot.findByID({
      collection: config.chatsSlug,
      id: chatId,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
    })) as ChatDocument | null;

    const reference = chat?.channelThread;
    const binding = reference ? this.bindings.get(reference.account) : undefined;

    if (!reference || binding?.kind !== 'conversation' || binding.agent.slug !== chat?.agent) {
      return false;
    }

    await queueChannelTask({
      binding,
      frogbot: this.frogbot,
      input: {
        kind: 'promote',
        agentSlug: binding.agent.slug,
        instanceSlug: binding.instance.slug,
        chatId,
        thread: reference.thread,
      },
    });

    return true;
  }

  private async runQueued({ req, agent, chat, claim, uiMessages, selection }: TurnRunnerArgs) {
    const reference = chat.channelThread;
    const binding = reference ? this.bindings.get(reference.account) : undefined;

    if (!reference || binding?.kind !== 'conversation' || binding.agent.slug !== agent.slug) {
      return false;
    }

    const thread = deserializeThread({ binding, thread: reference.thread });

    const controller = new AbortController();

    const turn = await streamTurn({
      req,
      agent,
      claim,
      uiMessages,
      selection,
      clientTools: getQuestionClientTools({ binding, frogbot: this.frogbot, thread }),
      abortSignal: AbortSignal.any([thread.signal, controller.signal]),
      onError: (error) => {
        throw error;
      },
    });

    await postTurn({
      thread,
      result: { stream: turn.result.stream, persistence: turn.persistence },
      controller,
    });

    await renderPendingQuestions({ binding, chatId: chat.id, frogbot: this.frogbot, thread });

    return true;
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

function threadReference(binding: ChannelBinding, thread: Thread): ChannelThreadReference {
  return { account: binding.instance.slug, thread: serializeThread(thread) };
}

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
