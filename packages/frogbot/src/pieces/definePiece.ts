import { createDefaultRequest } from '../getFrogbot.js';
import type { AnyTool } from '../tools/types.js';
import type { FrogbotRequest } from '../types/request.js';
import {
  type OAuthApp,
  type PieceAction,
  type PieceActionDefinition,
  pieceCapabilities,
  type PieceDefinition,
  type PieceFactory,
  type PieceInstance,
} from './types.js';

const actionMetadata = Symbol('pieceAction');
const instanceMetadata = Symbol('pieceInstance');
const definitions = new WeakMap<object, PieceDefinition>();
const triggerInstances = new WeakMap<object, PieceInstance>();
const toolInstances = new WeakMap<object, PieceInstance>();
const reserved = new Set([
  'admin',
  'auth',
  'channel',
  'client',
  'email',
  'label',
  'oauth',
  'piece',
  'slug',
  'triggers',
  'webhook',
]);
const methodSlug = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

type ActionMetadata = {
  definition: PieceActionDefinition;
  tool: AnyTool;
};
type InstanceMetadata = {
  actions: AnyTool[];
  definition: PieceDefinition;
  options: unknown;
  auth: unknown;
};

export function isPieceAction(value: unknown): value is PieceAction {
  return typeof value === 'function' && actionMetadata in value;
}

export function isPieceInstance(value: unknown): value is PieceInstance {
  return Boolean(value && typeof value === 'object' && instanceMetadata in value);
}

export function pieceActionTool(value: unknown): AnyTool | undefined {
  if (!isPieceAction(value)) return undefined;
  const metadata: ActionMetadata = Reflect.get(value, actionMetadata);
  return metadata.tool;
}

export function pieceActionDefinition(value: unknown): ActionMetadata['definition'] | undefined {
  if (!isPieceAction(value)) return undefined;
  const metadata: ActionMetadata = Reflect.get(value, actionMetadata);
  return metadata.definition;
}

export function pieceInstanceTools(value: unknown): AnyTool[] | undefined {
  if (!isPieceInstance(value)) return undefined;
  const metadata: InstanceMetadata = Reflect.get(value, instanceMetadata);
  return [...metadata.actions];
}

export function pieceFactoryDefinition(factory: object): PieceDefinition {
  const definition = definitions.get(factory);
  if (!definition) throw new Error('[frogbot] Expected a factory returned by definePiece.');
  return definition;
}

export function pieceInstanceDefinition(instance: PieceInstance): PieceDefinition {
  return pieceInstanceRuntime(instance).definition;
}

export function pieceTriggerInstance(reference: unknown): PieceInstance | undefined {
  if (!reference || typeof reference !== 'object') return undefined;
  return triggerInstances.get(reference);
}

export function pieceToolInstance(tool: AnyTool): PieceInstance | undefined {
  return toolInstances.get(tool.execute);
}

export function pieceInstanceRuntime(instance: PieceInstance): {
  client: PieceInstance['client'];
  definition: PieceDefinition;
  options: unknown;
  auth: unknown;
} {
  if (!isPieceInstance(instance)) {
    throw new Error('[frogbot] Expected a piece instance returned by definePiece.');
  }
  const metadata: InstanceMetadata = Reflect.get(instance, instanceMetadata);
  return {
    client: instance.client,
    definition: metadata.definition,
    options: metadata.options,
    auth: metadata.auth,
  };
}

