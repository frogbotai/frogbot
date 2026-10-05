import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getApiKeyPrefix, hashApiKeyToken } from '@frogbotai/plugin-api-keys';
import { ensureAutonumbers } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import {
  actorToolName,
  apiKeyHeader,
  apiKeysSlug,
  apiKeyToken,
  customActorCredentials,
  customStrategyHeader,
  customStrategyName,
  mcpEndpoint,
  postsSlug,
  strategyFailureMessage,
  testCredentials,
  ticketsSlug,
  unknownApiKeyToken,
  usersSlug,
} from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const configuredTools = [
  'createPosts',
  'updatePosts',
  'findPosts',
  'createTickets',
  'findTickets',
  actorToolName,
];

type MeBody = {
  user: { id: string | number; email: string; _strategy: string } | null;
};

type InputSchema = {
  type?: string | string[];
  description?: string;
  minimum?: number;
  maximum?: number;
  anyOf?: InputSchema[];
  properties?: Record<string, InputSchema>;
};

type ToolsListBody = {
  jsonrpc: '2.0';
  id: number;
  result: { tools: Array<{ name: string; inputSchema: InputSchema }> };
};

type ToolCallBody = {
  jsonrpc: '2.0';
  id: number;
  result: { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
};

function parseMcpResponse<T>(body: T | string): T {
  const json =
    typeof body === 'string'
      ? (body
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice(6) ?? body)
      : JSON.stringify(body);

  return JSON.parse(json) as T;
}

function responseHeaders(headers: Headers) {
  const comparable = new Headers(headers);

  comparable.delete('date');

  return Object.fromEntries(comparable);
}

describe('MCP plugin integration', () => {
  let booted: BootedFrogBot;
  let ownerId: string | number;
  let customActorId: string | number;
  let apiKeyId: string | number;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    await ensureAutonumbers(booted.frogbot);

    const owner = await booted.frogbot.create({
      collection: usersSlug,
      data: testCredentials,
      overrideAccess: true,
    });

    const customActor = await booted.frogbot.create({
      collection: usersSlug,
      data: customActorCredentials,
      overrideAccess: true,
    });

    const apiKey = await booted.frogbot.create({
      collection: apiKeysSlug,
      data: {
        name: 'MCP integration',
        owner: owner.id,
        prefix: getApiKeyPrefix(apiKeyToken),
        tokenHash: hashApiKeyToken(apiKeyToken),
      },
      overrideAccess: true,
    });

    ownerId = owner.id;
    customActorId = customActor.id;
    apiKeyId = apiKey.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    await clearAndSeed(booted.frogbot, 'empty');
  });

  function listTools(token: string, headers: Record<string, string> = {}) {
    return booted.restClient.post<ToolsListBody | string>(
      mcpEndpoint,
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      {
        headers: {
          accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`,
          ...headers,
        },
      },
    );
  }

  function callTool(name: string, args: Record<string, unknown>) {
    return booted.restClient.post<ToolCallBody | string>(
      mcpEndpoint,
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } },
      {
        headers: {
          accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${apiKeyToken}`,
        },
      },
    );
  }

  it('POST /api/mcp lists configured tools with a persisted API key', async () => {
    const response = await listTools(apiKeyToken);

    expect(response.status).toBe(200);

    const body = parseMcpResponse<ToolsListBody>(response.body);

    expect(body).toMatchObject({ jsonrpc: '2.0', id: 1 });
    expect(body.result.tools.map(({ name }) => name)).toEqual(configuredTools);
  });

  it('POST /api/mcp describes money fields in the create and update tool schemas', async () => {
    const { tools } = parseMcpResponse<ToolsListBody>((await listTools(apiKeyToken)).body).result;

    for (const name of ['createPosts', 'updatePosts']) {
      const properties = tools.find((tool) => tool.name === name)?.inputSchema.properties ?? {};
      const price = properties.price ?? {};
      const wholesale = properties.cost?.properties?.wholesale ?? {};
      const number = price.anyOf?.find(({ type }) => type === 'number') ?? price;

      expect(price.description).toBe(
        'Retail price (decimal amount in USD, in whole units, not minor units such as cents)',
      );
      expect(number.minimum).toBe(0);
      expect(wholesale.description).toBe(
        'Decimal amount in EUR, in whole units, not minor units such as cents',
      );
    }
  });

  it('POST /api/mcp converts money field schemas without the permissive fallback', async () => {
    const warn = vi.spyOn(console, 'warn');

    const response = await listTools(apiKeyToken);

    expect(response.status).toBe(200);
    expect(warn.mock.calls.flat().map(String).join('\n')).not.toContain('Schema conversion failed');
  });

  it('POST /api/mcp rejects a negative money amount without saving', async () => {
    const response = await callTool('createPosts', { title: 'Negative', price: -3 });

    expect(response.status).toBe(200);

    const { result } = parseMcpResponse<ToolCallBody>(response.body);

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: expect.stringMatching(/^MCP error -32602: Input validation error: .*>=0 at price$/),
      },
    ]);

    const { totalDocs } = await booted.frogbot.count({
      collection: postsSlug,
      overrideAccess: true,
    });

    expect(totalDocs).toBe(0);
  });

  it('POST /api/mcp saves a decimal money amount', async () => {
    const response = await callTool('createPosts', { title: 'Decimal', price: 12.5 });

    expect(response.status).toBe(200);
    expect(parseMcpResponse<ToolCallBody>(response.body).result.isError).not.toBe(true);

    const { docs } = await booted.frogbot.find({ collection: postsSlug, overrideAccess: true });

    expect(docs.map(({ title, price }) => ({ title, price }))).toEqual([
      { title: 'Decimal', price: 12.5 },
    ]);
  });

  it('POST /api/mcp describes rating and duration fields as whole numbers', async () => {
    const { tools } = parseMcpResponse<ToolsListBody>((await listTools(apiKeyToken)).body).result;

    for (const name of ['createPosts', 'updatePosts']) {
      const properties = tools.find((tool) => tool.name === name)?.inputSchema.properties ?? {};
      const score = properties.score ?? {};
      const timeSpent = properties.timeSpent ?? {};
      const scoreNumber = score.anyOf?.find(({ type }) => type === 'integer') ?? score;
      const timeSpentNumber = timeSpent.anyOf?.find(({ type }) => type === 'integer') ?? timeSpent;

      expect(score.description).toBe('Whole-number rating from 1 to 5');
      expect(scoreNumber).toMatchObject({ type: 'integer', minimum: 1, maximum: 5 });
      expect(timeSpent.description).toBe(
        'Duration in whole seconds, for example 5400 for 1 hour 30 minutes',
      );
      expect(timeSpentNumber).toMatchObject({ type: 'integer' });
    }
  });

  it('POST /api/mcp rejects a fractional rating without saving', async () => {
    const response = await callTool('createPosts', { title: 'Half star', score: 3.5 });

    expect(response.status).toBe(200);

    const { result } = parseMcpResponse<ToolCallBody>(response.body);

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'MCP error -32602: Input validation error: Invalid arguments for tool createPosts: Invalid input at score',
      },
    ]);

    const { totalDocs } = await booted.frogbot.count({
      collection: postsSlug,
      overrideAccess: true,
    });

    expect(totalDocs).toBe(0);
  });

  it('POST /api/mcp saves a whole rating and duration', async () => {
    const response = await callTool('createPosts', { title: 'Rated', score: 3, timeSpent: 5400 });

    expect(response.status).toBe(200);
    expect(parseMcpResponse<ToolCallBody>(response.body).result.isError).not.toBe(true);

    const { docs } = await booted.frogbot.find({ collection: postsSlug, overrideAccess: true });

    expect(docs.map(({ title, score, timeSpent }) => ({ title, score, timeSpent }))).toEqual([
      { title: 'Rated', score: 3, timeSpent: 5400 },
    ]);
  });

  it('POST /api/mcp describes created by, last modified by and autonumber fields as set by FrogBot', async () => {
    const { tools } = parseMcpResponse<ToolsListBody>((await listTools(apiKeyToken)).body).result;
    const properties = tools.find(({ name }) => name === 'createTickets')?.inputSchema.properties;
    const number = properties?.number ?? {};

    expect(number.description).toBe(
      'Unique number set by FrogBot when the record is created; read-only',
    );
    expect(number.anyOf?.find(({ type }) => type === 'integer') ?? number).toMatchObject({
      type: 'integer',
    });
    expect(properties?.createdBy?.description).toBe(
      'Set by FrogBot to the user who created the record; read-only',
    );
    expect(properties?.lastModifiedBy?.description).toBe(
      'Set by FrogBot to the user who last saved the record; read-only',
    );
  });

  it('POST /api/mcp create drops a sent number and creator and records the key owner', async () => {
    const response = await callTool('createTickets', {
      title: 'Printer',
      number: 99,
      createdBy: customActorId,
      lastModifiedBy: customActorId,
    });

    expect(response.status).toBe(200);
    expect(parseMcpResponse<ToolCallBody>(response.body).result.isError).not.toBe(true);

    const { docs } = await booted.frogbot.find({
      collection: ticketsSlug,
      depth: 0,
      overrideAccess: true,
    });

    expect(
      docs.map(({ title, number, createdBy, lastModifiedBy }) => ({
        title,
        number,
        createdBy,
        lastModifiedBy,
      })),
    ).toEqual([{ title: 'Printer', number: 1, createdBy: ownerId, lastModifiedBy: ownerId }]);
  });

  it('POST /api/mcp uses the API-key actor when an earlier custom strategy authenticates the engine request', async () => {
    const headers = {
      [apiKeyHeader]: apiKeyToken,
      [customStrategyHeader]: customActorCredentials.email,
    };

    const me = await booted.restClient.get<MeBody>(`/api/${usersSlug}/me`, { headers });

    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      id: customActorId,
      email: customActorCredentials.email,
      _strategy: customStrategyName,
    });
    expect(customActorId).not.toBe(ownerId);

    const tools = await listTools(apiKeyToken, headers);

    expect(tools.status).toBe(200);
    expect(
      parseMcpResponse<ToolsListBody>(tools.body).result.tools.map(({ name }) => name),
    ).toEqual(configuredTools);

    const response = await booted.restClient.post<ToolCallBody | string>(
      mcpEndpoint,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: actorToolName, arguments: {} },
      },
      { headers: { ...headers, accept: 'application/json, text/event-stream' } },
    );

    expect(response.status).toBe(200);

    const body = parseMcpResponse<ToolCallBody>(response.body);

    expect(body).toMatchObject({ jsonrpc: '2.0', id: 2 });
    expect(body.result.isError).not.toBe(true);
    expect(body.result.content).toEqual([
      {
        type: 'text',
        text: JSON.stringify({
          id: ownerId,
          email: testCredentials.email,
          collection: usersSlug,
          strategy: 'api-key',
          apiKeyId,
        }),
      },
    ]);
  });

  it('POST /api/mcp rejects an invalid key despite an earlier authenticated custom actor', async () => {
    const headers = {
      [apiKeyHeader]: unknownApiKeyToken,
      [customStrategyHeader]: customActorCredentials.email,
    };

    const me = await booted.restClient.get<MeBody>(`/api/${usersSlug}/me`, { headers });

    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      id: customActorId,
      email: customActorCredentials.email,
      _strategy: customStrategyName,
    });

    const unauthorized = await listTools(unknownApiKeyToken);
    const response = await listTools(unknownApiKeyToken, headers);

    expect(unauthorized.status).toBe(401);
    expect(response.status).toBe(unauthorized.status);
    expect(response.body).toEqual(unauthorized.body);
    expect(responseHeaders(response.headers)).toEqual(responseHeaders(unauthorized.headers));
  });

  it('POST /api/mcp rejects an unknown API key', async () => {
    const response = await listTools(unknownApiKeyToken);

    expect(response.status).toBe(401);
  });

  it('POST /api/mcp logs strategy failures without changing the normal unauthorized response', async () => {
    const unauthorized = await listTools(unknownApiKeyToken);
    const failure = new Error(strategyFailureMessage);
    const find = booted.frogbot.find.bind(booted.frogbot);
    const findSpy = vi
      .spyOn(booted.frogbot, 'find')
      .mockImplementation((options) =>
        options.collection === apiKeysSlug ? Promise.reject(failure) : find(options),
      );
    const errorLog = vi.spyOn(booted.frogbot.logger, 'error');

    const response = await listTools(apiKeyToken);

    const keyQueries = findSpy.mock.calls.filter(([options]) => options.collection === apiKeysSlug);
    const strategyErrors = errorLog.mock.calls.filter(
      ([, message]) => message === `[frogbot] auth strategy 'api-key' on '${usersSlug}' failed`,
    );

    expect(unauthorized.status).toBe(401);
    expect(response.status).toBe(unauthorized.status);
    expect(response.body).toEqual(unauthorized.body);
    expect(responseHeaders(response.headers)).toEqual(responseHeaders(unauthorized.headers));
    expect(JSON.stringify(response.body)).not.toContain(strategyFailureMessage);
    expect(JSON.stringify(responseHeaders(response.headers))).not.toContain(strategyFailureMessage);
    expect(keyQueries.length).toBeGreaterThan(0);
    expect(strategyErrors).toHaveLength(keyQueries.length);
    expect(strategyErrors.map(([details]) => details)).toEqual(
      keyQueries.map(() => ({ err: failure })),
    );
  });
});
