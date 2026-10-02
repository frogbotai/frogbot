import type { ApplyDisableErrors, PaginatedDocs, SelectType, TypeWithVersion } from 'frogbot';

import { forgotPassword, type ForgotPasswordOptions } from './auth/forgotPassword.js';
import { login, type LoginOptions, type LoginResult } from './auth/login.js';
import { me, type MeOptions, type MeResult } from './auth/me.js';
import { type RefreshOptions, type RefreshResult, refreshToken } from './auth/refreshToken.js';
import {
  resetPassword,
  type ResetPasswordOptions,
  type ResetPasswordResult,
} from './auth/resetPassword.js';
import { verifyEmail, type VerifyEmailOptions } from './auth/verifyEmail.js';
import { count, type CountOptions } from './collections/count.js';
import { create, type CreateOptions } from './collections/create.js';
import {
  type DeleteByIDOptions,
  type DeleteManyOptions,
  deleteOperation,
  type DeleteOptions,
} from './collections/delete.js';
import { find, type FindOptions } from './collections/find.js';
import { findByID, type FindByIDOptions } from './collections/findByID.js';
import { findVersionByID, type FindVersionByIDOptions } from './collections/findVersionByID.js';
import { findVersions, type FindVersionsOptions } from './collections/findVersions.js';
import { restoreVersion, type RestoreVersionByIDOptions } from './collections/restoreVersion.js';
import {
  update,
  type UpdateByIDOptions,
  type UpdateManyOptions,
  type UpdateOptions,
} from './collections/update.js';
import {
  search,
  searchMany,
  type SearchManyOptions,
  type SearchManyResult,
  type SearchOptions,
  type SearchResult,
} from './search.js';
import type {
  AuthCollectionSlug,
  BulkOperationResult,
  CollectionSlug,
  DataFromCollectionSlug,
  DefaultTypes,
  FrogBotSDKSend,
  FrogBotTypesShape,
  SelectFromCollectionSlug,
  TransformCollectionWithSelect,
} from './types.js';
import { buildSearchParams } from './utilities/buildSearchParams.js';

export type { ForgotPasswordOptions } from './auth/forgotPassword.js';
export type { LoginOptions, LoginResult } from './auth/login.js';
export type { MeOptions, MeResult } from './auth/me.js';
export type { RefreshOptions, RefreshResult } from './auth/refreshToken.js';
export type { ResetPasswordOptions, ResetPasswordResult } from './auth/resetPassword.js';
export type { VerifyEmailOptions } from './auth/verifyEmail.js';
export type { CountOptions } from './collections/count.js';
export type { CreateOptions } from './collections/create.js';
export type {
  DeleteBaseOptions,
  DeleteByIDOptions,
  DeleteManyOptions,
  DeleteOptions,
} from './collections/delete.js';
export type { FindOptions } from './collections/find.js';
export type { FindByIDOptions } from './collections/findByID.js';
export type { FindVersionByIDOptions } from './collections/findVersionByID.js';
export type { FindVersionsOptions } from './collections/findVersions.js';
export type { RestoreVersionByIDOptions } from './collections/restoreVersion.js';
export type {
  UpdateBaseOptions,
  UpdateByIDOptions,
  UpdateManyOptions,
  UpdateOptions,
} from './collections/update.js';
export type {
  SearchHit,
  SearchManyCollection,
  SearchManyCollectionResult,
  SearchManyOptions,
  SearchManyResult,
  SearchOptions,
  SearchResult,
} from './search.js';
export type {
  AuthCollectionSlug,
  BulkOperationResult,
  CollectionSlug,
  DataFromCollectionSlug,
  DefaultTypes,
  FrogBotTypesShape,
  SelectFromCollectionSlug,
  TransformCollectionWithSelect,
  UntypedFrogBotSDKTypes,
  UploadCollectionSlug,
  WhereFromCollectionSlug,
} from './types.js';
export type { AgentManifest, AgentManifestEntry } from 'frogbot';

export type FrogBotSDKConfig = {
  baseURL: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
};

export type FrogBotRequestInit = Omit<RequestInit, 'body'> & {
  body?: BodyInit | null;
  json?: unknown;
};

export type FrogBotUpload = {
  id: string | number;
  filename: string;
  mimeType: string;
};

export type FrogBotUploadResponse = {
  doc: FrogBotUpload;
  message: string;
};

export type AIChatRequest = {
  model: string;
  messages: Array<{ role: string; content?: unknown; [key: string]: unknown }>;
  stream?: boolean | null;
  [key: string]: unknown;
};

export type AITranscriptionRequest = {
  model: string;
  file: File;
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt' | null;
  language?: string | null;
  prompt?: string | null;
  temperature?: number | null;
  timestamp_granularities?: 'word' | 'segment' | Array<'word' | 'segment'> | null;
};

export type AITranscriptionResult = {
  text: string;
  [key: string]: unknown;
};

export type FrogBotErrorDetail = {
  message: string;
  [key: string]: unknown;
};

export class FrogBotSDKError extends Error {
  errors: FrogBotErrorDetail[];
  response: Response;
  status: number;

