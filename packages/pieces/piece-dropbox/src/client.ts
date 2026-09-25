import type { FrogBotRequest } from 'frogbot';
import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

export const dropboxAuth = z.object({
  accessToken: z.string().min(1).meta({ secret: true }),
  refreshToken: z.string().min(1).optional().meta({ secret: true }),
});

export type DropboxAuth = z.output<typeof dropboxAuth>;
export type DropboxRunArgs<T extends z.ZodType> = PieceRunArgs<
  z.output<T>,
  Record<string, never>,
  DropboxClient
>;

type RequestOptions = {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit;
  signal?: AbortSignal;
  timeout?: number;
  failsafe?: boolean;
};

export type DropboxResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'error_summary' in body) {
    const summary = body.error_summary;

    if (typeof summary === 'string') return summary;
  }

  return `Dropbox request failed (${status}).`;
}

export class DropboxClient {
  readonly accessToken: string;

  constructor(auth: DropboxAuth) {
    this.accessToken = auth.accessToken;
  }

  async request(path: string, options: RequestOptions = {}): Promise<DropboxResponse> {
    const timeout = AbortSignal.timeout(options.timeout ?? 30_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const headers = new Headers(options.headers);

    headers.set('authorization', `Bearer ${this.accessToken}`);
    signal.throwIfAborted();

    const response = await fetch(path, {
      method: options.method ?? 'POST',
      headers,
      body: options.body,
      redirect: 'error',
      signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.arrayBuffer();

    if (!response.ok && !options.failsafe) throw new Error(errorMessage(body, response.status));

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };
  }

  async rpc<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.request(`https://api.dropboxapi.com/2/${path}`, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    return schema.parse(response.body);
  }

  async content<T>({
    path,
    args,
    body,
    schema,
    signal,
  }: {
    path: string;
    args: unknown;
    body?: BodyInit;
    schema: z.ZodType<T>;
    signal?: AbortSignal;
  }): Promise<T> {
    const response = await this.request(`https://content.dropboxapi.com/2/${path}`, {
      headers: {
        'content-type': 'application/octet-stream',
        'dropbox-api-arg': asciiJson(args),
      },
      body,
      signal,
    });

    return schema.parse(response.body);
  }
}

export function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) => {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}

export function createDropboxClient({ auth }: { auth: unknown }): DropboxClient {
  return new DropboxClient(dropboxAuth.parse(auth));
}

export function requestSignal(req: FrogBotRequest): AbortSignal | undefined {
  req.signal?.throwIfAborted();

  return req.signal ?? undefined;
}
