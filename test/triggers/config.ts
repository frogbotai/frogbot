import { type AgentPieceTrigger, definePiece } from 'frogbot';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { defineEchoPiece } from '../unit/frogbot/triggers/fixtures/piece-echo.js';

export { echoCalls } from '../unit/frogbot/triggers/fixtures/piece-echo.js';

const createEcho = defineEchoPiece(definePiece);
const echo = createEcho({ prefix: 'echo: ' });
const east = createEcho({ slug: 'echo-east', prefix: 'east: ' });
const west = createEcho({ slug: 'echo-west', prefix: 'west: ' });
export const failedHandlerCalls: unknown[] = [];

const recordDelivery =
  (handler: string): AgentPieceTrigger['handler'] =>
  async ({ event, agent, req }) => {
    await req.frogbot.create({
      collection: 'trigger-deliveries',
      data: {
        agent: agent.slug,
        handler,
        event,
        context: req.context,
        request: {
          hasHeaders: req.headers instanceof Headers,
          hasUser: Boolean(req.user),
          matchesAgent: req.frogbot.agents[agent.slug] === agent,
        },
      },
      req,
      overrideAccess: true,
    } as never);
  };

export default await buildTestConfig({
  serverURL: 'http://127.0.0.1:3988',
  collections: [
    {
      slug: 'trigger-deliveries',
      fields: [
        { name: 'agent', type: 'text', required: true },
        { name: 'handler', type: 'text', required: true },
        { name: 'event', type: 'json', required: true },
        { name: 'context', type: 'json', required: true },
        { name: 'request', type: 'json', required: true },
      ],
    },
  ],
  jobs: { deleteJobOnComplete: false, shouldAutoRun: () => false },
  ai: {
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:3988/v1',
        apiKey: 'test-key',
        models: [{ id: 'gpt-4.1-mini', mode: 'chat' }],
      },
    },
  },
  agents: [
    {
      slug: 'ops',
      model: 'test/gpt-4.1-mini',
      instructions: 'Handle echo events.',
      triggers: [
        {
          trigger: echo.triggers.subscribed,
          input: { channel: 'alerts' },
          handler: recordDelivery('ops'),
        },
      ],
    },
    ...['app-primary', 'app-secondary'].map((slug) => ({
      slug,
      model: 'test/gpt-4.1-mini',
      instructions: 'Record echo events.',
      triggers: [{ trigger: echo.triggers.received, handler: recordDelivery(slug) }],
    })),
    {
      slug: 'named-instances',
      model: 'test/gpt-4.1-mini',
      instructions: 'Record events from both echo instances.',
      triggers: [
        { trigger: east.triggers.received, handler: recordDelivery('east') },
        { trigger: west.triggers.received, handler: recordDelivery('west') },
      ],
    },
    {
      slug: 'failing-handler',
      model: 'test/gpt-4.1-mini',
      instructions: 'Fail when handling an echo event.',
      triggers: [
        {
          trigger: echo.triggers.subscribed,
          input: { channel: 'failures' },
          handler: async ({ event }) => {
            failedHandlerCalls.push(event);
            throw new Error('Intentional trigger handler failure');
          },
        },
      ],
    },
  ],
});
