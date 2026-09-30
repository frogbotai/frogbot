import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPHQL_POST } from '@frogbotai/next/routes';
import { executeAuthStrategies } from 'payload';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import config, { strategyCalls } from './config.js';
import type { User } from './frogbot-types.js';
import {
  brokenHeader,
  brokenStrategyName,
  headerTokenStrategyName,
  strategyFailureMessage,
  strategyHeader,
  testUserCode,
  tokenHeader,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type MeBody = {
  user: User | null;
};

function responseHeaders(headers: Headers) {
  const comparable = new Headers(headers);

  comparable.delete('date');

  return Object.fromEntries(comparable);
}

describe('auth strategies', () => {
  let booted: BootedFrogBot;
  let user: User;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    user = await booted.frogbot.create({
      collection: usersSlug,
      data: { code: testUserCode, email: null },
    });

    strategyCalls.length = 0;
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    await booted.frogbot.delete({ collection: usersSlug, id: user.id });
  });

  it('GET /api/users/me authenticates a header token with frogbot.find', async () => {
    const response = await booted.restClient.get<MeBody>(`/api/${usersSlug}/me`, {
      headers: { [tokenHeader]: testUserCode },
    });

    expect(response.status).toBe(200);
    expect(response.body.user?.id).toBe(user.id);
    expect(response.body.user?.email).toBeNull();
  });

  it('GET /api/users/me returns an anonymous user without a token', async () => {
    const response = await booted.restClient.get<MeBody>(`/api/${usersSlug}/me`);

    expect(response.status).toBe(200);
    expect(response.body.user).toBeNull();
  });

  it('provides req.frogbot inside a strategy during an HTTP request', async () => {
    const response = await booted.restClient.get<MeBody>(`/api/${usersSlug}/me`, {
      headers: { [tokenHeader]: testUserCode },
    });

    expect(response.body.user?.id).toBe(user.id);
    expect(strategyCalls).toHaveLength(1);
    expect(strategyCalls[0]!.frogbot).toBe(booted.frogbot);
    expect(strategyCalls[0]!.requestFrogBot).toBe(booted.frogbot);
    expect(strategyCalls[0]).not.toHaveProperty('payload');
  });

  it('POST /api/graphql authenticates a custom header strategy with isGraphQL', async () => {
    const graphQLPost = GRAPHQL_POST(config);

    const response = await graphQLPost(
      new Request(`${booted.baseUrl}/api/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [tokenHeader]: testUserCode },
        body: JSON.stringify({ query: '{ meUser { user { id email } } }' }),
      }),
    );
    const body = (await response.json()) as {
      data: { meUser: { user: unknown } };
      errors?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data.meUser.user).toEqual({ id: user.id, email: null });
    expect(strategyCalls).toHaveLength(1);
    expect(strategyCalls[0]!.isGraphQL).toBe(true);
    expect(strategyCalls[0]!.requestFrogBot).toBe(booted.frogbot);
  });

  it('GET /api/users/me logs a broken strategy and authenticates with the next strategy', async () => {
    const errorLog = vi.spyOn(booted.frogbot.logger, 'error');

    const response = await booted.restClient.get<MeBody>(`/api/${usersSlug}/me`, {
      headers: { [brokenHeader]: '1', [tokenHeader]: testUserCode },
    });

    const frogbotErrors = errorLog.mock.calls.filter(
      ([, message]) =>
        message === `[frogbot] auth strategy '${brokenStrategyName}' on '${usersSlug}' failed`,
    );

    expect(frogbotErrors).toHaveLength(1);
    expect(frogbotErrors[0]?.[0]).toEqual({
      err: expect.objectContaining({ message: strategyFailureMessage }),
    });
    expect(response.status).toBe(200);
    expect(response.body.user?.id).toBe(user.id);
    expect(response.headers.get(strategyHeader)).toBe(headerTokenStrategyName);
  });

  it('GET /api/users/me hides strategy failures in the normal anonymous response', async () => {
    const anonymous = await booted.restClient.get<MeBody>(`/api/${usersSlug}/me`);

    const broken = await booted.restClient.get<MeBody>(`/api/${usersSlug}/me`, {
      headers: { [brokenHeader]: '1' },
    });

    expect(broken.status).toBe(anonymous.status);
    expect(broken.body).toEqual(anonymous.body);
    expect(responseHeaders(broken.headers)).toEqual(responseHeaders(anonymous.headers));
    expect(JSON.stringify(broken.body)).not.toContain(strategyFailureMessage);
    expect(JSON.stringify(responseHeaders(broken.headers))).not.toContain(strategyFailureMessage);
  });

  it('GET /api/users/me hides strategy failures in the normal authenticated response', async () => {
    const authenticated = await booted.restClient.get<MeBody>(`/api/${usersSlug}/me`, {
      headers: { [tokenHeader]: testUserCode },
    });

    const broken = await booted.restClient.get<MeBody>(`/api/${usersSlug}/me`, {
      headers: { [brokenHeader]: '1', [tokenHeader]: testUserCode },
    });

    expect(authenticated.body.user?.id).toBe(user.id);
    expect(broken.status).toBe(authenticated.status);
    expect(broken.body).toEqual(authenticated.body);
    expect(responseHeaders(broken.headers)).toEqual(responseHeaders(authenticated.headers));
    expect(JSON.stringify(broken.body)).not.toContain(strategyFailureMessage);
    expect(JSON.stringify(responseHeaders(broken.headers))).not.toContain(strategyFailureMessage);
  });

  it('authenticates a header token through the engine without a request', async () => {
    const result = await executeAuthStrategies({
      canSetHeaders: false,
      headers: new Headers({ [tokenHeader]: testUserCode }),
      payload: booted.payload,
    });

    expect(result.user?.id).toBe(user.id);
    expect(result.user?.email).toBeNull();
  });
});
