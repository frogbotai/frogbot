import { expect, type Locator, type Page } from '@playwright/test';

import { chatsSlug } from '../fixtures/dojo/shared';
import { waitForNavSettled } from './sidebar';

const classicScrollbarStyle = `
  .fb-message-list__scroller { scrollbar-width: auto; scrollbar-color: auto; }
  .fb-message-list__scroller::-webkit-scrollbar { width: 10px; }
`;

export const scroller = (page: Page) => page.locator('.fb-message-list__scroller');
export const content = (page: Page) => page.locator('.fb-message-list__content');
export const composer = (page: Page) => page.locator('.fb-chat__composer');
export const jump = (page: Page) => page.getByRole('button', { name: 'Jump to latest' });

export async function box(locator: Locator) {
  const found = await locator.boundingBox();

  expect(found, String(locator)).not.toBeNull();

  return found!;
}

/** Seeds a Dojo chat with `messages` alternating user and assistant rows and opens it. */
export async function openChat(
  page: Page,
  messages: number,
  { classicScrollbars = false }: { classicScrollbars?: boolean } = {},
) {
  const seeded = await page.request.post(`/api/browser/seed?messages=${messages}`);

  expect(seeded.ok()).toBe(true);

  const { chatId } = (await seeded.json()) as { chatId: number | string };

  await page.goto(`/collections/${chatsSlug}/${chatId}`);
  await waitForNavSettled(page);

  if (classicScrollbars) await page.addStyleTag({ content: classicScrollbarStyle });

  await expect(content(page)).toContainText(`Message ${messages}.`);
  await expect(composer(page)).toBeVisible();

  if (!classicScrollbars) return;

  const gutter = await scroller(page).evaluate(
    (node: HTMLElement) => node.offsetWidth - node.clientWidth,
  );

  expect(gutter, 'classic scrollbars reserve a gutter').toBeGreaterThan(0);
}
