import { describe, expect, it } from 'vitest';

import { vertexProvider } from '../../../../../packages/gateway/src/providers/vertex/index.js';
import { testEnv } from '../../config/fixtures.js';

describe('vertexProvider.fromEnv', () => {
  it('returns undefined when no Vertex credentials are present', () => {
    const result = vertexProvider.fromEnv(testEnv());

    expect(result).toBeUndefined();
  });

  it('returns API-key express config when GOOGLE_VERTEX_API_KEY is set', () => {
    const result = vertexProvider.fromEnv(
      testEnv({
        GOOGLE_VERTEX_API_KEY: 'AIza-test-key',
      }),
    );

    expect(result).toEqual({ apiKey: 'AIza-test-key' });
  });

  it('includes location and project in express mode if provided', () => {
    const result = vertexProvider.fromEnv(
      testEnv({
        GOOGLE_VERTEX_API_KEY: 'AIza-test-key',
        GOOGLE_VERTEX_LOCATION: 'us-central1',
        GOOGLE_VERTEX_PROJECT: 'my-project',
      }),
    );

    expect(result).toEqual({
      apiKey: 'AIza-test-key',
      location: 'us-central1',
      project: 'my-project',
    });
  });

  it('returns ADC config when project + location are set', () => {
    const result = vertexProvider.fromEnv(
      testEnv({
        GOOGLE_VERTEX_PROJECT: 'my-project',
        GOOGLE_VERTEX_LOCATION: 'us-central1',
      }),
    );

    expect(result).toEqual({
      project: 'my-project',
      location: 'us-central1',
    });
  });

  it('returns undefined when only project is set (partial ADC skips — G41)', () => {
    expect(
      vertexProvider.fromEnv(testEnv({ GOOGLE_VERTEX_PROJECT: 'my-project' })),
    ).toBeUndefined();
  });

  it('returns undefined when only location is set (partial ADC skips — G41)', () => {
    expect(
      vertexProvider.fromEnv(testEnv({ GOOGLE_VERTEX_LOCATION: 'us-central1' })),
    ).toBeUndefined();
  });

  it('API key takes priority over ADC', () => {
    const result = vertexProvider.fromEnv(
      testEnv({
        GOOGLE_VERTEX_API_KEY: 'AIza-key',
        GOOGLE_VERTEX_PROJECT: 'my-project',
        GOOGLE_VERTEX_LOCATION: 'us-central1',
      }),
    );

    expect(result).toHaveProperty('apiKey', 'AIza-key');
  });
});
