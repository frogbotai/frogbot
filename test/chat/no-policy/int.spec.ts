import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed';
import type { StubChatModel } from '../../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../../__helpers/shared/StubChatModel';
import { agentSlug, modelPort, usersSlug } from '../shared.js';
import { allowedModel, blockedModel } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const password = 'frogbot-int-password';

describe('app model access without the AI policy plugin', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;
  let jwt: Record<string, string>;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'chat-no-policy');

    await clearAndSeed(booted.frogbot, 'empty');

    await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'app@frogbot.local', password },
      overrideAccess: true,
    });

    const login = await booted.restClient.post<{ token: string }>(`/api/${usersSlug}/login`, {
      email: 'app@frogbot.local',
      password,
    });

    if (login.status !== 200) throw new Error(`Login failed with ${login.status}.`);

    jwt = { Authorization: `JWT ${login.body.token}` };
  });

  afterEach(() => {
    model.reset();
  });

  afterAll(async () => {
    await booted.frogbot.delete({ collection: usersSlug, where: {}, overrideAccess: true });
    await booted.shutdown();
    await model.close();
  });

  async function complete(target: string) {
    return booted.restClient.post(
      '/api/v1/chat/completions',
      { model: target, messages: [{ role: 'user', content: 'Hello' }] },
      { headers: jwt },
    );
  }

  it('GET /api/agents hides the model ai.access.generate denies', async () => {
    const response = await fetch(`${booted.baseUrl}/api/agents`, { headers: jwt });
    const body = (await response.json()) as {
      agents: Array<{ slug: string; models: string[]; defaultModel: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.agents).toEqual([
      expect.objectContaining({
        slug: agentSlug,
        models: [allowedModel],
        defaultModel: allowedModel,
      }),
    ]);
  });

  it('POST /api/v1/chat/completions rejects the denied model before upstream', async () => {
    const response = await complete(blockedModel);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        message: 'Access denied for AI generate',
        type: 'permission_error',
        code: 'permission_denied',
        param: null,
      },
    });
    expect(model.titleRequests).toEqual([]);
  });

  it('POST /api/v1/chat/completions forwards an allowed model', async () => {
    const response = await complete(allowedModel);

    expect(response.status).toBe(200);
    expect(model.titleRequests.map(({ model }) => model)).toEqual(['thinker']);
  });
});
