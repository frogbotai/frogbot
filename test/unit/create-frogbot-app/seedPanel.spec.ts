import { beforeEach, describe, expect, it, vi } from 'vitest';

const count = vi.fn();
const frogbot = { count, createRequest: () => Promise.resolve(req) };
const req = { frogbot };

vi.mock('frogbot', () => ({ getCachedFrogBot: () => frogbot }));

vi.mock('../../../templates/asana/src/components/SeedButton', () => ({
  SeedButton: () => null,
}));

const { SeedPanel } = await import('../../../templates/asana/src/components/SeedPanel');
const { SeedButton } = await import('../../../templates/asana/src/components/SeedButton');

beforeEach(() => {
  count.mockReset();
});

describe("the asana template's Seed panel", () => {
  it('shows the button while the app has no projects', async () => {
    count.mockResolvedValue({ totalDocs: 0 });

    expect((await SeedPanel())?.type).toBe(SeedButton);
    expect(count).toHaveBeenCalledWith({ collection: 'projects', overrideAccess: true, req });
  });

  it('renders nothing once a project exists', async () => {
    count.mockResolvedValue({ totalDocs: 1 });

    expect(await SeedPanel()).toBeNull();
  });
});
