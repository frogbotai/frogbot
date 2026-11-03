import { definePiece } from 'frogbot';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { defineLockedPollPiece, definePollPiece } from './piece-poll.js';

export { pollControl, resetPollControl } from './piece-poll.js';

const poll = definePollPiece(definePiece)({ prefix: 'poll: ' });
const locked = defineLockedPollPiece(definePiece)();

export const pollDeliveries: Array<{ agent: string; event: unknown }> = [];

export default await buildTestConfig({
  collections: [],
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
      slug: 'inbox',
      model: 'test/gpt-4.1-mini',
      instructions: 'Handle new inbox messages.',
      triggers: [
        {
          trigger: poll.triggers.polled,
          input: { folder: 'inbox' },
          handler: ({ event, agent }) => {
            pollDeliveries.push({ agent: agent.slug, event });
          },
        },
      ],
    },
    {
      slug: 'hourly',
      model: 'test/gpt-4.1-mini',
      instructions: 'Handle new sent messages every hour.',
      triggers: [
        {
          trigger: poll.triggers.polled,
          input: { folder: 'sent' },
          schedule: { every: '1h' },
          handler: ({ event, agent }) => {
            pollDeliveries.push({ agent: agent.slug, event });
          },
        },
      ],
    },
    {
      slug: 'locked',
      model: 'test/gpt-4.1-mini',
      instructions: 'Handle polls that need a credential.',
      triggers: [
        {
          trigger: locked.triggers.polled,
          handler: ({ event, agent }) => {
            pollDeliveries.push({ agent: agent.slug, event });
          },
        },
      ],
    },
  ],
});
