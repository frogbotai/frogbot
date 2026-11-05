import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed';
import type { StubChatModel } from '../../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../../__helpers/shared/StubChatModel';
import { agentSlug, modelPort, usersSlug } from '../shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const password = 'frogbot-int-password';

describe('chat compaction with auto off', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;
  let headers: Record<string, string>;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'chat-compaction-off');

    await clearAndSeed(booted.frogbot, 'empty');

    await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'owner@frogbot.local', password },
      overrideAccess: true,
    });

    const login = await booted.restClient.post<{ token: string }>(`/api/${usersSlug}/login`, {
      email: 'owner@frogbot.local',
      password,
    });

    headers = { Authorization: `JWT ${login.body.token}` };
  });

  afterEach(() => {
    model.reset();
  });

  afterAll(async () => {
    await booted.shutdown();
    await model.close();
  });

  async function post(route: string, body: unknown) {
    const response = await fetch(`${booted.baseUrl}/api${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async function longChat() {
    model.respond({
      text: 'Frogs sing to attract mates.',
      usage: { prompt_tokens: 3_900, completion_tokens: 5 },
    });

    const first = await post(`/agents/${agentSlug}`, { prompt: 'Why do frogs sing?' });

    return first.body.chatId as number | string;
  }

  it('sends no summary request over the ceiling or on a "too long" rejection', async () => {
    const chatId = await longChat();

    model.respond(
      { text: 'At night.' },
      { error: { status: 400, body: { error: { code: 'context_length_exceeded' } } } },
    );

    expect((await post(`/agents/${agentSlug}`, { prompt: 'When?', chatId })).status).toBe(200);

    const tooLong = await post(`/agents/${agentSlug}`, { prompt: 'And in winter?', chatId });

    expect(tooLong.body).toEqual({ error: 'This chat is too long for test/small-window.' });
    expect(model.summaryRequests).toHaveLength(0);
  });

  it('still compacts on request', async () => {
    const chatId = await longChat();

    model.respond({ text: 'At night.' });
    await post(`/agents/${agentSlug}`, { prompt: 'When?', chatId });

    const response = await post('/frogbot/chat/compact', { chatId });

    expect(response.status).toBe(200);
    expect(model.summaryRequests).toHaveLength(1);
    expect(response.body.message).toMatchObject({
      parts: [{ type: 'data-compaction', data: { status: 'completed', reason: 'manual' } }],
    });
  });
});
