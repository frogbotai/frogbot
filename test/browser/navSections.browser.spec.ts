import { expect, type Page, test } from '@playwright/test';

import { agentSlug, chatsSlug } from './fixtures/question/shared';

const recentChats = 20;

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

async function seedChats(page: Page, count: number) {
  for (let index = 1; index <= count; index++) {
    const response = await page.request.post(`/api/${chatsSlug}`, {
      data: { title: `Recent chat ${index}`, agent: agentSlug },
    });

    expect(response.ok()).toBe(true);
  }
}

const sectionLayout = (page: Page) =>
  page.locator('.fb-app-sidebar__nav').evaluate((nav) => {
    const section = (id: string) => {
      const content = nav.querySelector(`#frogbot-nav-section-${id}`);
      const element = content?.closest('.fb-nav-section');

      if (!(element instanceof HTMLElement)) throw new Error(`no ${id} section`);

      return element;
    };

    const collections = section('collections');
    const recents = section('recents');
    const items = collections.querySelectorAll('.fb-nav-item');
    const lastItem = items[items.length - 1];
    const before = collections.previousElementSibling;
    const toggle = (element: HTMLElement) =>
      element.querySelector('.fb-nav-section__toggle')?.getBoundingClientRect().top ?? NaN;

    if (!lastItem || !before) throw new Error('no nav item around the Collections section');

    return {
      sections: [collections, recents].map((element) => ({
        height: element.getBoundingClientRect().height,
        scrollHeight: element.scrollHeight,
      })),
      itemGap: toggle(recents) - lastItem.getBoundingClientRect().bottom,
      navGap: toggle(collections) - before.getBoundingClientRect().bottom,
      scrolls: nav.scrollHeight > nav.clientHeight,
    };
  });

async function expectSectionsKeepTheirHeight(page: Page, { scrolls }: { scrolls: boolean }) {
  await expect(page.locator('.fb-nav-section__toggle:disabled')).toHaveCount(0);
  await expect(page.locator('.fb-nav-section__content--animating')).toHaveCount(0);

  const layout = await sectionLayout(page);

  for (const { height, scrollHeight } of layout.sections) {
    expect(height, 'section is as tall as its content').toBeGreaterThanOrEqual(scrollHeight);
  }

  expect(layout.itemGap, 'Chats to the Recents toggle').toBeCloseTo(layout.navGap, 1);
  expect(layout.scrolls, 'sidebar scrolls').toBe(scrolls);
}

test.describe('nav sections on desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('sections keep their height and the sidebar scrolls with a long Recents list', async ({
    page,
  }) => {
    await seedChats(page, recentChats);
    await page.goto(`/collections/${chatsSlug}/create`);

    await expect(page.locator('.fb-nav-shell')).toHaveAttribute(
      'data-nav-state',
      'desktop-nav-open',
    );
    await expect(page.locator('#frogbot-nav-section-recents .fb-nav-item')).toHaveCount(
      recentChats,
    );

    await expectSectionsKeepTheirHeight(page, { scrolls: true });
  });
});

const openDrawer = async (page: Page) => {
  await page.goto(`/collections/${chatsSlug}/create`);
  await page.locator('.app-header__sidebar-toggle').click();
  await expect(page.locator('.fb-nav-shell')).toHaveAttribute('data-nav-state', 'mobile-nav-open');
};

test.describe('nav sections in the phone drawer at 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('sections keep their height with an empty Recents', async ({ page }) => {
    await openDrawer(page);
    await expect(page.locator('#frogbot-nav-section-recents .fb-nav-item')).toHaveCount(0);

    await expectSectionsKeepTheirHeight(page, { scrolls: true });
  });
});

test.describe('nav sections in the phone drawer at 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('sections keep their height with a long Recents list', async ({ page }) => {
    await seedChats(page, recentChats);
    await openDrawer(page);

    await expect(page.locator('#frogbot-nav-section-recents .fb-nav-item')).toHaveCount(
      recentChats,
    );

    await expectSectionsKeepTheirHeight(page, { scrolls: true });
  });
});
