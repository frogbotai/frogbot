import { describe, expect, it } from 'vitest';

import { missingKeyWarning } from '../../../packages/create-frogbot-app/src/lib/ai.js';

describe('missingKeyWarning', () => {
  it.each([
    ['openai', 'OPENAI_API_KEY'],
    ['anthropic', 'ANTHROPIC_API_KEY'],
    ['google', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  ] as const)('says a %s app will not start without %s', (ai, keyEnv) => {
    const warning = missingKeyWarning({ ai, projectName: 'my-app' }, {});

    expect(warning).toBe(`Set ${keyEnv} in my-app/.env. The app won't start without it.`);
  });

  it('asks for a Bedrock key or AWS_PROFILE before chatting', () => {
    const warning = missingKeyWarning({ ai: 'bedrock', projectName: 'my-app' }, {});

    expect(warning).toBe(
      'Set AWS_BEARER_TOKEN_BEDROCK (or AWS_PROFILE) in my-app/.env before chatting.',
    );
  });

  it('asks for a Zen key before chatting', () => {
    const warning = missingKeyWarning({ ai: 'zen', projectName: 'my-app' }, {});

    expect(warning).toBe('Set OPENCODE_API_KEY in my-app/.env before chatting.');
  });

  it.each([
    ['openai', 'OPENAI_API_KEY'],
    ['bedrock', 'AWS_BEARER_TOKEN_BEDROCK'],
  ] as const)('says a %s key found in the environment was not copied to .env', (ai, keyEnv) => {
    const warning = missingKeyWarning({ ai, projectName: 'my-app' }, { [keyEnv]: 'sk-env' });

    expect(warning).toBe(
      `Found ${keyEnv} in your environment but did not copy it to my-app/.env. Add it there, or scaffold with --api-key.`,
    );
  });

  it('stays silent when a key was given or no provider was chosen', () => {
    expect(missingKeyWarning({ ai: 'openai', apiKey: 'sk-test', projectName: 'my-app' }, {})).toBe(
      undefined,
    );
    expect(missingKeyWarning({ ai: 'none', projectName: 'my-app' }, {})).toBe(undefined);
  });
});
