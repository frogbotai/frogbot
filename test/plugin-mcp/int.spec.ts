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
  secretsSlug,
  strategyFailureMessage,
  testCredentials,
  ticketsSlug,
  unknownApiKeyToken,
  usersSlug,
} from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const builtInTools = [
  'getConfigInfo',
  'countDocuments',
  'createDocuments',
  'findDocuments',
  'getCollectionSchema',
];

type MeBody = {
  user: { id: string | number; email: string; _strategy: string } | null;
};

type JSONSchema = {
  type?: string | string[];
  description?: string;
  minimum?: number;
  maximum?: number;
  anyOf?: JSONSchema[];
  properties?: Record<string, JSONSchema>;
};

type ToolsListBody = {
  jsonrpc: '2.0';
  id: number;
  result: { tools: Array<{ name: string }> };
};

type ToolCallBody = {
  jsonrpc: '2.0';
  id: number;
  result: {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
    structuredContent?: { schema?: JSONSchema };
  };
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

  function toolText(body: ToolCallBody | string) {
    const { result } = parseMcpResponse<ToolCallBody>(body);

    return {
      isError: result.isError === true,
      text: result.content.map(({ text }) => text).join(''),
    };
  }

  function createDocument(slug: string, data: Record<string, unknown>) {
    return callTool('createDocuments', { slug, documents: [{ data }] });
  }

  async function collectionSchema(slug: string): Promise<JSONSchema> {
    const response = await callTool('getCollectionSchema', { slug });

    return parseMcpResponse<ToolCallBody>(response.body).result.structuredContent?.schema ?? {};
  }

  it('POST /api/mcp lists Payload tools and the custom tool with a persisted API key', async () => {
    const response = await listTools(apiKeyToken);

    expect(response.status).toBe(200);

    const body = parseMcpResponse<ToolsListBody>(response.body);

    expect(body).toMatchObject({ jsonrpc: '2.0', id: 1 });
    expect(body.result.tools.map(({ name }) => name)).toEqual(
      expect.arrayContaining([...builtInTools, actorToolName]),
    );
  });

  it("POST /api/mcp lists the app collections the key's user can read, none of FrogBot's", async () => {
    const response = await callTool('getConfigInfo', {});

    expect(response.status).toBe(200);
    expect(toolText(response.body)).toEqual({
      isError: false,
      text: `Collections: ${usersSlug}, ${postsSlug}, ${ticketsSlug}\nGlobals: none`,
    });
  });

  it('POST /api/mcp refuses FrogBot collections', async () => {
    const response = await callTool('findDocuments', { slug: apiKeysSlug });

    expect(toolText(response.body)).toEqual({
      isError: true,
      text: `Error: MCP access to "findDocuments" is not enabled for collection "${apiKeysSlug}"`,
    });
  });

  it("POST /api/mcp returns an access error for a collection the key's user can't read", async () => {
    await booted.frogbot.create({
      collection: secretsSlug,
      data: { title: 'Hidden' },
      overrideAccess: true,
    });

    const response = await callTool('findDocuments', { slug: secretsSlug });
    const { isError, text } = toolText(response.body);

    expect(isError).toBe(true);
    expect(text).not.toContain('Hidden');
  });

  it('POST /api/mcp describes money, rating and duration fields in the collection schema', async () => {
    const properties = (await collectionSchema(postsSlug)).properties ?? {};
    const pick = (schema: JSONSchema = {}, type: string) =>
      schema.anyOf?.find((option) => option.type === type) ?? schema;

    expect(properties.price?.description).toBe(
      'Retail price (decimal amount in USD, in whole units, not minor units such as cents)',
    );
    expect(pick(properties.price, 'number').minimum).toBe(0);
    expect(properties.cost?.properties?.wholesale?.description).toBe(
      'Decimal amount in EUR, in whole units, not minor units such as cents',
    );
    expect(properties.score?.description).toBe('Whole-number rating from 1 to 5');
    expect(pick(properties.score, 'integer')).toMatchObject({
      type: expect.arrayContaining(['integer']),
      minimum: 1,
      maximum: 5,
    });
    expect(properties.timeSpent?.description).toBe(
      'Duration in whole seconds, for example 5400 for 1 hour 30 minutes',
    );
    expect(pick(properties.timeSpent, 'integer')).toMatchObject({
      type: expect.arrayContaining(['integer']),
    });
  });

  it('POST /api/mcp leaves the autonumber field out of the input schema', async () => {
    const properties = (await collectionSchema(ticketsSlug)).properties ?? {};

    expect(Object.keys(properties)).toContain('title');
    expect(Object.keys(properties)).not.toContain('number');
  });

  it.each([
    ['a negative money amount', { title: 'Negative', price: -3 }],
    ['a fractional rating', { title: 'Half star', score: 3.5 }],
  ])('POST /api/mcp rejects %s without saving', async (_name, data) => {
    const response = await createDocument(postsSlug, data);

    expect(response.status).toBe(200);
    expect(toolText(response.body).isError).toBe(true);

    const { totalDocs } = await booted.frogbot.count({
      collection: postsSlug,
      overrideAccess: true,
    });

    expect(totalDocs).toBe(0);
  });

  it('POST /api/mcp saves a decimal money amount, a rating and a duration', async () => {
    const response = await createDocument(postsSlug, {
      title: 'Rated',
      price: 12.5,
      score: 3,
      timeSpent: 5400,
    });

    expect(toolText(response.body).isError).toBe(false);

    const { docs } = await booted.frogbot.find({ collection: postsSlug, overrideAccess: true });

    expect(
      docs.map(({ title, price, score, timeSpent }) => ({ title, price, score, timeSpent })),
    ).toEqual([{ title: 'Rated', price: 12.5, score: 3, timeSpent: 5400 }]);
  });

  it('POST /api/mcp create sets the number and records the key owner as the author', async () => {
    const response = await createDocument(ticketsSlug, { title: 'Printer', number: 99 });

    expect(toolText(response.body).isError).toBe(false);

    const { docs } = await booted.frogbot.find({
      collection: ticketsSlug,
      depth: 0,
      overrideAccess: true,
    });

    expect(
      docs.map(({ title, number, createdBy, updatedBy }) => ({
        title,
        number,
        createdBy,
        updatedBy,
      })),
    ).toEqual([
      {
        title: 'Printer',
        number: 1,
        createdBy: { relationTo: usersSlug, value: ownerId },
        updatedBy: { relationTo: usersSlug, value: ownerId },
      },
    ]);
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
    ).toContain(actorToolName);

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
