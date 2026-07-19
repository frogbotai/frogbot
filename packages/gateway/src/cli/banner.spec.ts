import { describe, expect, it } from 'vitest';

import { startupBanner } from './banner.js';

describe('startupBanner', () => {
  it('summarizes startup state under 20 lines', () => {
    const banner = startupBanner({
      config: {
        providers: { openai: { apiKey: 'test' } },
        hooks: { beforeUpstream: [() => {}], afterOperation: [() => {}] },
        logger: { level: 'debug' },
        tracing: { endpoint: 'http://otel.test/v1/traces' },
      },
      host: '0.0.0.0',
      port: 3939,
      sources: [{ kind: 'defaults' }, { kind: 'env', path: '/tmp/gateway.config.ts' }],
    });

    expect(banner.split('\n').length).toBeLessThan(20);
    expect(banner).toContain('listen: http://localhost:3939');
    expect(banner).toContain('providers: openai (catalog unknown)');
    expect(banner).toContain('hooks: beforeUpstream:1, afterOperation:1');
    expect(banner).toContain('config sources: defaults, env=/tmp/gateway.config.ts');
  });
});
