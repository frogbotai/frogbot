import { createHash, randomUUID } from 'node:crypto';

import type { FrogBot } from '../frogbot.js';
import { KVLockContentionError } from '../kv/errors.js';
import type { KVLockCallback } from '../kv/types.js';
import { pieceInstanceRuntime } from '../pieces/definePiece.js';
import type { PieceInstance } from '../pieces/types.js';
import { TRIGGER_SUBSCRIPTIONS_SLUG } from './collection.js';
import type { SubscriptionInput } from './input.js';
import { encodeSubscriptionInput, parseSubscriptionInput } from './input.js';
import type { TriggerSubscriber } from './types.js';

export type Subscription = {
  id: string | number;
  agent: string;
  piece: string;
  instance: string;
  trigger: string;
  input: SubscriptionInput;
  inputHash: string;
  state?: unknown;
  webhookUrl?: string;
  status: 'active' | 'error';
  cleanupPending?: boolean;
  enablePending?: boolean;
  enableAttempt?: string;
};

type SubscriptionRecovery = {
  id: Subscription['id'];
  attempt: string;
  state: unknown;
  disable?: () => Promise<void>;
  compensated: boolean;
};

export type SubscriptionEnableProps = {
  agent: string;
  instance: string;
  trigger: string;
  input?: unknown;
};

const hash = (input: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(input) ?? 'null')
    .digest('hex');

const matches = (subscription: Subscription, subscriber: TriggerSubscriber) =>
  subscription.agent === subscriber.agentSlug &&
  subscription.instance === subscriber.piece.slug &&
  subscription.trigger === subscriber.trigger.trigger.slug;

export class TriggerSubscriptions {
  private readonly recoveries = new Map<string, SubscriptionRecovery>();

  constructor(private readonly frogbot: FrogBot) {}

  async list(): Promise<Subscription[]> {
    const result = await this.frogbot.find({
      collection: TRIGGER_SUBSCRIPTIONS_SLUG,
      pagination: false,
      overrideAccess: true,
    } as never);
    return result.docs as Subscription[];
  }

  async enable(args: SubscriptionEnableProps): Promise<Subscription> {
    const { agent, instance, trigger } = args;
    return this.lock(async ({ signal }) => {
      const subscriber = this.subscribers().find(
        (candidate) =>
          candidate.agentSlug === agent &&
          candidate.piece.slug === instance &&
          candidate.trigger.trigger.slug === trigger,
      );
      if (!subscriber) {
        throw new Error(
          `[frogbot] Webhook trigger '${instance}/${trigger}' is not mounted on agent '${agent}'.`,
        );
      }
      const input = encodeSubscriptionInput(
        Object.hasOwn(args, 'input') ? args.input : subscriber.trigger.input,
      );
      const baseURL = await this.callbackBase();
      const prior = (await this.list()).find((entry) => matches(entry, subscriber));
      return this.enableSubscription({ subscriber, input, prior, baseURL, signal });
    });
  }

  async disable(id: Subscription['id']): Promise<void> {
    await this.lock(async ({ signal }) => {
      const subscription = (await this.list()).find((entry) => String(entry.id) === String(id));
      if (subscription) await this.disableSubscription({ subscription, signal });
    });
  }

  async reconcile(): Promise<void> {
    try {
      await this.lock(async ({ signal }) => {
        const declared = this.subscribers();
        const baseURL = declared.length ? await this.callbackBase() : '';
        const existing = await this.list();
        for (const subscriber of declared) {
          signal.throwIfAborted();
          try {
            await this.enableSubscription({
              subscriber,
              input: encodeSubscriptionInput(subscriber.trigger.input),
              prior: existing.find((entry) => matches(entry, subscriber)),
              baseURL,
              signal,
            });
          } catch (error) {
            signal.throwIfAborted();
            this.warn({ action: 'enable', trigger: subscriber.trigger.trigger.slug, error });
          }
        }
        for (const subscription of existing) {
          signal.throwIfAborted();
          if (declared.some((subscriber) => matches(subscription, subscriber))) continue;
          try {
            await this.disableSubscription({ subscription, signal });
          } catch (error) {
            signal.throwIfAborted();
            this.warn({ action: 'disable', trigger: subscription.trigger, error });
          }
        }
      });
    } catch (error) {
      if (!(error instanceof KVLockContentionError)) throw error;
    }
  }

  private lock<T>(fn: KVLockCallback<T>): Promise<T> {
    return this.frogbot.kv.lock('trigger:reconcile', 60_000, async ({ signal }) => {
      for (const recovery of this.recoveries.values()) {
        await this.recoverAttempt({ recovery, signal });
      }
      return fn({ signal });
    });
  }

