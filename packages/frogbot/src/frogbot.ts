// The Frogbot class — headless runtime singleton.
//
// Owns a private Payload instance. Exposes CRUD, auth, versions, and
// utilities. Framework-agnostic: works in scripts, tests, serverless,
// and standalone servers.

import type { Payload } from 'payload';
import { createLocalReq, getPayload, handleEndpoints } from 'payload';
import type { Gateway } from '@frogbotai/gateway';

import { createAIGateway } from './ai/index.js';
import { createAgentInstance } from './agents/instance.js';
import { embedOperation } from './ai/operations/embed.js';
import { embedManyOperation } from './ai/operations/embedMany.js';
import { generateImageOperation } from './ai/operations/generateImage.js';
import { generateSpeechOperation } from './ai/operations/generateSpeech.js';
import { generateTextOperation } from './ai/operations/generateText.js';
import { generateVideoOperation } from './ai/operations/generateVideo.js';
import { rerankOperation } from './ai/operations/rerank.js';
import { streamTextOperation } from './ai/operations/streamText.js';
import { writeGeneratedTypes } from './bin/generateTypes.js';
import { transcribeOperation } from './ai/operations/transcribe.js';
import { registerFrogbotInstance } from './instanceRegistry.js';
import { createFrogbotLocalAPI } from './localAPI.js';
import type { FrogbotLocalAPI } from './localAPI.js';
import type { AgentRegistry } from './types/agent.js';
import type {
  EmbedManyOpts,
  EmbedOpts,
  GenerateImageOpts,
  GenerateSpeechOpts,
  GenerateTextOpts,
  GenerateVideoOpts,
  RerankOpts,
  SanitizedAIConfig,
  StreamTextOpts,
  TranscribeOpts,
} from './types/ai.js';
import type { Collection } from './types/collection.js';
import type { CollectionSlug, TypedCollection } from './types/generated.js';
import type { FrogbotRequest } from './types/request.js';
import type { FrogbotSanitizedConfig } from './types/sanitized.js';
import type {
  AuthArgs,
  AuthResult,
  BulkResult,
  CountArgs,
  CountVersionsArgs,
  CreateArgs,
  DeleteByIDArgs,
  DeleteManyArgs,
  DuplicateArgs,
  FindArgs,
  FindByIDArgs,
  FindDistinctArgs,
  FindVersionByIDArgs,
  FindVersionsArgs,
  ForgotPasswordArgs,
  LoginArgs,
  LoginResult,
  PaginatedDistinctDocs,
  PaginatedDocs,
  ResetPasswordArgs,
  ResetPasswordResult,
  RestoreVersionArgs,
  TypeWithVersion,
  UnlockArgs,
  UpdateArgs,
  UpdateByIDArgs,
  UpdateManyArgs,
  VerifyEmailArgs,
} from './types/operations.js';

type LogFn = (msg: string, ...args: unknown[]) => void;

export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
  trace: LogFn;
  fatal: LogFn;
}

export type InitOptions = {
  config: Promise<FrogbotSanitizedConfig> | FrogbotSanitizedConfig;
  disableDBConnect?: boolean;
  disableOnInit?: boolean;
  onInit?: (frogbot: Frogbot) => Promise<void> | void;
};

type FrogbotCustom = {
  auth?: boolean;
};

export class Frogbot {
  private payload!: Payload;
  private local!: FrogbotLocalAPI;

  config!: FrogbotSanitizedConfig;
  collections!: Record<string, Collection>;
  logger!: Logger;
  secret!: string;

  /** Embedded AI gateway — set during init() when `config.ai` is present. */
  gateway?: Gateway;

  /** Registered agents keyed by slug. */
  agents: AgentRegistry = {};

