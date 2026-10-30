import { expect, type Locator, type Page } from '@playwright/test';

import { agentSlug, chatsSlug } from '../fixtures/dojo/shared';
import { composerInput } from './composer';
import { waitForNavSettled } from './sidebar';

const classicScrollbarStyle = `
  .fb-message-list__scroller { scrollbar-width: auto; scrollbar-color: auto; }
  .fb-message-list__scroller::-webkit-scrollbar { width: 10px; }
`;

export const scroller = (page: Page) => page.locator('.fb-message-list__scroller');
export const content = (page: Page) => page.locator('.fb-message-list__content');
export const composer = (page: Page) => page.locator('.fb-chat__composer');
export const jump = (page: Page) => page.getByRole('button', { name: 'Jump to latest' });

/** How far below the scroller's top a sent message lands: `--fb-chat-pin-offset`, in pixels. */
export const pinOffset = (page: Page) =>
  scroller(page).evaluate((node) => parseFloat(getComputedStyle(node).scrollPaddingTop));

export const scrollTop = (page: Page) => scroller(page).evaluate((node) => node.scrollTop);

/** Waits until the list stops scrolling and returns where it stopped. */
export async function settled(page: Page) {
  let last = Number.NaN;

  await expect
    .poll(async () => {
      const now = await scrollTop(page);
      const still = Math.abs(now - last) < 0.5;

      last = now;

      return still;
    })
    .toBe(true);

  return last;
}

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

/** Holds the next reply until the returned function is called with its line count. */
export async function holdSend(page: Page) {
  let release!: (lines: number) => void;
  const reply = new Promise<number>((resolve) => (release = resolve));

  await page.route(`**/api/agents/${agentSlug}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();

    const lines = await reply;
    const text = Array.from({ length: lines }, (_, index) => `Reply line ${index + 1}.`).join(
      '\n\n',
    );

    const chunks = [
      { type: 'start' },
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', delta: text },
      { type: 'text-end', id: 'text-0' },
      { type: 'finish' },
    ];

    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
      body: `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
    });
  });

  return release;
}

export async function send(page: Page, text: string) {
  await composerInput(page).fill(text);
  await composerInput(page).press('Enter');
  await expect(content(page)).toContainText(text);
}
