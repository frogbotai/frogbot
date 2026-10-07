import { describe, expect, it } from 'vitest';

import { azureProvider } from '../../../../packages/gateway/src/providers/azure/index.js';
import { bedrockProvider } from '../../../../packages/gateway/src/providers/bedrock/index.js';
import { vertexProvider } from '../../../../packages/gateway/src/providers/vertex/index.js';
import { testEnv } from '../config/fixtures.js';

describe('provider fromEnv skips (not throws) on common partial env — G41', () => {
  it('bedrock returns undefined when only AWS_REGION is set', () => {
    const result = bedrockProvider.fromEnv(testEnv({ AWS_REGION: 'us-east-1' }));

    expect(result).toBeUndefined();
  });

  it('vertex returns undefined when only GOOGLE_VERTEX_PROJECT is set', () => {
    const result = vertexProvider.fromEnv(testEnv({ GOOGLE_VERTEX_PROJECT: 'my-project' }));

    expect(result).toBeUndefined();
  });

  it('azure returns undefined when AZURE_API_KEY is set without resource/baseURL', () => {
    const result = azureProvider.fromEnv(testEnv({ AZURE_API_KEY: 'azure-key-123' }));

    expect(result).toBeUndefined();
  });
});
