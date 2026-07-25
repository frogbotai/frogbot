import { describe, expect, it, vi } from 'vitest';

vi.mock('@payloadcms/ui', () => ({
  Button: () => null,
  TextInput: () => null,
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useListQuery: () => ({ data: { docs: [] }, query: {}, refineListData: vi.fn() }),
}));

const { ApiKeysManager } = await import('./client.js');

describe('client exports', () => {
  it('exports the API key manager', () => {
    expect(ApiKeysManager).toBeTypeOf('function');
  });
});