  constructor({
    errors,
    message,
    response,
  }: {
    errors: FrogBotErrorDetail[];
    message: string;
    response: Response;
  }) {
    super(message);
    this.name = 'FrogBotSDKError';
    this.errors = errors;
    this.response = response;
    this.status = response.status;
  }
}

export class FrogBotSDK<T extends FrogBotTypesShape = DefaultTypes> {
  readonly baseURL: string;
  readonly fetch: typeof fetch;
  readonly headers: Headers;
  readonly ai = {
    chat: (body: AIChatRequest, init: FrogBotRequestInit = {}) =>
      this.request('/v1/chat/completions', {
        ...init,
        method: 'POST',
        json: body,
      }),
    transcribe: async (input: AITranscriptionRequest): Promise<AITranscriptionResult> => {
      const body = new FormData();
      body.append('model', input.model);
      body.append('file', input.file);
      if (input.response_format != null) body.append('response_format', input.response_format);
      if (input.language != null) body.append('language', input.language);
      if (input.prompt != null) body.append('prompt', input.prompt);
      if (input.temperature != null) body.append('temperature', String(input.temperature));
      const granularities = Array.isArray(input.timestamp_granularities)
        ? input.timestamp_granularities
        : input.timestamp_granularities == null
          ? []
          : [input.timestamp_granularities];
      for (const granularity of granularities) {
        body.append('timestamp_granularities[]', granularity);
      }
      const response = await this.request('/v1/audio/transcriptions', { method: 'POST', body });
      return response.json() as Promise<AITranscriptionResult>;
    },
  };

  constructor({ baseURL, fetch: customFetch, headers }: FrogBotSDKConfig) {
    this.baseURL = baseURL.replace(/\/$/, '');
    this.fetch = customFetch ?? globalThis.fetch.bind(globalThis);
    this.headers = new Headers(headers);
  }

