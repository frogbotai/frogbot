import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { hookEvents, providerKey, setEvaluationAllowed, usageSlug, usersSlug } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const upstreamUrl = 'https://api.typesafe.ai/v1/systemone';

const questions = {
  refunded: {
    type: 'boolean',
    instructions: { prompt: 'Was the refund issued?' },
    criteria: { true: 'Refunded', false: null },
  },
  team: {
    type: 'choice',
    instructions: 'Who owns the request?',
    criteria: { billing: { area: 'refunds' }, support: ['other'] },
  },
  severity: {
    type: 'score',
    instructions: 'How severe?',
    criteria: ['low', 'medium', 'high'],
  },
} as const;

const state = { ticket: ['Customer asked for a refund', { issued: true }] };

const upstreamResult = {
  model: 'jev-1.13.0',
  answers: {
    refunded: { type: 'noul', noul: 0.91 },
    team: {
      type: 'choice',
      choice: 'billing',
      probabilities: { billing: 0.8, support: 0.2 },
      confidence: 0.72,
    },
    severity: {
      type: 'score',
      score: 1.5,
      probabilities: { 0: 0, 1: 0.5, 2: 0.5 },
      confidence: 0.64,
    },
  },
  usage: { input_tokens: 471, output_tokens: 71 },
};

const body = { model: 'typesafe-ai/jev', state, questions };

type UpstreamCall = { url: string; headers: Headers; body: Record<string, unknown> };

