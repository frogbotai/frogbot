import { APIError as PayloadAPIError } from 'payload';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  addDataAndFileToRequest,
  addLocalesToRequestFromData,
  APIError,
  type FrogBotRequest,
  headersWithCors,
  type SanitizedCollectionConfig,
} from '../../../../packages/frogbot/src/index.js';

function request(init: RequestInit & { config?: object; data?: object; url?: string }) {
  const { config = {}, data, url = 'https://cms.example.com/api/posts', ...rest } = init;

  return Object.assign(new Request(url, rest), {
    data,
    payload: { config },
  }) as unknown as FrogBotRequest;
}

describe('request helpers', () => {
  it('takes FrogBotRequest, not Payload request types', () => {
    expectTypeOf(addDataAndFileToRequest).parameter(0).toEqualTypeOf<FrogBotRequest>();
    expectTypeOf(addLocalesToRequestFromData).parameter(0).toEqualTypeOf<FrogBotRequest>();
    expectTypeOf(headersWithCors)
      .parameter(0)
      .toEqualTypeOf<{ headers: Headers; req: Partial<FrogBotRequest> }>();
    expectTypeOf<SanitizedCollectionConfig>().toHaveProperty('slug');
  });

  it('re-exports the APIError class', () => {
    const error = new APIError('You have sent too many requests', 429);

    expect(APIError).toBe(PayloadAPIError);
    expect(error.status).toBe(429);
  });

  it('adds JSON body data to the request', async () => {
    const req = request({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hello' }),
    });

    await addDataAndFileToRequest(req);

    expect(req.data).toEqual({ title: 'Hello' });
  });

  it('adds the locale from request data', () => {
    const req = request({
      config: {
        localization: {
          defaultLocale: 'en',
          fallback: true,
          localeCodes: ['en', 'de'],
          locales: [{ code: 'en' }, { code: 'de' }],
        },
      },
      data: { locale: 'de' },
    });

    addLocalesToRequestFromData(req);

    expect(req.locale).toBe('de');
  });

  it('sets CORS headers from the config', () => {
    const req = request({
      config: { cors: ['https://app.example.com'] },
      headers: { Origin: 'https://app.example.com' },
    });

    const headers = headersWithCors({ headers: new Headers(), req });

    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
  });
});
