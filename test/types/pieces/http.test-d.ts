import { createHttp } from '@frogbotai/piece-http';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const http = createHttp();

const parsed = http.parseUrl({ input: { url: 'https://example.com/path?a=1' }, req });

expectTypeOf<Parameters<typeof http.parseUrl>[0]['input']>().toEqualTypeOf<{
  url: string;
  returnArrays?: boolean | undefined;
}>();

expectTypeOf(parsed).toEqualTypeOf<
  Promise<{
    baseUrl: string;
    domain: string;
    path: string;
    queryParameters: Record<string, string | string[] | null>;
    hash: string;
  }>
>();

const _parseUrlRejectsSendRequestInput = () =>
  // @ts-expect-error parseUrl does not accept sendRequest input
  http.parseUrl({ input: { method: 'GET', url: 'https://example.com' }, req });
