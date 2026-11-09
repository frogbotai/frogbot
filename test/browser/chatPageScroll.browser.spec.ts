import { expect, type Page, test } from '@playwright/test';

import { box, composer, holdSend, openChat, scroller, scrollTop, send } from './__helpers/dojoChat';

test.setTimeout(120_000);

const pageScroll = (page: Page) =>
  page.evaluate(() => ({
    height: document.scrollingElement!.scrollHeight,
    viewport: innerHeight,
    y: scrollY,
  }));

async function outsideThread(page: Page) {
  const thread = await box(scroller(page));
  const input = await box(composer(page));
  const nav = page.locator('nav').first();
  const points = [
    { name: 'header', x: thread.x + thread.width / 2, y: thread.y / 2 },
    { name: 'composer', x: input.x + input.width / 2, y: input.y + input.height / 2 },
  ];

  if (await nav.isVisible()) {
    const sidebar = await box(nav);

    points.push({
      name: 'sidebar',
      x: sidebar.x + sidebar.width / 2,
      y: sidebar.y + sidebar.height / 2,
    });
  }

  for (const point of points) {
    const inThread = await page.evaluate(
      ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.fb-message-list__scroller')),
      point,
    );

    expect(inThread, `the ${point.name} point is outside the thread`).toBe(false);
  }

  return points;
}

async function expectPageStill(page: Page) {
  const { height, viewport } = await pageScroll(page);

  expect(height, 'the page is no taller than the window').toBe(viewport);

  for (const { name, x, y } of await outsideThread(page)) {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 4000);
    await expect.poll(async () => (await pageScroll(page)).y, `wheel over the ${name}`).toBe(0);
  }

  const thread = await box(scroller(page));

  await scroller(page).evaluate((node) => node.scrollTo({ top: node.scrollHeight }));

  const bottom = await scrollTop(page);

  await page.mouse.move(thread.x + thread.width / 2, thread.y + 40);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => scrollTop(page), 'the thread still scrolls').toBeLessThan(bottom);

  await page.mouse.wheel(0, -100_000);
  await expect.poll(() => scrollTop(page)).toBe(0);
  await page.mouse.wheel(0, -400);
  expect((await pageScroll(page)).y, 'the thread’s top doesn’t chain into the page').toBe(0);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport });

    test('a long idle chat never scrolls the page', async ({ page }) => {
      await openChat(page, 40);

      expect(await scroller(page).evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(
        true,
      );

      await expectPageStill(page);
    });

    test('a long chat never scrolls the page while a reply streams', async ({ page }) => {
      await openChat(page, 40);

      const release = await holdSend(page);

      await send(page, 'Still working?');
      await expect(page.locator('.fb-working[data-active]')).toBeAttached();

      await expectPageStill(page);

      release(3);
    });
  });
}
