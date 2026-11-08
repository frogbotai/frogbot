import { beforeEach, describe, expect, it, vi } from 'vitest';

const count = vi.fn();

vi.mock('frogbot', () => ({ getCachedFrogBot: () => ({ count }) }));

vi.mock('../../../templates/projects/src/components/SeedButton', () => ({
  SeedButton: () => null,
}));

const { SeedPanel } = await import('../../../templates/projects/src/components/SeedPanel');
const { SeedButton } = await import('../../../templates/projects/src/components/SeedButton');

beforeEach(() => {
  count.mockReset();
});

describe("the projects template's Seed panel", () => {
  it('shows the button while the app has no projects', async () => {
    count.mockResolvedValue({ totalDocs: 0 });

    expect((await SeedPanel())?.type).toBe(SeedButton);
    expect(count).toHaveBeenCalledWith({ collection: 'projects', overrideAccess: true });
  });

  it('renders nothing once a project exists', async () => {
    count.mockResolvedValue({ totalDocs: 1 });

    expect(await SeedPanel()).toBeNull();
  });
});
