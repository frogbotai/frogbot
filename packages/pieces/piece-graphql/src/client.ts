import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import { connect as connectTls } from 'node:tls';

export type GraphqlResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export type GraphqlRequest = {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body?: string;
  timeout?: number;
  proxy?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
};

export class GraphqlRequestError extends Error {
  response?: GraphqlResponse;

  constructor(message: string, response?: GraphqlResponse, cause?: unknown) {
    super(message, { cause });
    this.name = 'GraphqlRequestError';
    this.response = response;
  }
}

function parseBody(value: string): unknown {
  if (!value) return undefined;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function responseHeaders(headers: NodeJS.Dict<string | string[]>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
      .map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value]),
  );
}

function proxyAuthorization(proxy: NonNullable<GraphqlRequest['proxy']>) {
  if (!proxy.username || !proxy.password) return undefined;

  return `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`;
}

function createProxySocket(request: GraphqlRequest) {
  return new Promise<ReturnType<typeof connectTls>>((resolve, reject) => {
    const proxy = request.proxy!;
    const authorization = proxyAuthorization(proxy);
    const connect = requestHttp({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${request.url.hostname}:${request.url.port || '443'}`,
      headers: {
        host: `${request.url.hostname}:${request.url.port || '443'}`,
        ...(authorization ? { 'proxy-authorization': authorization } : {}),
      },
    });

    connect.once('connect', (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(
          new Error(`Proxy CONNECT failed with ${response.statusCode ?? 'an unknown status'}.`),
        );

        return;
      }

      const secureSocket = connectTls({ socket, servername: request.url.hostname });
      secureSocket.once('secureConnect', () => resolve(secureSocket));
      secureSocket.once('error', reject);
    });
    connect.once('error', reject);
    connect.end();
  });
}

export async function sendGraphqlRequest(request: GraphqlRequest): Promise<GraphqlResponse> {
  const authorization = request.proxy ? proxyAuthorization(request.proxy) : undefined;
  const proxyHttp = request.proxy && request.url.protocol === 'http:';
  const socket =
    request.proxy && request.url.protocol === 'https:'
      ? await createProxySocket(request)
      : undefined;

  const transport = request.url.protocol === 'https:' ? requestHttps : requestHttp;

  return new Promise((resolve, reject) => {
    const outgoing = transport({
      hostname: proxyHttp ? request.proxy!.host : request.url.hostname,
      port: proxyHttp ? request.proxy!.port : request.url.port || undefined,
      method: request.method,
      path: proxyHttp ? request.url.href : `${request.url.pathname}${request.url.search}`,
      headers: {
        ...request.headers,
        ...(proxyHttp && authorization ? { 'proxy-authorization': authorization } : {}),
      },
      ...(socket ? { createConnection: () => socket, agent: false } : {}),
    });

    outgoing.once('response', (incoming) => {
      const chunks: Buffer[] = [];

      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.once('end', () => {
        const response = {
          status: incoming.statusCode ?? 0,
          headers: responseHeaders(incoming.headers),
          body: parseBody(Buffer.concat(chunks).toString()),
        };

        if (response.status < 200 || response.status >= 300) {
          reject(
            new GraphqlRequestError(
              `GraphQL request failed with status ${response.status}: ${JSON.stringify(response.body)}`,
              response,
            ),
          );

          return;
        }

        resolve(response);
      });
    });
    outgoing.once('error', (error) => {
      reject(new GraphqlRequestError(`GraphQL request failed: ${error.message}`, undefined, error));
    });

    if (request.timeout) {
      outgoing.setTimeout(request.timeout * 1000, () => {
        outgoing.destroy(new Error(`Timed out after ${request.timeout} seconds.`));
      });
    }

    outgoing.end(request.body);
  });
}
