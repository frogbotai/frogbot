import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  DefaultTemplate: vi.fn(() => null),
}));

vi.mock('@payloadcms/next/templates', () => mocks);

const { DefaultTemplate } =
  await import('../../../../packages/next/src/exports/templates.js');

describe('@frogbotai/next templates', () => {
  it('recovers the issued runtime after Next clones the request', () => {
    const payload = { config: {}, importMap: {} };
    const issuedReq = { frogbot: {} };

    Object.defineProperty(issuedReq, Symbol.for('@frogbotai/request-runtime'), {
      enumerable: true,
      value: payload,
    });

    const req = { ...issuedReq };

    const element = DefaultTemplate({
      i18n: {},
      req,
      visibleEntities: { collections: [], globals: [] },
    } as never);

    expect(element.type).toBe(mocks.DefaultTemplate);
    expect(element.props.payload).toBe(payload);
    expect(element.props.req).toBe(req);
    expect('payload' in req).toBe(false);
  });

  it('rejects a manually forged public request', () => {
    expect(() =>
      DefaultTemplate({
        i18n: {},
        req: { frogbot: {} },
        visibleEntities: { collections: [], globals: [] },
      } as never),
    ).toThrow('[frogbot] DefaultTemplate requires the request issued for the current admin page.');
  });
});
