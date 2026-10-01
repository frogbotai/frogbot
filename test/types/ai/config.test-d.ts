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
