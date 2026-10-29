import { expect, type Locator, type Page, test } from '@playwright/test';

import { box, composer, content, jump, openChat, scroller } from './__helpers/dojoChat';

test.use({ viewport: { width: 1280, height: 800 } });

const centre = async (locator: Locator) => {
  const { x, width } = await box(locator);

  return x + width / 2;
};

const overflows = (page: Page) =>
  scroller(page).evaluate((node) => node.scrollHeight > node.clientHeight);

test('an overflowing chat centres the messages on the composer and jump button', async ({
  page,
}) => {
  await openChat(page, 6, { classicScrollbars: true });

  expect(await overflows(page)).toBe(true);

  const column = await centre(content(page));

  expect(Math.abs(column - (await centre(composer(page))))).toBeLessThanOrEqual(1);

  await scroller(page).evaluate((node) => node.scrollTo({ top: 0 }));
  await expect(jump(page)).toBeVisible();

  expect(Math.abs(column - (await centre(jump(page))))).toBeLessThanOrEqual(1);
});

test('a short chat centres the messages on the composer', async ({ page }) => {
  await openChat(page, 1, { classicScrollbars: true });

  expect(await overflows(page)).toBe(false);
  expect(
    Math.abs((await centre(content(page))) - (await centre(composer(page)))),
  ).toBeLessThanOrEqual(1);
});

test('the message column keeps its place once the chat overflows', async ({ page }) => {
  await openChat(page, 1, { classicScrollbars: true });

  const { x, width } = await box(content(page));

  await openChat(page, 6, { classicScrollbars: true });

  expect(await overflows(page)).toBe(true);
  expect(await box(content(page))).toMatchObject({ x, width });
});
