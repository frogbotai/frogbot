import type { CollectionConfig, FrogBotConfig, FrogBotRequest } from 'frogbot';
import { describe, expect, it } from 'vitest';

import {
  createEmbedEndpoints,
  resolveFrameAncestors,
} from '../../../packages/plugins/plugin-forms/src/embed/endpoints.js';
import { formsPlugin } from '../../../packages/plugins/plugin-forms/src/index.js';
import type { FormsRuntime } from '../../../packages/plugins/plugin-forms/src/lookup.js';

const leads: CollectionConfig = {
  slug: 'leads',
  fields: [{ name: 'email', type: 'email', required: true }],
};

function config(): FrogBotConfig {
  return { secret: 'test', db: {}, collections: [leads] } as unknown as FrogBotConfig;
}

function pageEndpoint(frameAncestors: string) {
  const endpoint = createEmbedEndpoints({
    runtime: { targets: new Map() } as unknown as FormsRuntime,
    frameAncestors,
    base: '/api/forms',
  }).find(({ path }) => path === '/:slug/embed');

  if (!endpoint) throw new Error('No embed page endpoint');

  return endpoint;
}

const missingFormRequest = {
  routeParams: { slug: 'missing' },
  frogbot: { find: () => Promise.resolve({ docs: [] }), logger: { error: () => undefined } },
} as unknown as FrogBotRequest;

describe('forms embed frame-ancestors', () => {
  it("defaults to 'none'", () => {
    expect(resolveFrameAncestors()).toBe("'none'");
    expect(resolveFrameAncestors([])).toBe("'none'");
  });

  it('lists each origin once', () => {
    expect(
      resolveFrameAncestors([
        'https://www.example.com',
        'http://localhost:3000',
        'https://*.example.org',
        'https://www.example.com',
        'https://[::1]:8443',
        'http://127.0.0.1:3000',
      ]),
    ).toBe(
      'https://www.example.com http://localhost:3000 https://*.example.org https://[::1]:8443 http://127.0.0.1:3000',
    );
  });

  it.each([
    'https://www.example.com/',
    'https://www.example.com/contact',
    'www.example.com',
    "'self'",
    '*',
    "https://a.example; script-src 'unsafe-inline'",
    'https://a.example https://b.example',
    'javascript:alert(1)',
    'HTTPS://WWW.EXAMPLE.COM',
    'https://a.example;sandbox',
    'https://a,b.example',
    'https://*',
    'https://a_b.example',
    'https://*.*.example.com',
    'https://[::1;sandbox]',
  ])('refuses %j at boot', (origin) => {
    expect(() =>
      formsPlugin({ collections: ['leads'], frameAncestors: [origin] })(config()),
    ).toThrow(
      `[plugin-forms] frameAncestors takes origins like 'https://www.example.com', not '${origin}'.`,
    );
  });

  it('sends the listed origins and no X-Frame-Options when some are allowed', async () => {
    const response = await pageEndpoint('https://www.example.com').handler(missingFormRequest);

    expect(response.status).toBe(404);
    expect(response.headers.get('content-security-policy')).toBe(
      'frame-ancestors https://www.example.com',
    );
    expect(response.headers.has('x-frame-options')).toBe(false);
  });

  it('denies every frame by default', async () => {
    const response = await pageEndpoint("'none'").handler(missingFormRequest);

    expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });
});
