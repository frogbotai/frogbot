import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Message } from '../../../packages/frogbot/node_modules/chat/dist/index.js';
import { LinearChannelAdapter } from '../../../packages/pieces/piece-linear/src/adapter.js';
import {
  type LinearApi,
  linearRequest,
  sessionCreated,
  sessionPrompted,
  silentLinearLogger,
  startLinearApi,
} from '../frogbot/channels/linearFixtures.js';

const webhookSecret = 'linear-adapter-secret';
const toad = { id: 'user-2', name: 'Toad', email: 'toad@example.com' };

let api: LinearApi;

async function deliver(payload: object, secret = webhookSecret) {
  const adapter = new LinearChannelAdapter({
    accessToken: 'linear-access-token',
    webhookSecret,
    mode: 'agent-sessions',
    apiUrl: api.graphqlUrl,
    logger: silentLinearLogger,
  });

  const processMessage = vi.fn();

  await adapter.initialize({ processMessage } as never);

  const response = await adapter.handleWebhook(linearRequest({ payload, secret }));

  return { response, messages: processMessage.mock.calls.map(([, , message]) => message) };
}

describe('Linear channel adapter', () => {
  beforeAll(async () => {
    api = await startLinearApi({ users: [toad] });
  });

  beforeEach(() => {
    api.reset();
  });

  afterAll(async () => {
    await api.close();
  });

  it('keeps the stop signal of a prompt on the message across a job round trip', async () => {
    const { response, messages } = await deliver(
      sessionPrompted({
        body: '',
        id: 'prompt-1',
        session: 'session-1',
        signal: 'stop',
        user: toad,
      }),
    );

    const [message] = messages;
    const restored = Message.fromJSON(JSON.parse(JSON.stringify(message.toJSON())));

    expect(response.status).toBe(200);
    expect(message).toMatchObject({
      id: 'prompt-1',
      threadId: 'linear:issue-1:s:session-1',
      raw: {
        kind: 'agent_session_comment',
        agentSessionId: 'session-1',
        agentActivitySignal: 'stop',
      },
    });
    expect(restored.raw).toMatchObject({ agentActivitySignal: 'stop' });
  });

  it('leaves a prompt without a signal unchanged', async () => {
    const { messages } = await deliver(
      sessionPrompted({ body: 'Blue', id: 'prompt-2', session: 'session-1', user: toad }),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('Blue');
    expect(messages[0].raw).not.toHaveProperty('agentActivitySignal');
  });

  it('leaves a created session unchanged', async () => {
    const { messages } = await deliver(sessionCreated({ session: 'session-2', user: toad }));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      threadId: 'linear:issue-1:s:session-2',
      text: 'Help with this issue',
    });
    expect(messages[0].raw).not.toHaveProperty('agentActivitySignal');
  });

  it('rejects a prompt signed with another secret', async () => {
    const { response, messages } = await deliver(
      sessionPrompted({ body: 'Blue', id: 'prompt-3', session: 'session-1', user: toad }),
      'another-secret',
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(messages).toEqual([]);
  });

  it('rejects a replayed prompt with a stale webhook timestamp', async () => {
    const { response, messages } = await deliver({
      ...sessionPrompted({ body: 'Blue', id: 'prompt-4', session: 'session-1', user: toad }),
      webhookTimestamp: Date.now() - 10 * 60_000,
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(messages).toEqual([]);
  });
});
