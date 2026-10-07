// The FrogBot class — headless runtime singleton.
//
// Owns a private Payload instance. Exposes CRUD, auth, versions, and
// utilities. Framework-agnostic: works in scripts, tests, serverless,
// and standalone servers.

import type { Gateway } from '@frogbotai/gateway';
import type { Payload } from 'payload';
import { createLocalReq, getPayload, handleEndpoints, resetPasswordOperation } from 'payload';

import { createAgentInstance } from './agents/instance.js';
import type { AgentRegistry } from './agents/types.js';
import { createAIGateway } from './ai/index.js';
import { embedOperation } from './ai/operations/embed.js';
import { embedManyOperation } from './ai/operations/embedMany.js';
import { evaluateOperation } from './ai/operations/evaluate.js';
import { generateImageOperation } from './ai/operations/generateImage.js';
import { generateSpeechOperation } from './ai/operations/generateSpeech.js';
import { generateTextOperation } from './ai/operations/generateText.js';
import { generateVideoOperation } from './ai/operations/generateVideo.js';
import { rerankOperation } from './ai/operations/rerank.js';
import { streamTextOperation } from './ai/operations/streamText.js';
import { transcribeOperation } from './ai/operations/transcribe.js';
import type {
  EmbedManyOpts,
  EmbedOpts,
  EvaluateOpts,
  EvaluateResult,
  EvaluationQuestion,
  GenerateImageOpts,
  GenerateSpeechOpts,
  GenerateTextOpts,
  GenerateVideoOpts,
  RerankOpts,
  SanitizedAIConfig,
  StreamTextOpts,
  TranscribeOpts,
} from './ai/types.js';
import { coordinatesSessions, withAuthOperation } from './auth/operation.js';
import type {
  AuthArgs,
  AuthResult,
  ForgotPasswordArgs,
  LoginArgs,
  LoginResult,
  ResetPasswordArgs,
  ResetPasswordResult,
  UnlockArgs,
  VerifyEmailArgs,
} from './auth/types.js';
import { generateImportMap } from './bin/generateImportMap/index.js';
import { initializeChannelHost, shutdownChannelHost } from './channels/host.js';
import type { Collection } from './collections/config/types.js';
import type {
  BulkResult,
  CountArgs,
  CreateArgs,
  DeleteByIDArgs,
  DeleteManyArgs,
  DuplicateArgs,
  FindArgs,
  FindByIDArgs,
  FindDistinctArgs,
  PaginatedDistinctDocs,
  PaginatedDocs,
  UpdateArgs,
  UpdateByIDArgs,
  UpdateManyArgs,
} from './collections/config/types.js';
import { resolveConfigDir } from './config/resolveConfigPath.js';
import type { FrogBotSanitizedConfig } from './config/sanitized.js';
import { Connections } from './connections/api.js';
import { ensureAutonumbers } from './fields/baseFields/autonumber/counter.js';
import { ensureFrogBotInstance, registerFrogBotInstance } from './instanceRegistry.js';
import type { Jobs } from './jobs/types.js';
import { createKV } from './kv/index.js';
import type { KV } from './kv/types.js';
import type { FrogBotLocalAPI } from './localAPI.js';
import { createFrogBotLocalAPI } from './localAPI.js';
import { toPayloadRequest } from './seams/request.js';
import { searchManyOperation, searchOperation } from './search/operation.js';
import type {
  SearchManyOptions,
  SearchManyResult,
  SearchOptions,
  SearchResult,
} from './search/types.js';
import { encodeTrainingData } from './training/encodeTrainingData.js';
import { readTrainingData } from './training/readTrainingData.js';
import type { ReadTrainingDataOptions } from './training/types.js';
import { TriggerSubscriptions } from './triggers/subscriptions.js';
import { writeGeneratedTypes } from './typegen/index.js';
import type { CollectionSlug, TypedCollection } from './types/generated.js';
import type { FrogBotRequest } from './types/request.js';
import type {
  CountVersionsArgs,
  FindVersionByIDArgs,
  FindVersionsArgs,
  RestoreVersionArgs,
  TypeWithVersion,
} from './versions/types.js';

