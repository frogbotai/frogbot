// Tests for embedded gateway construction — provider config mapping + boot.

import { describe, expect, it, vi } from 'vitest';

import { buildGatewayConfig, createAIGateway } from './init.js';
import type { SanitizedAIConfig } from '../types/ai.js';

function makeAIConfig(providers: SanitizedAIConfig['providers']): SanitizedAIConfig {
  return {
    providers,
    routers: {},
    hooks: {
      beforeOperation: [],
      beforeUpstream: [],
      afterUpstream: [],
      afterError: [],
      afterOperation: [],
    },
    access: {
      generate: ({ req }) => !!req.user,
      embed: ({ req }) => !!req.user,
      transcribe: ({ req }) => !!req.user,
      rerank: ({ req }) => !!req.user,
    },
    telemetry: { enabled: false },
    _internal: { deploymentId: 'test' },
  };
}

describe('buildGatewayConfig', () => {
  it('passes matching built-in providers through under the same name', () => {
    const config = buildGatewayConfig(
      makeAIConfig({ openai: { apiKey: 'sk-1' }, anthropic: { apiKey: 'sk-2' } }),
    );
    expect(config.providers).toEqual({
      openai: { apiKey: 'sk-1' },
      anthropic: { apiKey: 'sk-2' },
    });
    expect(config.openaiCompatible).toBeUndefined();
  });

  it('renames bedrock → amazon-bedrock', () => {
    const entry = { region: 'us-east-1', accessKeyId: 'ak', secretAccessKey: 'sk' };
    const config = buildGatewayConfig(makeAIConfig({ bedrock: entry }));
    expect(config.providers).toEqual({ 'amazon-bedrock': entry });
  });

  it('renames together → togetherai', () => {
    const config = buildGatewayConfig(makeAIConfig({ together: { apiKey: 'sk-t' } }));
    expect(config.providers).toEqual({ togetherai: { apiKey: 'sk-t' } });
  });

  it('maps replicate apiKey → apiToken', () => {
    const config = buildGatewayConfig(makeAIConfig({ replicate: { apiKey: 'r8-key' } }));
    expect(config.providers).toEqual({ replicate: { apiToken: 'r8-key' } });
  });

  it('maps custom openai-compatible entries to openaiCompatible providers', () => {
    const config = buildGatewayConfig(
      makeAIConfig({
        ollama: {
          type: 'openai-compatible',
          baseUrl: 'http://localhost:11434/v1',
          headers: { 'x-custom': '1' },
          models: [{ id: 'llama3', mode: 'chat' }],
        },
      }),
    );
    expect(config.providers).toEqual({});
    expect(config.openaiCompatible).toEqual([
      {
        name: 'ollama',
        baseURL: 'http://localhost:11434/v1',
        headers: { 'x-custom': '1' },
      },
    ]);
  });

  it('skips undefined provider entries', () => {
    const config = buildGatewayConfig(makeAIConfig({ openai: { apiKey: 'sk' }, groq: undefined }));
    expect(Object.keys(config.providers)).toEqual(['openai']);
  });

  it('forwards all five hook phases into the gateway', () => {
    const config = makeAIConfig({ openai: { apiKey: 'sk' } });
    config.hooks = {
      beforeOperation: [vi.fn()],
      beforeUpstream: [vi.fn()],
      afterUpstream: [vi.fn()],
      afterError: [vi.fn()],
      afterOperation: [vi.fn()],
    };

    const gatewayConfig = buildGatewayConfig(config);

    expect(gatewayConfig.hooks?.beforeOperation).toHaveLength(1);
    expect(gatewayConfig.hooks?.beforeUpstream).toHaveLength(1);
    expect(gatewayConfig.hooks?.afterUpstream).toHaveLength(1);
    expect(gatewayConfig.hooks?.afterError).toHaveLength(1);
    expect(gatewayConfig.hooks?.afterOperation).toHaveLength(1);
  });
});

describe('createAIGateway', () => {
  it('boots a gateway exposing per-modality resolvers and a handler', () => {
    const gw = createAIGateway(makeAIConfig({ openai: { apiKey: 'sk-test' } }));
    expect(typeof gw.handler).toBe('function');
    expect(typeof gw.chatModel).toBe('function');
    expect(typeof gw.embedModel).toBe('function');
    expect(typeof gw.imageModel).toBe('function');
    expect(typeof gw.videoModel).toBe('function');
    expect(typeof gw.speechModel).toBe('function');
    expect(typeof gw.transcribeModel).toBe('function');
    expect(typeof gw.rerankModel).toBe('function');
  });

  it('resolves an in-process chat model for a configured provider', () => {
    const gw = createAIGateway(makeAIConfig({ openai: { apiKey: 'sk-test' } }));
    const model = gw.chatModel('openai/gpt-4o');
    expect(model.modelId).toBe('gpt-4o');
  });
});
