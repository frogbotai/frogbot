import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigError } from '../../../../../packages/gateway/src/errors/gatewayError.js';
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

describe('vertexProvider.build', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds Gemini ids with the Gemini adapter and Claude ids with the Anthropic adapter', () => {
    const provider = vertexProvider.build({ project: 'acme', location: 'global' });

    expect(provider.languageModel('gemini-3.5-flash').provider).toBe('google.vertex.chat');
    expect(provider('gemini-3.5-flash').provider).toBe('google.vertex.chat');
    expect(provider.languageModel('claude-sonnet-4-6@default').provider).toBe(
      'googleVertex.anthropic.messages',
    );
  });

  it('builds a Gemini id outside the catalog with the Gemini adapter', () => {
    const provider = vertexProvider.build({ project: 'acme', location: 'global' });

    expect(provider.languageModel('gemini-9-preview').provider).toBe('google.vertex.chat');
  });

  it('only needs project and location once a Claude id is asked for', () => {
    vi.stubEnv('GOOGLE_VERTEX_PROJECT', '');
    vi.stubEnv('GOOGLE_VERTEX_LOCATION', '');

    const provider = vertexProvider.build({ apiKey: 'express-key' });

    expect(provider.languageModel('gemini-3.5-flash').provider).toBe('google.vertex.chat');
    expect(() => provider.languageModel('claude-sonnet-4-6@default')).toThrow(ConfigError);
    expect(() => provider.languageModel('claude-sonnet-4-6@default')).toThrow(
      /project and a location for Claude/,
    );
  });

  it('fails a Claude id with a project but no location', () => {
    vi.stubEnv('GOOGLE_VERTEX_LOCATION', '');

    const provider = vertexProvider.build({ project: 'acme' });

    expect(() => provider.languageModel('claude-sonnet-4-6@default')).toThrow(ConfigError);
  });

  it('takes the Claude project and location from the environment', () => {
    vi.stubEnv('GOOGLE_VERTEX_PROJECT', 'env-project');
    vi.stubEnv('GOOGLE_VERTEX_LOCATION', 'us-east5');

    const provider = vertexProvider.build({});

    expect(provider.languageModel('claude-sonnet-4-6@default').provider).toBe(
      'googleVertex.anthropic.messages',
    );
  });

  it('accepts anthropic.location in place of the shared location', () => {
    vi.stubEnv('GOOGLE_VERTEX_LOCATION', '');

    const provider = vertexProvider.build({ project: 'acme', anthropic: { location: 'us-east5' } });

    expect(provider.languageModel('claude-sonnet-4-6@default').provider).toBe(
      'googleVertex.anthropic.messages',
    );
  });
});
