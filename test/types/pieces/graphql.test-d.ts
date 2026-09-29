import { createGraphql } from '@frogbotai/piece-graphql';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const graphql = createGraphql();

const _response = graphql.sendRequest({
  input: { url: 'https://example.com/graphql', query: '{ frogs { name } }' },
  req,
});

expectTypeOf<Parameters<typeof graphql.sendRequest>[0]['input']>().toEqualTypeOf<{
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'HEAD' | undefined;
  url: string;
  queryParams?:
    Record<string, string | number | boolean | (string | number | boolean)[]> | undefined;
  headers?: Record<string, string> | undefined;
  query: string;
  variables?: Record<string, unknown> | undefined;
  useProxy?: boolean | undefined;
  proxySettings?:
    | { host: string; port: number; username?: string | undefined; password?: string | undefined }
    | undefined;
  timeout?: number | undefined;
  failsafe?: boolean | undefined;
}>();
expectTypeOf<Awaited<typeof _response>['status']>().toEqualTypeOf<number>();
expectTypeOf<Awaited<typeof _response>['headers']>().toEqualTypeOf<Record<string, string>>();