  async request(path: string, incomingInit: FrogBotRequestInit = {}): Promise<Response> {
    const { json, ...requestInit } = incomingInit;
    const headers = new Headers(this.headers);
    new Headers(incomingInit.headers).forEach((value, key) => headers.set(key, value));
    const init: RequestInit = { ...requestInit, headers };

    if (json !== undefined) {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(json);
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const response = await this.fetch(`${this.baseURL}${normalizedPath}`, init);

    if (!response.ok) {
      let data: { error?: { message?: string }; errors?: FrogBotErrorDetail[]; message?: string } =
        {};
      try {
        data = await response.clone().json();
      } catch {
        data = {};
      }
      const errors = data.errors ?? [
        { message: data.error?.message ?? data.message ?? response.statusText },
      ];
      throw new FrogBotSDKError({
        errors,
        message: errors[0]?.message ?? response.statusText,
        response,
      });
    }

    return response;
  }

  async upload(collection: string, file: File): Promise<FrogBotUpload> {
    const body = new FormData();
    body.append('file', file);
    body.append('_payload', '{}');
    const response = await this.request(`/${collection}`, { method: 'POST', body });
    const result = (await response.json()) as FrogBotUploadResponse;
    return result.doc;
  }

  count<TSlug extends CollectionSlug<T>>(
    options: CountOptions<T, TSlug>,
    init?: RequestInit,
  ): Promise<{ totalDocs: number }> {
    return count(this.#send, options, init);
  }

  create<TSlug extends CollectionSlug<T>, TSelect extends SelectType>(
    options: CreateOptions<T, TSlug, TSelect>,
    init?: RequestInit,
  ): Promise<TransformCollectionWithSelect<T, TSlug, TSelect>> {
    return create(this.#send, options, init);
  }

  delete<TSlug extends CollectionSlug<T>, TSelect extends SelectFromCollectionSlug<T, TSlug>>(
    options: DeleteManyOptions<T, TSlug, TSelect>,
    init?: RequestInit,
  ): Promise<BulkOperationResult<T, TSlug, TSelect>>;

  delete<TSlug extends CollectionSlug<T>, TSelect extends SelectFromCollectionSlug<T, TSlug>>(
    options: DeleteByIDOptions<T, TSlug, TSelect>,
    init?: RequestInit,
  ): Promise<TransformCollectionWithSelect<T, TSlug, TSelect>>;

  delete<TSlug extends CollectionSlug<T>, TSelect extends SelectFromCollectionSlug<T, TSlug>>(
    options: DeleteOptions<T, TSlug, TSelect>,
    init?: RequestInit,
  ): Promise<
    BulkOperationResult<T, TSlug, TSelect> | TransformCollectionWithSelect<T, TSlug, TSelect>
  > {
    return deleteOperation(this.#send, options, init);
  }

  find<TSlug extends CollectionSlug<T>, TSelect extends SelectFromCollectionSlug<T, TSlug>>(
    options: FindOptions<T, TSlug, TSelect>,
    init?: RequestInit,
  ): Promise<PaginatedDocs<TransformCollectionWithSelect<T, TSlug, TSelect>>> {
    return find(this.#send, options, init);
  }

  findByID<
    TSlug extends CollectionSlug<T>,
    TDisableErrors extends boolean,
    TSelect extends SelectFromCollectionSlug<T, TSlug>,
  >(
    options: FindByIDOptions<T, TSlug, TDisableErrors, TSelect>,
    init?: RequestInit,
  ): Promise<ApplyDisableErrors<TransformCollectionWithSelect<T, TSlug, TSelect>, TDisableErrors>> {
    return findByID(this.#send, options, init);
  }

  findVersionByID<TSlug extends CollectionSlug<T>, TDisableErrors extends boolean>(
    options: FindVersionByIDOptions<T, TSlug, TDisableErrors>,
    init?: RequestInit,
  ): Promise<
    ApplyDisableErrors<TypeWithVersion<DataFromCollectionSlug<T, TSlug>>, TDisableErrors>
  > {
    return findVersionByID(this.#send, options, init);
  }

  findVersions<TSlug extends CollectionSlug<T>>(
    options: FindVersionsOptions<T, TSlug>,
    init?: RequestInit,
  ): Promise<PaginatedDocs<TypeWithVersion<DataFromCollectionSlug<T, TSlug>>>> {
    return findVersions(this.#send, options, init);
  }

  forgotPassword<TSlug extends AuthCollectionSlug<T>>(
    options: ForgotPasswordOptions<T, TSlug>,
    init?: RequestInit,
  ): Promise<{ message: string }> {
    return forgotPassword(this.#send, options, init);
  }

  login<TSlug extends AuthCollectionSlug<T>>(
    options: LoginOptions<T, TSlug>,
    init?: RequestInit,
  ): Promise<LoginResult<T, TSlug>> {
    return login(this.#send, options, init);
  }

  me<TSlug extends AuthCollectionSlug<T>>(
    options: MeOptions<T, TSlug>,
    init?: RequestInit,
  ): Promise<MeResult<T, TSlug>> {
    return me(this.#send, options, init);
  }

  refreshToken<TSlug extends AuthCollectionSlug<T>>(
    options: RefreshOptions<T, TSlug>,
    init?: RequestInit,
  ): Promise<RefreshResult<T, TSlug>> {
    return refreshToken(this.#send, options, init);
  }

  resetPassword<TSlug extends AuthCollectionSlug<T>>(
    options: ResetPasswordOptions<T, TSlug>,
    init?: RequestInit,
  ): Promise<ResetPasswordResult<T, TSlug>> {
    return resetPassword(this.#send, options, init);
  }

  restoreVersion<TSlug extends CollectionSlug<T>>(
    options: RestoreVersionByIDOptions<T, TSlug>,
    init?: RequestInit,
  ): Promise<DataFromCollectionSlug<T, TSlug>> {
    return restoreVersion(this.#send, options, init);
  }

  search<TSlug extends CollectionSlug<T>>(
    options: SearchOptions<T, TSlug>,
    init?: RequestInit,
  ): Promise<SearchResult<T, TSlug>> {
    return search(this.#send, options, init);
  }

  searchMany<const C extends readonly CollectionSlug<T>[]>(
    options: SearchManyOptions<T, C>,
    init?: RequestInit,
  ): Promise<SearchManyResult<T, C>> {
    return searchMany(this.#send, options, init);
  }

  update<TSlug extends CollectionSlug<T>, TSelect extends SelectFromCollectionSlug<T, TSlug>>(
    options: UpdateManyOptions<T, TSlug, TSelect>,
    init?: RequestInit,
  ): Promise<BulkOperationResult<T, TSlug, TSelect>>;

  update<TSlug extends CollectionSlug<T>, TSelect extends SelectFromCollectionSlug<T, TSlug>>(
    options: UpdateByIDOptions<T, TSlug, TSelect>,
    init?: RequestInit,
  ): Promise<TransformCollectionWithSelect<T, TSlug, TSelect>>;

  update<TSlug extends CollectionSlug<T>, TSelect extends SelectFromCollectionSlug<T, TSlug>>(
    options: UpdateOptions<T, TSlug, TSelect>,
    init?: RequestInit,
  ): Promise<
    BulkOperationResult<T, TSlug, TSelect> | TransformCollectionWithSelect<T, TSlug, TSelect>
  > {
    return update(this.#send, options, init);
  }

  verifyEmail<TSlug extends AuthCollectionSlug<T>>(
    options: VerifyEmailOptions<T, TSlug>,
    init?: RequestInit,
  ): Promise<{ message: string }> {
    return verifyEmail(this.#send, options, init);
  }

  #send: FrogBotSDKSend = ({ args = {}, file, init, json, method, path }) => {
    const requestInit: FrogBotRequestInit = { method, ...init };

    if (json && file) {
      const body = new FormData();

      body.append('file', file);
      body.append('_payload', JSON.stringify(json));
      requestInit.body = body;
    } else if (json) {
      requestInit.json = json;
    }

    return this.request(`${path}${buildSearchParams(args)}`, requestInit);
  };
}

export function createFrogBotSDK<T extends FrogBotTypesShape = DefaultTypes>(
  config: FrogBotSDKConfig,
): FrogBotSDK<T> {
  return new FrogBotSDK<T>(config);
}

export default FrogBotSDK;
