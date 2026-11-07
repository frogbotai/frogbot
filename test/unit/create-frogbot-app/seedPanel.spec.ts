import { beforeEach, describe, expect, it, vi } from 'vitest';

const frogbot = vi.hoisted(() => ({ current: null as null | { count: () => Promise<object> } }));

vi.mock('frogbot', () => ({ getCachedFrogBot: () => frogbot.current }));

vi.mock('../../../templates/projects/src/components/SeedButton', () => ({
  SeedButton: () => null,
}));

const { SeedPanel } = await import('../../../templates/projects/src/components/SeedPanel.js');
const { SeedButton } = await import('../../../templates/projects/src/components/SeedButton.js');

const withProjects = (totalDocs: number) => ({ count: () => Promise.resolve({ totalDocs }) });

describe("the projects starter's Seed panel", () => {
  beforeEach(() => {
    frogbot.current = null;
  });

  it('offers the sample data while the app has none', async () => {
    frogbot.current = withProjects(0);

    expect((await SeedPanel())?.type).toBe(SeedButton);
  });

  it('hides once the app has a record', async () => {
    frogbot.current = withProjects(1);

    expect(await SeedPanel()).toBeNull();
  });
});
