import type { FrogBotRequest } from 'frogbot';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFile = vi.hoisted(() => vi.fn());

vi.mock('node:fs/promises', () => ({ readFile }));

const { createEmbedEndpoints } =
  await import('../../../packages/plugins/plugin-forms/src/embed/endpoints.js');

function assetEndpoint() {
  const endpoint = createEmbedEndpoints({
    runtime: { targets: new Map() } as never,
    frameAncestors: "'none'",
    base: '/api/forms',
  }).find(({ path }) => path === '/embed/form.css');

  if (!endpoint) throw new Error('No form.css endpoint');

  return endpoint;
}

const error = vi.fn();

const request = {
  searchParams: new URLSearchParams(),
  frogbot: { logger: { error } },
} as unknown as FrogBotRequest;

describe('forms embed assets', () => {
  beforeEach(() => {
    readFile.mockReset();
    error.mockReset();
  });

  it('retries a failed read on the next request and logs the failure', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'));

    expect((await assetEndpoint().handler(request)).status).toBe(404);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      '[plugin-forms] Could not read the embed assets; run the plugin build',
    );

    readFile.mockImplementation((url: URL) => Promise.resolve(Buffer.from(String(url))));

    const response = await assetEndpoint().handler(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/form\.css$/);
  });
});