  get db() {
    return this.payload.db;
  }
  get kv() {
    return this.payload.kv;
  }
  get email() {
    return this.payload.email;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async init(options: InitOptions): Promise<Frogbot> {
    const config = await options.config;
    this.config = config;

    const payloadConfig = config._internal.payloadConfig;

    this.payload = await getPayload({
      config: payloadConfig,
      disableDBConnect: options.disableDBConnect,
      disableOnInit: true,
    });
    this.local = createFrogbotLocalAPI(this.payload);
    registerFrogbotInstance(this.payload, this);

    this.secret = this.payload.secret;
    this.logger = this.payload.logger;

    // Initialize the embedded AI gateway if AI is configured.
    if (this.config.ai) {
      this.gateway = createAIGateway(this.config.ai, this.logger);
      await this.registerAITelemetry(this.config.ai);
    }

    if (this.config.agents?.length && this.config.ai) {
      const agentDeps = {
        gateway: this.assertAIConfigured(),
        config: this.config.ai,
        frogbot: this,
      };
      for (const agentConfig of this.config.agents) {
        this.agents[agentConfig.slug] = createAgentInstance(agentConfig, agentDeps);
      }
    }

    // Build collection registry (exclude Payload internals).
    this.collections = {};
    for (const c of this.payload.config.collections) {
      if (c.slug.startsWith('payload-')) {
        continue;
      }
      this.collections[c.slug] = this.toCollection(c);
    }

    if (
      process.env.NODE_ENV !== 'production' &&
      this.config.typescript?.autoGenerate !== false &&
      !options.disableOnInit
    ) {
      void writeGeneratedTypes(this.config, process.cwd()).catch((err: unknown) => {
        this.logger.warn(`[frogbot] type generation failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    // Run onInit callbacks.
    if (!options.disableOnInit) {
      if (options.onInit) {
        await options.onInit(this);
      }
      if (this.config.onInit) {
        await this.config.onInit(this);
      }
    }

    return this;
  }

  async destroy(): Promise<void> {
    await this.payload.destroy();
  }

  // ── HTTP (framework-agnostic) ──────────────────────────────────────────

  async handleRequest(request: Request): Promise<Response> {
    return handleEndpoints({
      config: this.payload.config,
      request,
    });
  }

  async createRequest(req?: Partial<FrogbotRequest>): Promise<FrogbotRequest> {
    if (req?.frogbot) return req as FrogbotRequest;
    type LocalRequest = NonNullable<Parameters<typeof createLocalReq>[0]['req']>;
    const localReq = await createLocalReq({ req: (req ?? {}) as LocalRequest }, this.payload);
    return Object.assign(localReq, { frogbot: this });
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  async find<T extends CollectionSlug>(args: FindArgs<T>): Promise<PaginatedDocs<TypedCollection<T>>> {
    return this.local.find(args);
  }

  async findByID<T extends CollectionSlug>(args: FindByIDArgs<T>): Promise<TypedCollection<T>> {
    return this.local.findByID(args);
  }

  async create<T extends CollectionSlug>(args: CreateArgs<T>): Promise<TypedCollection<T>> {
    return this.local.create(args);
  }

  async update<T extends CollectionSlug>(args: UpdateByIDArgs<T>): Promise<TypedCollection<T>>;
  async update<T extends CollectionSlug>(args: UpdateManyArgs<T>): Promise<BulkResult<TypedCollection<T>>>;
  async update<T extends CollectionSlug>(args: UpdateArgs<T>) {
    if ('id' in args) return this.local.update(args);
    return this.local.update(args);
  }

  async delete<T extends CollectionSlug>(args: DeleteByIDArgs<T>): Promise<TypedCollection<T>>;
  async delete<T extends CollectionSlug>(args: DeleteManyArgs<T>): Promise<BulkResult<TypedCollection<T>>>;
  async delete<T extends CollectionSlug>(args: DeleteByIDArgs<T> | DeleteManyArgs<T>) {
    if ('id' in args) return this.local.delete(args);
    return this.local.delete(args);
  }

  async count<T extends CollectionSlug>(args: CountArgs<T>): Promise<{ totalDocs: number }> {
    return this.local.count(args);
  }

  async duplicate<T extends CollectionSlug>(args: DuplicateArgs<T>): Promise<TypedCollection<T>> {
    return this.local.duplicate(args);
  }

  async findDistinct<T extends CollectionSlug>(
    args: FindDistinctArgs<T>,
  ): Promise<PaginatedDistinctDocs<Record<string, unknown>>> {
    return this.local.findDistinct(args);
  }

  // ── Versions ────────────────────────────────────────────────────────────

  async findVersions<T extends CollectionSlug>(
    args: FindVersionsArgs<T>,
  ): Promise<PaginatedDocs<TypeWithVersion<TypedCollection<T>>>> {
    return this.local.findVersions(args);
  }

  async findVersionByID<T extends CollectionSlug>(
    args: FindVersionByIDArgs<T>,
  ): Promise<TypeWithVersion<TypedCollection<T>>> {
    return this.local.findVersionByID(args);
  }

  async countVersions<T extends CollectionSlug>(args: CountVersionsArgs<T>): Promise<{ totalDocs: number }> {
    return this.local.countVersions(args);
  }

  async restoreVersion<T extends CollectionSlug>(args: RestoreVersionArgs<T>): Promise<TypedCollection<T>> {
    return this.local.restoreVersion(args);
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  async auth(args: AuthArgs): Promise<AuthResult> {
    return this.local.auth(args);
  }

  async login<T extends CollectionSlug>(args: LoginArgs<T>): Promise<LoginResult<T>> {
    return this.local.login(args);
  }

  async forgotPassword<T extends CollectionSlug>(args: ForgotPasswordArgs<T>): Promise<string> {
    return this.local.forgotPassword(args);
  }

  async resetPassword<T extends CollectionSlug>(args: ResetPasswordArgs<T>): Promise<ResetPasswordResult> {
    return this.local.resetPassword(args);
  }

  async verifyEmail<T extends CollectionSlug>(args: VerifyEmailArgs<T>): Promise<boolean> {
    return this.local.verifyEmail(args);
  }

  async unlock<T extends CollectionSlug>(args: UnlockArgs<T>): Promise<boolean> {
    return this.local.unlock(args);
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  encrypt(text: string): string {
    return this.payload.encrypt(text);
  }
  decrypt(text: string): string {
    return this.payload.decrypt(text);
  }
  getAdminURL(): string {
    return this.payload.getAdminURL();
  }
  getAPIURL(): string {
    return this.payload.getAPIURL();
  }

  // ── AI ──────────────────────────────────────────────────────────────────

  generateText = (opts: GenerateTextOpts): ReturnType<typeof generateTextOperation> =>
    generateTextOperation(this.aiDeps(), opts);

  streamText = (opts: StreamTextOpts): ReturnType<typeof streamTextOperation> =>
    streamTextOperation(this.aiDeps(), opts);

  embed = (opts: EmbedOpts) =>
    embedOperation(this.aiDeps(), opts);

  embedMany = (opts: EmbedManyOpts) =>
    embedManyOperation(this.aiDeps(), opts);

  generateImage = (opts: GenerateImageOpts) =>
    generateImageOperation(this.aiDeps(), opts);

  generateSpeech = (opts: GenerateSpeechOpts) =>
    generateSpeechOperation(this.aiDeps(), opts);

  transcribe = (opts: TranscribeOpts) =>
    transcribeOperation(this.aiDeps(), opts);

  generateVideo = (opts: GenerateVideoOpts) =>
    generateVideoOperation(this.aiDeps(), opts);

  rerank = (opts: RerankOpts) =>
    rerankOperation(this.aiDeps(), opts);

  // ── Private ─────────────────────────────────────────────────────────────

  /** @internal — throws if AI is not configured, otherwise returns the gateway. */
  private assertAIConfigured(): Gateway {
    if (!this.gateway || !this.config.ai) {
      throw new Error('AI is not configured. Add an `ai` block to your FrogBot config.');
    }
    return this.gateway;
  }

  /** @internal — builds the deps object for AI operations. */
  private aiDeps() {
    const gateway = this.assertAIConfigured();
    return {
      gateway,
      config: this.config.ai!,
      frogbot: this,
      logger: this.logger,
    };
  }

  /**
   * @internal — auto-register `@ai-sdk/otel` with FrogBot-specific span
   * enrichment. Silently no-ops when `@ai-sdk/otel` is not installed or
   * when telemetry is disabled in config.
   */
  private async registerAITelemetry(ai: SanitizedAIConfig): Promise<void> {
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

  private toCollection(c: { slug: string; custom?: unknown }): Collection {
    const custom = (c.custom as { frogbot?: FrogbotCustom } | undefined) ?? {};
    const fb = custom.frogbot ?? {};
    return {
      slug: c.slug,
      auth: fb.auth ?? false,
    };
  }
}
