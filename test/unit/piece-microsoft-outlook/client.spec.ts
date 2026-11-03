import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  '@frogbotai/piece-microsoft',
  () => import('../../../packages/pieces/piece-microsoft/src/index.js'),
);

import {
  createMicrosoftOutlook,
  defineMicrosoftOutlook,
  MicrosoftGraphError,
} from '../../../packages/pieces/piece-microsoft-outlook/src/index.js';
import { appOnly, calls, delegated, json, req, stubGraph } from './fixtures.js';

const id = z.object({ id: z.string() });

function client(credential: unknown = delegated, factory = createMicrosoftOutlook) {
  return factory({}).client({ req: req(credential) });
}

function tokenRoute(expiresIn = 3600) {
  let issued = 0;

  return (url: string) => {
    if (url.includes('/oauth2/v2.0/token')) {
      issued += 1;

      return json({ access_token: `app-token-${issued}`, expires_in: expiresIn });
    }

    return json({ id: 'message' });
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Outlook Graph client', () => {
  it('calls /me with the linked account token', async () => {
    stubGraph(() => json({ id: 'message' }));

    const outlook = await client();

    await expect(outlook.request(`${outlook.mailbox}/messages/m1`, id)).resolves.toEqual({
      id: 'message',
    });

    expect(calls[0]?.url).toBe('https://graph.microsoft.com/v1.0/me/messages/m1');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer user-token');
  });

  it("retries a 429 three times after Retry-After, then throws Graph's message", async () => {
    stubGraph(() =>
      json({ error: { code: 'TooManyRequests', message: 'Slow down.' } }, 429, {
        'retry-after': '0',
      }),
    );

    const error = await (await client()).request('/me/messages', id).catch((caught) => caught);

    expect(calls).toHaveLength(4);
    expect(error).toBeInstanceOf(MicrosoftGraphError);
    expect(error).toMatchObject({
      status: 429,
      code: 'TooManyRequests',
      message: 'Microsoft Graph request failed (429 TooManyRequests): Slow down.',
    });
  });

  it('succeeds when a 503 clears before the retries run out', async () => {
    let attempt = 0;

    stubGraph(() =>
      ++attempt < 3
        ? json({ error: { code: 'ServiceUnavailable', message: 'Busy.' } }, 503, {
            'retry-after': '0',
          })
        : json({ id: 'message' }),
    );

    await expect((await client()).request('/me/messages/m1', id)).resolves.toEqual({
      id: 'message',
    });
    expect(calls).toHaveLength(3);
  });

  it('stops waiting for Retry-After when the request aborts', async () => {
    vi.useFakeTimers();

    stubGraph(() =>
      json({ error: { code: 'TooManyRequests', message: 'Slow down.' } }, 429, {
        'retry-after': '60',
      }),
    );

    const controller = new AbortController();
    const pending = (await client())
      .request('/me/messages', id, { signal: controller.signal })
      .catch((caught) => caught);

    await vi.advanceTimersByTimeAsync(1000);
    controller.abort(new Error('cancelled'));

    await expect(pending).resolves.toMatchObject({ message: 'cancelled' });
    expect(calls).toHaveLength(1);
  });

  it('keeps errors that are not throttling, without retrying', async () => {
    stubGraph(() => json({ error: { code: 'ErrorItemNotFound', message: 'Not found.' } }, 404));

    await expect((await client()).request('/me/messages/x', id)).rejects.toMatchObject({
      status: 404,
      code: 'ErrorItemNotFound',
    });
    expect(calls).toHaveLength(1);
  });

  it('refuses URLs off the configured Graph origin, including a US cloud link on commercial', async () => {
    stubGraph(() => json({ value: [] }));

    const outlook = await client();

    for (const target of [
      'https://graph.microsoft.us/v1.0/me/messages',
      'https://evil.test/v1.0/me/messages',
      'https://user:pass@graph.microsoft.com/v1.0/me/messages',
      'https://graph.microsoft.com/beta/me/messages',
      '/../beta/me',
    ]) {
      await expect(outlook.page(target, id)).rejects.toThrow(
        'must stay within the configured cloud',
      );
    }

    expect(calls).toHaveLength(0);
  });

  it('pages through @odata.nextLink and returns null on the last page', async () => {
    stubGraph((call) =>
      call.url.includes('skip=1')
        ? json({ value: [{ id: 'b' }] })
        : json({
            value: [{ id: 'a' }],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?skip=1',
          }),
    );

    const outlook = await client();
    const first = await outlook.page('/me/messages', id, { query: { $top: 1 } });
    const last = await outlook.page(first.nextLink!, id);

    expect(first).toEqual({
      value: [{ id: 'a' }],
      nextLink: 'https://graph.microsoft.com/v1.0/me/messages?skip=1',
    });
    expect(last).toEqual({ value: [{ id: 'b' }], nextLink: null });
    expect(calls[0]?.url).toBe('https://graph.microsoft.com/v1.0/me/messages?%24top=1');
  });

  it('uses the US Government Graph origin for that cloud', async () => {
    stubGraph(() => json({ id: 'message' }));

    const outlook = await client(
      { ...delegated, cloud: 'login.microsoftonline.us' },
      defineMicrosoftOutlook({ cloud: 'usGovernment' }),
    );

    await outlook.request('/me/messages/m1', id);

    expect(calls[0]?.url).toBe('https://graph.microsoft.us/v1.0/me/messages/m1');
  });
});

