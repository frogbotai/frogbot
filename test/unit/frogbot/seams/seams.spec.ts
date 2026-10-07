import { describe, expect, it } from 'vitest';

import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { wrapPayloadPlugin } from '../../../../packages/frogbot/src/seams/config.js';
import { hasFrogBot } from '../../../../packages/frogbot/src/seams/request.js';
import type { PayloadRequest } from '../../../../packages/frogbot/src/types/payload.js';

const config: FrogBotConfig = {
  collections: [],
  db: { defaultIDType: 'text' } as FrogBotConfig['db'],
  secret: 's',
};

describe('wrapPayloadPlugin', () => {
  it('hands the config to a sync Payload plugin and returns its result', () => {
    const plugin = wrapPayloadPlugin((incoming) => ({ ...incoming, cookiePrefix: 'seam' }));

    expect(plugin(config)).toEqual({ ...config, cookiePrefix: 'seam' });
  });

  it('awaits an async Payload plugin', async () => {
    const plugin = wrapPayloadPlugin((incoming) =>
      Promise.resolve({ ...incoming, cookiePrefix: 'async' }),
    );

    await expect(plugin(config)).resolves.toEqual({ ...config, cookiePrefix: 'async' });
  });
});

describe('hasFrogBot', () => {
  it('is true only once a FrogBot instance is attached', () => {
    const req = new Request('https://example.com') as PayloadRequest;

    expect(hasFrogBot(req)).toBe(false);
    expect(hasFrogBot(Object.assign(req, { frogbot: {} }))).toBe(true);
  });
});
