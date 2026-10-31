import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { bootLinked, MODEL, openai, SETUP_ERROR, stubOpenAI } from './aiCredentials.js';

describe(`AI with only the OpenAI piece: no ai config and no OPENAI_API_KEY [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let booted: Awaited<ReturnType<typeof bootLinked>>;

  beforeAll(async () => {
    vi.stubEnv('OPENAI_API_KEY', undefined);
    stubOpenAI();

    booted = await bootLinked({});
  });

  afterAll(async () => {
    await booted?.frogbot.destroy();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('boots with the OpenAI provider added by the piece', () => {
    expect(booted.frogbot.config.ai?.providers).toEqual({ openai: true });
  });

  it('gives an unlinked user and work without a user the setup error, with no request', async () => {
    const dave = await booted.member('dave@example.com');

    await expect(booted.turn(dave, 'dave-turn')).rejects.toThrow(SETUP_ERROR);
    await expect(booted.frogbot.generateText({ model: MODEL, prompt: 'job-run' })).rejects.toThrow(
      SETUP_ERROR,
    );
    expect(openai.requests).toEqual([]);
  });
});