type LogFn = {
  (obj: Record<string, unknown>, msg?: string): void;
  (msg: string, ...args: unknown[]): void;
};

export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
  trace: LogFn;
  fatal: LogFn;
}

export type InitOptions = {
  config: Promise<FrogBotSanitizedConfig> | FrogBotSanitizedConfig;
  disableDBConnect?: boolean;
  disableOnInit?: boolean;
  startChannelGateway?: boolean;
  onInit?: (frogbot: FrogBot) => Promise<void> | void;
};

type FrogBotCustom = {
  auth?: boolean;
};

type PayloadInitOptions = Pick<InitOptions, 'disableOnInit' | 'onInit' | 'startChannelGateway'>;

type FrogBotState = {
  kv: KV;
  local: FrogBotLocalAPI;
  payload: Payload;
};

const states = new WeakMap<FrogBot, FrogBotState>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function state(frogbot: FrogBot): FrogBotState {
  const current = states.get(frogbot);

  if (!current) throw new Error('FrogBot is not initialized');

  return current;
}

export function getFrogBotPayload(frogbot: FrogBot): Payload {
  return state(frogbot).payload;
}

export function initFrogBotFromPayload(
  payload: Payload,
  config: FrogBotSanitizedConfig,
  options: PayloadInitOptions = {},
): Promise<FrogBot> {
  return initialize(new FrogBot(), payload, config, options);
}

export class FrogBot {
  config!: FrogBotSanitizedConfig;
  collections!: Record<string, Collection>;
  logger!: Logger;
  secret!: string;

  /** Embedded AI gateway — set during init() when `config.ai` is present. */
  gateway?: Gateway;

  /** Registered agents keyed by slug. */
  agents: AgentRegistry = {};
  connections!: Connections;
  triggers!: TriggerSubscriptions;

  get db(): Payload['db'] {
    return state(this).payload.db;
  }

  get kv(): KV {
    return state(this).kv;
  }

  get email(): Payload['email'] {
    return state(this).payload.email;
  }