  private subscribers(): TriggerSubscriber[] {
    return Object.values(this.frogbot.config._internal.triggers).flatMap(({ subscribers }) =>
      subscribers.filter(({ trigger }) => trigger.trigger.type === 'webhook'),
    );
  }

  private async callbackBase(): Promise<string> {
    const config = await this.frogbot.config._internal.payloadConfig;
    const serverURL = config.serverURL?.replace(/\/+$/, '');
    if (!serverURL) throw new Error('[frogbot] Trigger subscriptions require `serverURL`.');
    const api = (config.routes?.api ?? '/api').replace(/^\/+|\/+$/g, '');
    return `${serverURL}/${api ? `${api}/` : ''}webhooks`;
  }

  private lifecycle(instance: PieceInstance, slug: string) {
    const runtime = pieceInstanceRuntime(instance);
    const trigger = runtime.definition.triggers?.find((candidate) => candidate.slug === slug);
    if (
      trigger?.type !== 'webhook' ||
      typeof trigger.onEnable !== 'function' ||
      typeof trigger.onDisable !== 'function'
    ) {
      throw new Error(
        `[frogbot] Lifecycle hooks for trigger '${instance.slug}/${slug}' are unavailable; subscription retained.`,
      );
    }
    return { runtime, trigger };
  }

  private async enableSubscription({
    subscriber,
    input,
    prior,
    baseURL,
    signal,
  }: {
    subscriber: TriggerSubscriber;
    input: SubscriptionInput;
    prior?: Subscription;
    baseURL: string;
    signal: AbortSignal;
  }): Promise<Subscription> {
    signal.throwIfAborted();
    const instance = subscriber.piece;
    if (prior) this.assertResolved(prior);

    const { runtime, trigger } = this.lifecycle(instance, subscriber.trigger.trigger.slug);
    const parsedInput = parseSubscriptionInput({ schema: trigger.input, input });
    const inputHash = hash(input);
    const url = (id: Subscription['id']) =>
      `${baseURL}/${encodeURIComponent(instance.slug)}/${encodeURIComponent(String(id))}`;

    if (
      prior?.status === 'active' &&
      !prior.cleanupPending &&
      prior.piece === instance.piece &&
      prior.inputHash === inputHash &&
      prior.webhookUrl === url(prior.id)
    ) {
      return prior;
    }

    if (prior) await this.cleanup({ subscription: prior, signal });
    let subscription = await this.write({
      id: prior?.id,
      data: {
        agent: subscriber.agentSlug,
        piece: instance.piece,
        instance: instance.slug,
        trigger: trigger.slug,
        input,
        inputHash,
        state: null,
        status: 'error',
        cleanupPending: false,
        enablePending: false,
      },
      signal,
    });

    const webhookUrl = url(subscription.id);
    const req = await this.frogbot.createRequest();
    signal.throwIfAborted();
    const client = await runtime.client({ req });
    signal.throwIfAborted();

    const context = {
      input: parsedInput as never,
      client: client as never,
      options: runtime.options as never,
      req,
    };

    const attempt = randomUUID();
    subscription = await this.write({
      id: subscription.id,
      data: { webhookUrl, enableAttempt: attempt, enablePending: true },
      signal,
    });

    let state: unknown;
    try {
      state = await trigger.onEnable({ ...context, webhookUrl });
    } catch (error) {
      await this.recoverEnable({
        recovery: { id: subscription.id, attempt, state: null, compensated: true },
        signal,
      });
      throw error;
    }

    try {
      return await this.write({
        id: subscription.id,
        data: { state: state ?? null, status: 'active', enablePending: false },
        signal,
      });
    } catch (error) {
      await this.recoverEnable({
        recovery: {
          id: subscription.id,
          attempt,
          state,
          compensated: false,
          disable: () => trigger.onDisable({ ...context, state: state as never }),
        },
        signal,
      });
      throw error;
    }
  }

  private assertResolved(subscription: Subscription): void {
    if (subscription.enablePending && !subscription.cleanupPending) {
      throw new Error(
        `[frogbot] Subscription '${subscription.id}' has an unresolved enable attempt; retained without retry. Its provider outcome must be recovered or manually resolved before enabling or deleting it.`,
      );
    }
  }

  private async recoverEnable({
    recovery,
    signal,
  }: {
    recovery: SubscriptionRecovery;
    signal: AbortSignal;
  }): Promise<void> {
    this.recoveries.set(recovery.attempt, recovery);
    try {
      if (signal.aborted) await this.lock(async () => undefined);
      else await this.recoverAttempt({ recovery, signal, verifyAttempt: false });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.warn({
        action: 'recover enable for',
        trigger: String(recovery.id),
        error: this.recoveries.has(recovery.attempt)
          ? `${detail}. Recovery state remains in memory for the next lifecycle call; restarting before it is persisted may require manual provider cleanup.`
          : error,
      });
    }
  }