export function definePiece<const T extends PieceDefinition>(definition: T): PieceFactory<T> {
  if (
    !definition.slug.trim() ||
    definition.slug !== definition.slug.trim() ||
    encodeURIComponent(definition.slug) !== definition.slug
  ) {
    throw new Error(`[frogbot] Piece slug '${definition.slug}' is not URL-safe.`);
  }

  const actionSlugs = new Set<string>();
  for (const action of definition.actions) {
    if (!methodSlug.test(action.slug)) {
      throw new Error(
        `[frogbot] Piece '${definition.slug}' action slug '${action.slug}' is not a valid method name.`,
      );
    }
    if (reserved.has(action.slug)) {
      throw new Error(
        `[frogbot] Piece '${definition.slug}' action slug '${action.slug}' is reserved.`,
      );
    }
    if (actionSlugs.has(action.slug)) {
      throw new Error(
        `[frogbot] Piece '${definition.slug}' declares duplicate action '${action.slug}'.`,
      );
    }
    actionSlugs.add(action.slug);
  }

  const triggerSlugs = new Set<string>();
  for (const trigger of definition.triggers ?? []) {
    if (!methodSlug.test(trigger.slug)) {
      throw new Error(
        `[frogbot] Piece '${definition.slug}' trigger slug '${trigger.slug}' is not a valid method name.`,
      );
    }
    if (reserved.has(trigger.slug) || actionSlugs.has(trigger.slug)) {
      throw new Error(
        `[frogbot] Piece '${definition.slug}' trigger slug '${trigger.slug}' is reserved.`,
      );
    }
    if (triggerSlugs.has(trigger.slug)) {
      throw new Error(
        `[frogbot] Piece '${definition.slug}' declares duplicate trigger '${trigger.slug}'.`,
      );
    }
    triggerSlugs.add(trigger.slug);
    if (trigger.type === 'app' && !trigger.event) {
      throw new Error(
        `[frogbot] Piece '${definition.slug}' app trigger '${trigger.slug}' requires an event.`,
      );
    }
    if (trigger.type === 'webhook' && (!trigger.onEnable || !trigger.onDisable)) {
      throw new Error(
        `[frogbot] Piece '${definition.slug}' webhook trigger '${trigger.slug}' requires onEnable and onDisable.`,
      );
    }
  }

  if (definition.auth && !definition.client) {
    throw new Error(`[frogbot] Piece '${definition.slug}' declares auth but no client.`);
  }
  if (definition.oauth) {
    if (!definition.auth) {
      throw new Error(`[frogbot] Piece '${definition.slug}' declares OAuth but no auth schema.`);
    }
    for (const [field, value] of [
      ['authorizationUrl', definition.oauth.authorizationUrl],
      ['tokenUrl', definition.oauth.tokenUrl],
    ] as const) {
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
      } catch {
        throw new Error(`[frogbot] Piece '${definition.slug}' OAuth ${field} must be an HTTP URL.`);
      }
    }
    if (
      !Array.isArray(definition.oauth.scopes) ||
      definition.oauth.scopes.some((scope) => typeof scope !== 'string' || !scope.trim())
    ) {
      throw new Error(
        `[frogbot] Piece '${definition.slug}' OAuth scopes must be non-empty strings.`,
      );
    }
    if (
      definition.oauth.params &&
      Object.values(definition.oauth.params).some((value) => typeof value !== 'string')
    ) {
      throw new Error(`[frogbot] Piece '${definition.slug}' OAuth params must contain strings.`);
    }
  }

  const factory = (config: Record<string, unknown> = {}) => {
    if (config.oauth && !definition.oauth) {
      throw new Error(`[frogbot] Piece '${definition.slug}' does not declare OAuth.`);
    }

    const { slug = definition.slug, auth: configuredAuth, oauth, ...rawOptions } = config;
    if (
      typeof slug !== 'string' ||
      !slug.trim() ||
      slug !== slug.trim() ||
      encodeURIComponent(slug) !== slug
    ) {
      throw new Error(`[frogbot] Piece instance slug '${String(slug)}' is not URL-safe.`);
    }

    if (
      oauth &&
      (typeof oauth !== 'object' ||
        typeof (oauth as OAuthApp).clientId !== 'string' ||
        !(oauth as OAuthApp).clientId.trim() ||
        typeof (oauth as OAuthApp).clientSecret !== 'string' ||
        !(oauth as OAuthApp).clientSecret.trim() ||
        ((oauth as OAuthApp).scopes !== undefined &&
          (!Array.isArray((oauth as OAuthApp).scopes) ||
            (oauth as OAuthApp).scopes?.some(
              (scope) => typeof scope !== 'string' || !scope.trim(),
            ))))
    ) {
      throw new Error(
        `[frogbot] Piece '${definition.slug}' OAuth app requires clientId and clientSecret.`,
      );
    }
    const auth =
      definition.auth && configuredAuth !== undefined
        ? definition.auth.parse(configuredAuth)
        : undefined;
    const options = definition.options ? definition.options.parse(rawOptions) : {};
    const clients = new WeakMap<object, WeakMap<object, Promise<unknown>>>();
    const factoryKey = {};

    const request = (req?: FrogbotRequest) => (req ? Promise.resolve(req) : createDefaultRequest());
    const client = async ({ req }: { req?: FrogbotRequest } = {}) => {
      const resolvedReq = await request(req);
      const credential = definition.auth
        ? await resolvedReq.frogbot.connections.resolvePieceCredential({
            piece: instance as PieceInstance,
            req: resolvedReq,
          })
        : { auth: undefined, key: factoryKey };

      if (!definition.client) return undefined;
      const runtime = resolvedReq.frogbot as object;
      let runtimeClients = clients.get(runtime);
      if (!runtimeClients) {
        runtimeClients = new WeakMap();
        clients.set(runtime, runtimeClients);
      }

      let pending = runtimeClients.get(credential.key);
      if (!pending) {
        pending = Promise.resolve(
          definition.auth
            ? definition.client({ auth: credential.auth, options })
            : definition.client({ auth: undefined, options }),
        );
        runtimeClients.set(credential.key, pending);
        void pending.catch(() => runtimeClients?.delete(credential.key));
      }

      return pending;
    };

    const triggers = Object.freeze(
      Object.fromEntries(
        (definition.triggers ?? []).map((trigger) => [trigger.slug, Object.freeze({ ...trigger })]),
      ),
    );
    const instance: Record<string | symbol, unknown> = {
      slug,
      piece: definition.slug,
      ...(oauth ? { oauth } : {}),
      triggers,
      client,
    };

    const tools: AnyTool[] = [];
    for (const action of definition.actions) {
      const invoke = async ({ input, req }: { input: unknown; req?: FrogbotRequest }) => {
        const resolvedReq = await request(req);
        const parsedInput = action.input.parse(input);
        const result = await action.run({
          input: parsedInput,
          client: await client({ req: resolvedReq }),
          options,
          req: resolvedReq,
        });
        return action.output ? action.output.parse(result) : result;
      };
      const tool: AnyTool = {
        slug: `${slug}_${action.slug}`,
        description: action.description,
        inputSchema: action.input,
        execute: (input, context) => invoke({ input, req: context.req }),
      };

      Object.defineProperty(invoke, actionMetadata, { value: { definition: action, tool } });
      Object.defineProperty(instance, action.slug, { value: invoke, enumerable: true });
      tools.push(tool);
      toolInstances.set(tool.execute, instance as PieceInstance);
    }

    Object.defineProperty(instance, instanceMetadata, {
      value: { actions: tools, definition, options, auth },
    });
    Object.defineProperty(instance, pieceCapabilities, {
      value: {
        webhook: definition.webhook,
        email: definition.email,
        channel: definition.channel,
        oauth: definition.oauth,
        factoryOAuth: Boolean(oauth),
        signIn: Boolean(oauth && definition.oauth?.account),
        staticAuth: Boolean(definition.auth),
      },
    });

    for (const reference of Object.values(triggers)) {
      triggerInstances.set(reference, instance as PieceInstance);
    }

    return instance;
  };

  definitions.set(factory, definition);
  return factory as unknown as PieceFactory<T>;
}
