import { describe, expect, it } from 'vitest';

import {
  getConfiguredTranscriptionModelIds,
  resolveSmallModel,
} from '../../../../packages/frogbot/src/ai/models.js';
import type { AIConfig } from '../../../../packages/frogbot/src/ai/types.js';

function ai(overrides: Partial<AIConfig> = {}): AIConfig {
  return { providers: { openai: true }, ...overrides } as AIConfig;
}

describe('resolveSmallModel', () => {
  it('honors the configured utility model', () => {
    expect(
      resolveSmallModel(ai({ smallModel: 'openai/gpt-5-mini' as never }), 'openai/gpt-5.4'),
    ).toBe('openai/gpt-5-mini');
  });

  it('prefers a small model from the main provider', () => {
    expect(resolveSmallModel(ai(), 'openai/gpt-5.4')).toMatch(/^openai\/.+(nano|mini)/);
  });

  it('never crosses providers', () => {
    expect(
      resolveSmallModel(
        ai({ providers: { anthropic: true, openai: true } }),
        'anthropic/claude-opus-4-6',
      ),
    ).toMatch(/^anthropic\//);
  });

  it('honors provider model allowlists', () => {
    expect(
      resolveSmallModel(
        ai({ providers: { openai: { apiKey: 'test', models: ['gpt-5-mini'] } } }),
        'openai/gpt-5.4',
      ),
    ).toBe('openai/gpt-5-mini');
  });

  it('falls back to the main model for custom providers', () => {
    const config = ai({
      providers: {
        internal: {
          type: 'openai-compatible',
          baseUrl: 'https://models.test',
          models: [{ id: 'chat', mode: 'chat' }],
        },
      },
    });

    expect(resolveSmallModel(config, 'internal/chat')).toBe('internal/chat');
  });
});

describe('getConfiguredTranscriptionModelIds', () => {
  it('lists the transcription models of a configured provider', () => {
    const ids = getConfiguredTranscriptionModelIds(ai());

    expect(ids).toEqual(
      expect.arrayContaining([
        'openai/gpt-4o-mini-transcribe',
        'openai/gpt-4o-transcribe',
        'openai/whisper-1',
      ]),
    );
    expect(ids).not.toContain('openai/gpt-4o-mini');
  });

  it('honors provider model allowlists', () => {
    const ids = getConfiguredTranscriptionModelIds(
      ai({ providers: { openai: { apiKey: 'k', models: ['whisper-1'] } } }),
    );

    expect(ids).toEqual(['openai/whisper-1']);
  });

  it('lists a router to a transcription model under its slug', () => {
    const ids = getConfiguredTranscriptionModelIds(
      ai({ routers: { stt: { model: 'openai/whisper-1' } } }),
    );

    expect(ids).toContain('stt');
  });

  it('omits a router to a chat model', () => {
    const ids = getConfiguredTranscriptionModelIds(
      ai({ routers: { fast: { model: 'openai/gpt-4o-mini' } } }),
    );

    expect(ids).not.toContain('fast');
  });

  it('returns an empty list without an AI config', () => {
    expect(getConfiguredTranscriptionModelIds(undefined)).toEqual([]);
  });
});