  private async recoverAttempt({
    recovery,
    signal,
    verifyAttempt = true,
  }: {
    recovery: SubscriptionRecovery;
    signal: AbortSignal;
    verifyAttempt?: boolean;
  }): Promise<void> {
    signal.throwIfAborted();
    if (verifyAttempt) {
      const subscription = (await this.list()).find((entry) => entry.id === recovery.id);
      signal.throwIfAborted();
      if (subscription?.enableAttempt !== recovery.attempt) {
        throw new Error(
          `[frogbot] Subscription '${recovery.id}' changed during enable recovery; the newer ledger will not be overwritten. Recovery state remains in memory and requires manual resolution.`,
        );
      }
    }

    const data = {
      status: 'error' as const,
      enablePending: false,
      state: recovery.state ?? null,
      cleanupPending: true,
    };

    if (!recovery.compensated && recovery.disable) {
      let persisted = false;
      try {
        await this.write({ id: recovery.id, data, signal });
        persisted = true;
      } catch (error) {
        signal.throwIfAborted();
        this.warn({ action: 'persist recovery state for', trigger: String(recovery.id), error });
      }

      signal.throwIfAborted();
      try {
        await recovery.disable();
        recovery.compensated = true;
      } catch (error) {
        signal.throwIfAborted();
        if (!persisted) await this.write({ id: recovery.id, data, signal });
        this.recoveries.delete(recovery.attempt);
        throw error;
      }
    }

    await this.write({
      id: recovery.id,
      data: { status: 'error', state: null, cleanupPending: false, enablePending: false },
      signal,
    });

    this.recoveries.delete(recovery.attempt);
  }

  private async cleanup({
    subscription,
    signal,
  }: {
    subscription: Subscription;
    signal: AbortSignal;
  }): Promise<void> {
    this.assertResolved(subscription);
    if (
      subscription.status === 'error' &&
      !subscription.cleanupPending &&
      subscription.state == null
    ) {
      return;
    }
    await this.write({
      id: subscription.id,
      data: { status: 'error', cleanupPending: true },
      signal,
    });
    const instances = [
      ...Object.values(this.frogbot.config._internal.triggers).map(({ instance }) => instance),
      ...(this.frogbot.config.pieces?.instances ?? []),
    ];
    const instance = instances.find(
      (candidate) =>
        candidate.slug === subscription.instance && candidate.piece === subscription.piece,
    );
    if (!instance) {
      throw new Error(
        `[frogbot] Cannot clean up trigger '${subscription.instance}/${subscription.trigger}': its configured instance is unavailable. Credentials cannot be reconstructed from the database; subscription '${subscription.id}' retained. Restore the instance to retry cleanup.`,
      );
    }
    const { runtime, trigger } = this.lifecycle(instance, subscription.trigger);
    const input = parseSubscriptionInput({ schema: trigger.input, input: subscription.input });
    const req = await this.frogbot.createRequest();
    signal.throwIfAborted();
    const client = await runtime.client({ req });
    signal.throwIfAborted();
    await trigger.onDisable({
      input: input as never,
      state: subscription.state as never,
      client: client as never,
      options: runtime.options as never,
      req,
    });
    signal.throwIfAborted();
  }

  private async disableSubscription({
    subscription,
    signal,
  }: {
    subscription: Subscription;
    signal: AbortSignal;
  }): Promise<void> {
    await this.cleanup({ subscription, signal });
    signal.throwIfAborted();
    await this.frogbot.delete({
      collection: TRIGGER_SUBSCRIPTIONS_SLUG,
      id: subscription.id,
      overrideAccess: true,
    } as never);
  }

  private async write({
    id,
    data,
    signal,
  }: {
    id?: Subscription['id'];
    data: Partial<Omit<Subscription, 'id'>>;
    signal: AbortSignal;
  }): Promise<Subscription> {
    signal.throwIfAborted();
    const args = { collection: TRIGGER_SUBSCRIPTIONS_SLUG, data, overrideAccess: true };
    const result =
      id === undefined
        ? await this.frogbot.create(args as never)
        : await this.frogbot.update({ ...args, id } as never);
    signal.throwIfAborted();
    return result as Subscription;
  }

  private warn({
    action,
    trigger,
    error,
  }: {
    action: string;
    trigger: string;
    error: unknown;
  }): void {
    this.frogbot.logger.warn(
      `[frogbot] Could not ${action} trigger '${trigger}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
