import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';

export default await buildTestConfig({
  collections: [{ slug: 'users', auth: true, fields: [] }],
  ai: {
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:3988/v1',
        apiKey: 'test-key',
        models: [{ id: 'model', mode: 'chat' }],
      },
    },
  },
  agents: [
    {
      slug: 'assistant',
      // @ts-expect-error a model from an unconfigured provider must be rejected by the CLI at runtime
      model: 'unconfigured/model',
      instructions: 'Help the user.',
    },
  ],
});
