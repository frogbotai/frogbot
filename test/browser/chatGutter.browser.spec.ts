import { expect, type Locator, type Page, test } from '@playwright/test';

import { waitForNavSettled } from './__helpers/sidebar';
import { chatsSlug } from './fixtures/dojo/shared';

const classicScrollbars = `
  .fb-message-list__scroller { scrollbar-width: auto; scrollbar-color: auto; }
  .fb-message-list__scroller::-webkit-scrollbar { width: 10px; }
`;

test.use({ viewport: { width: 1280, height: 800 } });

const scroller = (page: Page) => page.locator('.fb-message-list__scroller');
const content = (page: Page) => page.locator('.fb-message-list__content');
const composer = (page: Page) => page.locator('.fb-chat__composer');
const jump = (page: Page) => page.getByRole('button', { name: 'Jump to latest' });

async function box(locator: Locator) {
  const found = await locator.boundingBox();

  expect(found, String(locator)).not.toBeNull();

  return found!;
}

const centre = async (locator: Locator) => {
  const { x, width } = await box(locator);

  return x + width / 2;
};

async function openChat(page: Page, messages: number) {
  const seeded = await page.request.post(`/api/browser/seed?messages=${messages}`);

  expect(seeded.ok()).toBe(true);

  const { chatId } = (await seeded.json()) as { chatId: number | string };

  await page.goto(`/collections/${chatsSlug}/${chatId}`);
  await waitForNavSettled(page);
  await page.addStyleTag({ content: classicScrollbars });
  await expect(content(page)).toContainText(`Message ${messages}.`);
  await expect(composer(page)).toBeVisible();

  const gutter = await scroller(page).evaluate(
    (node: HTMLElement) => node.offsetWidth - node.clientWidth,
  );

  expect(gutter, 'classic scrollbars reserve a gutter').toBeGreaterThan(0);
}

const overflows = (page: Page) =>
  scroller(page).evaluate((node) => node.scrollHeight > node.clientHeight);

test('an overflowing chat centres the messages on the composer and jump button', async ({
  page,
}) => {
  await openChat(page, 6);

  expect(await overflows(page)).toBe(true);

  const column = await centre(content(page));

  expect(Math.abs(column - (await centre(composer(page))))).toBeLessThanOrEqual(1);

  await scroller(page).evaluate((node) => node.scrollTo({ top: 0 }));
  await expect(jump(page)).toBeVisible();

  expect(Math.abs(column - (await centre(jump(page))))).toBeLessThanOrEqual(1);
});

test('a short chat centres the messages on the composer', async ({ page }) => {
  await openChat(page, 1);

  expect(await overflows(page)).toBe(false);
  expect(
    Math.abs((await centre(content(page))) - (await centre(composer(page)))),
  ).toBeLessThanOrEqual(1);
});

test('the message column keeps its place once the chat overflows', async ({ page }) => {
  await openChat(page, 1);

  const { x, width } = await box(content(page));

  await openChat(page, 6);

  expect(await overflows(page)).toBe(true);
  expect(await box(content(page))).toMatchObject({ x, width });
});