describe('booted TypeSafe evaluation', () => {
  let booted: BootedFrogBot;
  let originalFetch: typeof fetch;
  let upstreamCalls: UpstreamCall[] = [];
  let upstreamResponses: Response[] = [];

  async function usageRows(requestId?: string) {
    return (
      await booted.frogbot.find({
        collection: usageSlug,
        where: requestId ? { requestId: { equals: requestId } } : {},
        depth: 0,
        overrideAccess: true,
      })
    ).docs;
  }

  async function waitForUsage(requestId: string) {
    let rows: Awaited<ReturnType<typeof usageRows>> = [];

    await vi.waitFor(
      async () => {
        rows = await usageRows(requestId);

        expect(rows).toHaveLength(1);
      },
      { timeout: 5_000, interval: 25 },
    );

    return rows[0]!;
  }

  async function createUser() {
    return booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'evaluator@frogbot.local', password: 'local-test-password' },
      overrideAccess: true,
    });
  }

  async function login() {
    const response = await booted.restClient.post<{ token: string }>(`/api/${usersSlug}/login`, {
      email: 'evaluator@frogbot.local',
      password: 'local-test-password',
    });

    expect(response.status).toBe(200);

    return { headers: { Authorization: `JWT ${response.body.token}` } };
  }

  beforeAll(async () => {
    originalFetch = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url !== upstreamUrl) return originalFetch(input, init);

      upstreamCalls.push({
        url,
        headers: new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined),
        ),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });

      const submitted = upstreamCalls.at(-1)!.body;
      const requested = submitted.questions as Record<string, unknown>;
      const answers = Object.fromEntries(
        Object.entries(upstreamResult.answers).filter(([id]) => Object.hasOwn(requested, id)),
      );

      return (
        upstreamResponses.shift() ??
        Response.json({ ...upstreamResult, answers }, { headers: { 'x-private': 'upstream-only' } })
      );
    };

    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;

    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    hookEvents.length = 0;
    upstreamCalls = [];
    upstreamResponses = [];
    setEvaluationAllowed(true);
  });

  afterEach(async () => {
    for (const event of hookEvents.filter(
      (entry) => entry.phase === 'afterOperation' && entry.userId !== undefined,
    )) {
      await waitForUsage(event.requestId);
    }

    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('evaluates local aliases and both public IDs through the real TypeSafe wire', async () => {
    const alias = await booted.frogbot.evaluate({
      model: 'judge' as 'typesafe-ai/jev',
      state,
      questions,
      maxRetries: 0,
    });

    const canonical = await booted.frogbot.evaluate({
      model: 'typesafe-ai/jev-latest',
      state: 'A refund was issued.',
      questions: { refunded: questions.refunded },
      maxRetries: 0,
    });

    expect(alias.answers).toEqual({
      refunded: { type: 'boolean', probability: 0.91 },
      team: { type: 'choice', choice: 'billing', probabilities: { billing: 0.8, support: 0.2 } },
      severity: { type: 'score', score: 1.5, probabilities: { 0: 0, 1: 0.5, 2: 0.5 } },
    });
    expect(alias.rounding).toEqual({ probabilityDecimals: 2, scoreDecimals: 2 });
    expect(alias.providerMetadata).toEqual({
      typesafe: { confidence: { team: 0.72, severity: 0.64 } },
    });
    expect(alias.usage).toMatchObject({ inputTokens: 471, outputTokens: 71, totalTokens: 542 });
    expect(alias.response.modelId).toBe('jev-1.13.0');
    expect(alias.response.timestamp).toBeInstanceOf(Date);
    expect(canonical.answers.refunded.probability).toBe(0.91);
    expect(upstreamCalls).toHaveLength(2);
    expect(upstreamCalls.map((call) => call.url)).toEqual([upstreamUrl, upstreamUrl]);
    expect(upstreamCalls.map((call) => call.body.model)).toEqual(['jev-latest', 'jev-latest']);
    expect(upstreamCalls[0].body).toMatchObject({
      state,
      questions: {
        refunded: { type: 'noul' },
        team: { type: 'choice' },
        severity: { type: 'score' },
      },
    });
    expect(upstreamCalls[0].headers.get('authorization')).toBe(`Bearer ${providerKey}`);
    expect(await usageRows()).toHaveLength(0);
    expect(hookEvents.map((event) => event.phase)).toEqual([
      'beforeOperation',
      'beforeUpstream',
      'afterUpstream',
      'afterOperation',
      'beforeOperation',
      'beforeUpstream',
      'afterUpstream',
      'afterOperation',
    ]);
    expect(hookEvents[2].usage).toEqual({ inputTokens: 471, outputTokens: 71, totalTokens: 542 });
    expect(hookEvents[3].usage).toEqual(hookEvents[2].usage);
    expect(hookEvents[3].model).toBe('typesafe-ai/jev');
    expect(hookEvents[3].requestId).toBe(hookEvents[0].requestId);
  });

  it('authenticates HTTP evaluation, returns the public envelope, and saves one priced usage row', async () => {
    const user = await createUser();
    const auth = await login();

    const response = await booted.restClient.post('/api/v1/evaluate', body, auth);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      model: 'typesafe-ai/jev-1.13.0',
      answers: {
        refunded: { type: 'boolean', probability: 0.91 },
        team: { type: 'choice', choice: 'billing', probabilities: { billing: 0.8, support: 0.2 } },
        severity: { type: 'score', score: 1.5, probabilities: { 0: 0, 1: 0.5, 2: 0.5 } },
      },
      usage: { inputTokens: 471, outputTokens: 71 },
      providerMetadata: { typesafe: { confidence: { team: 0.72, severity: 0.64 } } },
    });
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0].body.model).toBe('jev-latest');
    expect(upstreamCalls[0].headers.get('authorization')).toBe(`Bearer ${providerKey}`);
    expect([...upstreamCalls[0].headers.values()]).not.toContain(auth.headers.Authorization);
    expect(JSON.stringify(upstreamCalls[0].body)).not.toContain(auth.headers.Authorization);
    expect(hookEvents.map((event) => event.phase)).toEqual([
      'beforeOperation',
      'beforeUpstream',
      'afterUpstream',
      'afterOperation',
    ]);
    expect(hookEvents.every((event) => String(event.userId) === String(user.id))).toBe(true);

    const row = await waitForUsage(hookEvents[0].requestId);

    expect(row).toMatchObject({
      operation: 'evaluate',
      model: 'typesafe-ai/jev',
      inputTokens: 471,
      outputTokens: 71,
      totalTokens: 542,
      costUSD: (471 * 0.042) / 1_000_000,
      user: user.id,
    });
    expect(hookEvents[3].usage).toEqual({ inputTokens: 471, outputTokens: 71, totalTokens: 542 });
    expect(await usageRows()).toHaveLength(1);
  });

  it('saves request-bound local evaluation usage once under the requested model', async () => {
    const user = await createUser();
    const req = await booted.frogbot.createRequest({ user });

    const result = await booted.frogbot.evaluate({
      model: 'typesafe-ai/jev-latest',
      state,
      questions: { refunded: questions.refunded },
      req,
      maxRetries: 0,
    });

    expect(result.answers.refunded.probability).toBe(0.91);
    expect(upstreamCalls).toHaveLength(1);
    expect(hookEvents.map((event) => event.phase)).toEqual([
      'beforeOperation',
      'beforeUpstream',
      'afterUpstream',
      'afterOperation',
    ]);
    expect(hookEvents.every((event) => String(event.userId) === String(user.id))).toBe(true);

    const row = await waitForUsage(hookEvents[0].requestId);

    expect(row).toMatchObject({
      operation: 'evaluate',
      model: 'typesafe-ai/jev-latest',
      inputTokens: 471,
      outputTokens: 71,
      totalTokens: 542,
      costUSD: (471 * 0.042) / 1_000_000,
      user: user.id,
    });
    expect(await usageRows()).toHaveLength(1);
  });

  it('denies request-bound evaluation access before the provider is called', async () => {
    const user = await createUser();
    const req = await booted.frogbot.createRequest({ user });

    setEvaluationAllowed(false);

    await expect(
      booted.frogbot.evaluate({ model: 'typesafe-ai/jev', state, questions, req }),
    ).rejects.toThrow('Access denied for AI evaluate');

    expect(upstreamCalls).toHaveLength(0);
    expect(hookEvents).toHaveLength(0);
  });

  it('permits explicit local access override', async () => {
    const user = await createUser();
    const req = await booted.frogbot.createRequest({ user });

    setEvaluationAllowed(false);

    const trusted = await booted.frogbot.evaluate({
      model: 'typesafe-ai/jev',
      state,
      questions,
      req,
      overrideAccess: true,
    });

    expect(trusted.answers.refunded.probability).toBe(0.91);
    expect(upstreamCalls).toHaveLength(1);
    expect(hookEvents.map((event) => event.phase)).toEqual([
      'beforeOperation',
      'beforeUpstream',
      'afterUpstream',
      'afterOperation',
    ]);
  });

  it('enforces model policy on a local router alias before the provider is called', async () => {
    const user = await createUser();
    const restrictedUser = await booted.frogbot.update({
      collection: usersSlug,
      id: user.id,
      data: { modelAccess: 'selected', models: ['typesafe-ai/jev-latest'] },
      overrideAccess: true,
    });

    const req = await booted.frogbot.createRequest({ user: restrictedUser });

    await expect(
      booted.frogbot.evaluate({
        model: 'judge' as 'typesafe-ai/jev',
        state,
        questions,
        req,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'model_not_allowed' });

    expect(upstreamCalls).toHaveLength(0);
    expect(hookEvents).toHaveLength(0);
  });

  it('rejects unauthenticated HTTP evaluation before upstream', async () => {
    const response = await booted.restClient.post('/api/v1/evaluate', body);

    expect(response.status).toBe(401);
    expect(upstreamCalls).toHaveLength(0);
    expect(hookEvents).toHaveLength(0);
  });

  it('rejects HTTP evaluation without evaluation access before upstream', async () => {
    await createUser();

    const auth = await login();

    setEvaluationAllowed(false);

    const response = await booted.restClient.post('/api/v1/evaluate', body, auth);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { type: 'permission_error' } });
    expect(upstreamCalls).toHaveLength(0);
    expect(hookEvents).toHaveLength(0);
  });

  it('rejects HTTP evaluation without model-policy access before upstream', async () => {
    const user = await createUser();

    await booted.frogbot.update({
      collection: usersSlug,
      id: user.id,
      data: { modelAccess: 'selected', models: ['typesafe-ai/jev-latest'] },
      overrideAccess: true,
    });

    const auth = await login();
    const response = await booted.restClient.post('/api/v1/evaluate', body, auth);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { type: 'model_not_allowed' } });
    expect(upstreamCalls).toHaveLength(0);
    expect(hookEvents).toHaveLength(0);
    expect(await usageRows()).toHaveLength(0);
  });

  it('rejects unknown evaluation models before contacting TypeSafe', async () => {
    await expect(
      booted.frogbot.evaluate({
        model: 'typesafe-ai/unknown' as 'typesafe-ai/jev',
        state,
        questions,
        maxRetries: 0,
      }),
    ).rejects.toThrow();

    expect(upstreamCalls).toHaveLength(0);
  });

  it('rejects invalid score limits before contacting TypeSafe', async () => {
    await expect(
      booted.frogbot.evaluate({
        model: 'typesafe-ai/jev',
        state,
        questions: {
          severity: { type: 'score', instructions: 'Priority?', criteria: Array(11).fill('level') },
        },
        maxRetries: 0,
      }),
    ).rejects.toThrow();

    expect(upstreamCalls).toHaveLength(0);
  });

  it('reports a provider 400 failure and finishes once', async () => {
    upstreamResponses.push(Response.json({ error: 'invalid state' }, { status: 400 }));

    await expect(
      booted.frogbot.evaluate({ model: 'typesafe-ai/jev', state, questions, maxRetries: 0 }),
    ).rejects.toThrow();

    expect(upstreamCalls).toHaveLength(1);
    expect(hookEvents.map((event) => event.phase)).toEqual([
      'beforeOperation',
      'beforeUpstream',
      'afterError',
      'afterOperation',
    ]);
    expect(hookEvents[2].error).toBeDefined();
    expect(hookEvents[3].error).toBeDefined();
  });

  it('rejects malformed TypeSafe answers after upstream success and finalizes with error', async () => {
    upstreamResponses.push(
      Response.json({
        model: 'jev-1.13.0',
        answers: { refunded: { type: 'noul', noul: 3 } },
        usage: { input_tokens: 123, output_tokens: 7 },
      }),
    );

    await expect(
      booted.frogbot.evaluate({
        model: 'typesafe-ai/jev',
        state,
        questions: { refunded: questions.refunded },
        maxRetries: 0,
      }),
    ).rejects.toThrow();

    expect(upstreamCalls).toHaveLength(1);
    expect(hookEvents.filter((event) => event.phase === 'afterOperation')).toHaveLength(1);
    expect(hookEvents.at(-1)?.error).toBeDefined();
    expect(hookEvents.map((event) => event.phase)).toEqual([
      'beforeOperation',
      'beforeUpstream',
      'afterUpstream',
      'afterOperation',
    ]);
    expect(hookEvents[2].usage).toEqual({ inputTokens: 123, outputTokens: 7, totalTokens: 130 });
    expect(hookEvents[3].usage).toEqual(hookEvents[2].usage);
  });

  it('returns a gateway error for a failed authenticated TypeSafe request', async () => {
    await createUser();

    const auth = await login();

    upstreamResponses.push(Response.json({ error: 'invalid state' }, { status: 400 }));

    const response = await booted.restClient.post('/api/v1/evaluate', body, auth);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { type: 'invalid_request_error' } });
    expect(upstreamCalls).toHaveLength(1);
    expect(hookEvents.map((event) => event.phase)).toEqual([
      'beforeOperation',
      'beforeUpstream',
      'afterError',
      'afterOperation',
    ]);

    const row = await waitForUsage(hookEvents[0].requestId);

    expect(row).toMatchObject({ operation: 'evaluate', costUSD: 0 });
  });

  it('retries upstream 429 once with the SDK retry control', async () => {
    upstreamResponses.push(
      Response.json({ error: 'rate limited' }, { status: 429 }),
      Response.json({ error: 'rate limited' }, { status: 429 }),
    );

    await expect(
      booted.frogbot.evaluate({
        model: 'typesafe-ai/jev',
        state,
        questions: { refunded: questions.refunded },
        maxRetries: 1,
      }),
    ).rejects.toThrow();

    expect(upstreamCalls).toHaveLength(2);
    expect(upstreamCalls.every((call) => call.body.model === 'jev-latest')).toBe(true);
    expect(hookEvents.map((event) => event.phase)).toEqual([
      'beforeOperation',
      'beforeUpstream',
      'afterError',
      'beforeUpstream',
      'afterError',
      'afterOperation',
    ]);
  });
});