  get jobs(): Jobs {
    return state(this).payload.jobs as Jobs;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async init(options: InitOptions): Promise<FrogBot> {
    const config = await options.config;
    const payloadConfig = config._internal.payloadConfig;
    const payload = await getPayload({
      config: payloadConfig,
      disableDBConnect: options.disableDBConnect,
      disableOnInit: true,
    });

    return ensureFrogBotInstance(payload, () => initialize(this, payload, config, options), config);
  }

  async destroy(): Promise<void> {
    await shutdownChannelHost(this);
    await state(this).payload.destroy();
  }

  // ── HTTP (framework-agnostic) ──────────────────────────────────────────

  async handleRequest(request: Request): Promise<Response> {
    return handleEndpoints({
      config: state(this).payload.config,
      request,
    });
  }

  async createRequest(req?: Partial<FrogBotRequest>): Promise<FrogBotRequest> {
    if (req?.frogbot) return req as FrogBotRequest;
    type LocalRequest = NonNullable<Parameters<typeof createLocalReq>[0]['req']>;
    const localReq = await createLocalReq(
      { req: (req ?? {}) as LocalRequest },
      state(this).payload,
    );

    return Object.assign(localReq, { frogbot: this });
  }

  async queue({ input, ...args }: { task: string; queue: string; input: unknown }): Promise<void> {
    if (!isRecord(input)) {
      throw new TypeError(`[frogbot] Task '${args.task}' input must be an object.`);
    }

    await state(this).payload.jobs.queue({ ...args, input });
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  async find<T extends CollectionSlug>(
    args: FindArgs<T>,
  ): Promise<PaginatedDocs<TypedCollection<T>>> {
    return state(this).local.find(args);
  }

  async findByID<T extends CollectionSlug>(args: FindByIDArgs<T>): Promise<TypedCollection<T>> {
    return state(this).local.findByID(args);
  }

  async create<T extends CollectionSlug>(args: CreateArgs<T>): Promise<TypedCollection<T>> {
    return state(this).local.create(args);
  }

  async update<T extends CollectionSlug>(args: UpdateByIDArgs<T>): Promise<TypedCollection<T>>;
  async update<T extends CollectionSlug>(
    args: UpdateManyArgs<T>,
  ): Promise<BulkResult<TypedCollection<T>>>;
  async update<T extends CollectionSlug>(args: UpdateArgs<T>) {
    if ('id' in args) return state(this).local.update(args);

    return state(this).local.update(args);
  }

  async delete<T extends CollectionSlug>(args: DeleteByIDArgs<T>): Promise<TypedCollection<T>>;
  async delete<T extends CollectionSlug>(
    args: DeleteManyArgs<T>,
  ): Promise<BulkResult<TypedCollection<T>>>;
  async delete<T extends CollectionSlug>(args: DeleteByIDArgs<T> | DeleteManyArgs<T>) {
    if ('id' in args) return state(this).local.delete(args);

    return state(this).local.delete(args);
  }

  async count<T extends CollectionSlug>(args: CountArgs<T>): Promise<{ totalDocs: number }> {
    return state(this).local.count(args);
  }

  async duplicate<T extends CollectionSlug>(args: DuplicateArgs<T>): Promise<TypedCollection<T>> {
    return state(this).local.duplicate(args);
  }

  async findDistinct<T extends CollectionSlug>(
    args: FindDistinctArgs<T>,
  ): Promise<PaginatedDistinctDocs<Record<string, unknown>>> {
    return state(this).local.findDistinct(args);
  }

  // ── Versions ────────────────────────────────────────────────────────────

  async findVersions<T extends CollectionSlug>(
    args: FindVersionsArgs<T>,
  ): Promise<PaginatedDocs<TypeWithVersion<TypedCollection<T>>>> {
    return state(this).local.findVersions(args);
  }

  async findVersionByID<T extends CollectionSlug>(
    args: FindVersionByIDArgs<T>,
  ): Promise<TypeWithVersion<TypedCollection<T>>> {
    return state(this).local.findVersionByID(args);
  }

  async countVersions<T extends CollectionSlug>(
    args: CountVersionsArgs<T>,
  ): Promise<{ totalDocs: number }> {
    return state(this).local.countVersions(args);
  }

  async restoreVersion<T extends CollectionSlug>(
    args: RestoreVersionArgs<T>,
  ): Promise<TypedCollection<T>> {
    return state(this).local.restoreVersion(args);
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  async auth(args: AuthArgs): Promise<AuthResult> {
    return state(this).local.auth(args);
  }

  async login<T extends CollectionSlug>(args: LoginArgs<T>): Promise<LoginResult<T>> {
    if (!coordinatesSessions(state(this).payload.collections[args.collection]?.config)) {
      return state(this).local.login(args);
    }

    const req = await this.createRequest(args.req);

    return withAuthOperation({
      req,
      collectionSlug: args.collection,
      operation: 'login',
      fn: () => state(this).local.login({ ...args, req }),
    });
  }

  async forgotPassword<T extends CollectionSlug>(args: ForgotPasswordArgs<T>): Promise<string> {
    return state(this).local.forgotPassword(args);
  }

  async resetPassword<T extends CollectionSlug>(
    args: ResetPasswordArgs<T>,
  ): Promise<ResetPasswordResult> {
    if (!coordinatesSessions(state(this).payload.collections[args.collection]?.config)) {
      return state(this).local.resetPassword(args);
    }

    const req = await this.createRequest(args.req);

    return withAuthOperation({
      req,
      collectionSlug: args.collection,
      operation: 'resetPassword',
      fn: async () => {
        const payloadReq = toPayloadRequest(req);
        const collection = state(this).payload.collections[args.collection];
        const result = await resetPasswordOperation({
          collection,
          data: args.data,
          overrideAccess: args.overrideAccess,
          req: await createLocalReq({ context: args.context, req: payloadReq }, payloadReq.payload),
        });

        if (collection.config.auth.removeTokenFromResponses) delete result.token;

        return result;
      },
    });
  }

  async verifyEmail<T extends CollectionSlug>(args: VerifyEmailArgs<T>): Promise<boolean> {
    return state(this).local.verifyEmail(args);
  }

  async unlock<T extends CollectionSlug>(args: UnlockArgs<T>): Promise<boolean> {
    return state(this).local.unlock(args);
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  encrypt(text: string): string {
    return state(this).payload.encrypt(text);
  }

  decrypt(text: string): string {
    return state(this).payload.decrypt(text);
  }

  getAdminURL(): string {
    return state(this).payload.getAdminURL();
  }

  getAPIURL(): string {
    return state(this).payload.getAPIURL();
  }

  // ── AI ──────────────────────────────────────────────────────────────────

  generateText = (opts: GenerateTextOpts): ReturnType<typeof generateTextOperation> =>
    generateTextOperation(aiDeps(this), opts);

  streamText = (opts: StreamTextOpts): ReturnType<typeof streamTextOperation> =>
    streamTextOperation(aiDeps(this), opts);

  embed = (opts: EmbedOpts) => embedOperation(aiDeps(this), opts);

  embedMany = (opts: EmbedManyOpts) => embedManyOperation(aiDeps(this), opts);

  generateImage = (opts: GenerateImageOpts) => generateImageOperation(aiDeps(this), opts);

  generateSpeech = (opts: GenerateSpeechOpts) => generateSpeechOperation(aiDeps(this), opts);

  transcribe = (opts: TranscribeOpts) => transcribeOperation(aiDeps(this), opts);

  generateVideo = (opts: GenerateVideoOpts) => generateVideoOperation(aiDeps(this), opts);

  rerank = (opts: RerankOpts) => rerankOperation(aiDeps(this), opts);

  search = <T extends CollectionSlug>(options: SearchOptions<T>): Promise<SearchResult<T>> =>
    searchOperation(this, state(this).payload, options);

  searchMany = <const C extends readonly CollectionSlug[]>(
    options: SearchManyOptions<C>,
  ): Promise<SearchManyResult<C>> => searchManyOperation(this, state(this).payload, options);

  evaluate = <const QUESTIONS extends Record<string, EvaluationQuestion>>(
    opts: EvaluateOpts<QUESTIONS>,
  ): Promise<EvaluateResult<QUESTIONS>> => evaluateOperation(aiDeps(this), opts);

  // ── Training data ───────────────────────────────────────────────────────

  exportTrainingData(options: ReadTrainingDataOptions = {}): ReadableStream<Uint8Array> {
    return encodeTrainingData(readTrainingData(this, options));
  }
}

async function initialize(
  frogbot: FrogBot,
  payload: Payload,
  config: FrogBotSanitizedConfig,
  options: PayloadInitOptions,
): Promise<FrogBot> {
  frogbot.config = config;

  states.set(frogbot, {
    kv: createKV({ adapter: payload.kv }),
    local: createFrogBotLocalAPI(payload),
    payload,
  });

  registerFrogBotInstance(
    payload,
    frogbot,
    config,
    (next) =>
      new Promise<void>((resolve) => {
        refresh(frogbot, next);
        resolve();
      }),
  );

  frogbot.secret = payload.secret;
  frogbot.logger = payload.logger;

  if (frogbot.config._internal.noEmail && process.env.NEXT_PHASE !== 'phase-production-build') {
    frogbot.logger.warn(
      '[frogbot] No email adapter provided. Emails will be logged but not sent. ' +
        'Pass an `email` adapter to enable delivery.',
    );
  }

  refresh(frogbot, config);

  await initializeChannelHost(frogbot, options.startChannelGateway !== false);

  if (frogbot.config.ai) {
    await registerAITelemetry(frogbot.config.ai);
  }

  if (
    process.env.NODE_ENV !== 'production' &&
    frogbot.config.typescript?.autoGenerate !== false &&
    !options.disableOnInit
  ) {
    const configDir = resolveConfigDir(process.cwd());

    if (configDir) {
      void writeGeneratedTypes(frogbot.config, configDir).catch((err: unknown) => {
        frogbot.logger.warn(
          `[frogbot] type generation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
  }

  if (process.env.NODE_ENV !== 'production' && !options.disableOnInit) {
    void generateImportMap(payload.config, { ignoreResolveError: true }).catch((err: unknown) => {
      frogbot.logger.warn(
        `[frogbot] import map generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  if (!options.disableOnInit) {
    if (Object.keys(frogbot.config._internal.triggers).length) {
      void frogbot.triggers.reconcile().catch((error: unknown) => {
        frogbot.logger.warn(
          `[frogbot] Trigger reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }

    if (frogbot.config._internal.autonumbers.length) await ensureAutonumbers(frogbot);

    if (options.onInit) {
      await options.onInit(frogbot);
    }

    if (frogbot.config.onInit) {
      await frogbot.config.onInit(frogbot);
    }
  }

  return frogbot;
}

function refresh(frogbot: FrogBot, config: FrogBotSanitizedConfig): void {
  frogbot.config = config;
  frogbot.connections = new Connections(frogbot, config.connections);
  frogbot.triggers ??= new TriggerSubscriptions(frogbot);
  frogbot.gateway = config.ai ? createAIGateway(config.ai, frogbot.logger) : undefined;
  frogbot.agents = {};

  if (config.agents?.length && config.ai) {
    const agentDeps = {
      gateway: assertAIConfigured(frogbot),
      config: config.ai,
      frogbot,
    };

    for (const agentConfig of config.agents) {
      frogbot.agents[agentConfig.slug] = createAgentInstance(agentConfig, agentDeps);
    }
  }

  frogbot.collections = {};

  for (const collection of state(frogbot).payload.config.collections) {
    if (!collection.slug.startsWith('payload-')) {
      frogbot.collections[collection.slug] = toCollection(frogbot, collection);
    }
  }
}

function assertAIConfigured(frogbot: FrogBot): Gateway {
  if (!frogbot.gateway || !frogbot.config.ai) {
    throw new Error('AI is not configured. Add an `ai` block to your FrogBot config.');
  }

  return frogbot.gateway;
}

function aiDeps(frogbot: FrogBot) {
  const gateway = assertAIConfigured(frogbot);

  return {
    gateway,
    config: frogbot.config.ai!,
    frogbot,
    logger: frogbot.logger,
  };
}

async function registerAITelemetry(ai: SanitizedAIConfig): Promise<void> {
  if (!ai.telemetry.enabled) return;

  let otelModule: typeof import('@ai-sdk/otel') | undefined; // eslint-disable-line @typescript-eslint/consistent-type-imports
  try {
    otelModule = await import('@ai-sdk/otel');
  } catch {
    // Optional peer dep not installed — telemetry silently disabled.
    return;
  }

  const { registerTelemetry } = await import('ai');
  const { OpenTelemetry } = otelModule;

  const deploymentId = ai._internal.deploymentId;
  const userEnrichSpan = ai.telemetry.enrichSpan;

  registerTelemetry(
    new OpenTelemetry({
      enrichSpan: (args) => ({
        'frogbot.deployment': deploymentId,
        ...(userEnrichSpan?.(args) ?? {}),
      }),
    }),
  );
}

function toCollection(frogbot: FrogBot, c: { slug: string; custom?: unknown }): Collection {
  const custom = (c.custom as { frogbot?: FrogBotCustom } | undefined) ?? {};
  const fb = custom.frogbot ?? {};
  const search = frogbot.config.collections.find(({ slug }) => slug === c.slug)?.search;

  return {
    slug: c.slug,
    auth: fb.auth ?? false,
    ...(search ? { search } : {}),
  };
}
