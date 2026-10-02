import type { AIConfig } from 'frogbot';

const config = {
  providers: { openai: true },
  routers: { judge: { model: 'openai/gpt-4o-mini' } },
  defaultModel: 'judge',
} satisfies AIConfig;

void config;

const withDefaultRouter: AIConfig = {
  providers: { openai: true },
  routers: { judge: { model: 'openai/gpt-4o-mini' } },
  // @ts-expect-error `defaultRouter` was removed; use `defaultModel`.
  defaultRouter: 'judge',
};

void withDefaultRouter;

const withPdfInput = {
  providers: {
    local: {
      type: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      models: [
        {
          id: 'reader',
          mode: 'chat',
          modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
        },
      ],
    },
  },
} satisfies AIConfig;

void withPdfInput;

const withFileInput: AIConfig = {
  providers: {
    local: {
      type: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      models: [
        {
          id: 'reader',
          mode: 'chat',
          // @ts-expect-error `'file'` was renamed to `'pdf'`.
          modalities: { input: ['text', 'file'], output: ['text'] },
        },
      ],
    },
  },
};

void withFileInput;