describe('Outlook app-only mailbox', () => {
  it('signs in with client credentials and calls /users/<mailbox>', async () => {
    stubGraph((call) => tokenRoute()(call.url));

    const outlook = await client(appOnly);

    await outlook.request(`${outlook.mailbox}/messages/m1`, id);

    expect(outlook.mailbox).toBe('/users/sales%40acme.com');
    expect(calls[0]).toMatchObject({
      url: 'https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token',
      method: 'POST',
    });
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      grant_type: 'client_credentials',
      client_id: 'app-id',
      client_secret: 'app-secret',
      scope: 'https://graph.microsoft.com/.default',
    });
    expect(calls[1]?.url).toBe(
      'https://graph.microsoft.com/v1.0/users/sales%40acme.com/messages/m1',
    );
    expect(calls[1]?.headers.get('authorization')).toBe('Bearer app-token-1');
  });

  it('reuses one token across clients the factory builds', async () => {
    const route = tokenRoute();
    stubGraph((call) => route(call.url));

    const factory = defineMicrosoftOutlook();
    const first = await client(appOnly, factory);
    const second = await client(appOnly, factory);

    expect(first).not.toBe(second);

    await first.request('/users/sales%40acme.com/messages/a', id);
    await second.request('/users/sales%40acme.com/messages/b', id);

    expect(calls.filter((call) => call.url.includes('/token'))).toHaveLength(1);
    expect(calls.at(-1)?.headers.get('authorization')).toBe('Bearer app-token-1');
  });

  it('fetches a new token within 5 minutes of expiry', async () => {
    vi.useFakeTimers();

    const route = tokenRoute(3600);
    stubGraph((call) => route(call.url));

    const outlook = await client(appOnly, defineMicrosoftOutlook());

    await outlook.request('/users/sales%40acme.com/messages/a', id);
    vi.advanceTimersByTime(54 * 60 * 1000);
    await outlook.request('/users/sales%40acme.com/messages/b', id);
    vi.advanceTimersByTime(2 * 60 * 1000);
    await outlook.request('/users/sales%40acme.com/messages/c', id);

    expect(calls.filter((call) => call.url.includes('/token'))).toHaveLength(2);
    expect(calls.at(-1)?.headers.get('authorization')).toBe('Bearer app-token-2');
  });

  it('does not cache a failed sign-in', async () => {
    let fail = true;

    stubGraph((call) => {
      if (call.url.includes('/token') && fail) {
        fail = false;

        return json({ error: 'invalid_client', error_description: 'Bad secret.' }, 401);
      }

      return tokenRoute()(call.url);
    });

    const outlook = await client(appOnly, defineMicrosoftOutlook());

    await expect(outlook.request('/users/sales%40acme.com/messages/a', id)).rejects.toThrow(
      'Microsoft app-only sign-in failed (401): Bad secret.',
    );
    await expect(outlook.request('/users/sales%40acme.com/messages/a', id)).resolves.toEqual({
      id: 'message',
    });
  });

  it('needs a directory tenant and all three app fields', async () => {
    stubGraph(() => json({}));

    await expect(client({ ...appOnly, tenantId: 'common' })).rejects.toThrow(
      'needs your directory tenant ID',
    );
    await expect(client({ ...appOnly, mailbox: undefined })).rejects.toThrow(
      'clientId, clientSecret and mailbox',
    );
  });

  it('authorizes custom API calls with the app token', async () => {
    stubGraph((call) => tokenRoute()(call.url));

    const result = await createMicrosoftOutlook({}).customApiCall({
      input: { method: 'GET', path: '/users/sales@acme.com/messages' },
      req: req(appOnly),
    });

    expect(result).toMatchObject({ status: 200 });
    expect(calls.at(-1)?.headers.get('authorization')).toBe('Bearer app-token-1');
  });
});
