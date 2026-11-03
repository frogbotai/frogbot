import { buildImportConfig } from '../buildConfig.js';
import { modelPort, suggestModel } from '../shared.js';

export default buildImportConfig({
  ai: {
    smallModel: suggestModel as never,
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'test-key',
        models: [{ id: 'mapper', mode: 'chat' }],
      },
    },
  },
});
