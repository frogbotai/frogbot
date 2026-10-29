import { expect, type Page, test } from '@playwright/test';

import { composerInput } from './__helpers/composer';
import { box, composer, content, jump, openChat, scroller } from './__helpers/dojoChat';
import { agentSlug } from './fixtures/dojo/shared';

test.use({ viewport: { width: 1280, height: 800 } });

const rail = (page: Page) => page.getByRole('navigation', { name: 'Conversation messages' });
const ticks = (page: Page) => rail(page).getByRole('button');
const tick = (page: Page, turn: number) => ticks(page).nth(turn - 1);
const card = (page: Page) => page.locator('.fb-message-list__scrubber-card');

const turn = (page: Page, n: number) =>
  content(page)
    .locator('.fb-message-list__item')
    .nth(2 * n - 2);

const scrollTop = (page: Page) => scroller(page).evaluate((node) => node.scrollTop);

async function settled(page: Page) {
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

async function openTurns(page: Page) {
  await openChat(page, 12);
  await expect(ticks(page)).toHaveCount(6);
}

async function holdSend(page: Page) {
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

type Box = { x: number; y: number; width: number; height: number };

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const top = async (page: Page, n: number) => (await box(turn(page, n))).y;

const fromBottom = (page: Page) =>
  scroller(page).evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);

async function send(page: Page, text: string) {
  await composerInput(page).fill(text);
  await composerInput(page).press('Enter');
  await expect(content(page)).toContainText(text);
}

test('clicking a tick scrolls its turn to the top of the list', async ({ page }) => {
  await openTurns(page);
  await tick(page, 2).click();
  await settled(page);

  const view = (await box(scroller(page))).y;

  expect(Math.abs((await top(page, 2)) - (view + 16))).toBeLessThanOrEqual(2);
  await expect(tick(page, 2)).toHaveAttribute('aria-current', 'true');
  await expect(jump(page)).toBeVisible();
});

test('the current tick follows the turn on screen', async ({ page }) => {
  await openTurns(page);

  await scroller(page).evaluate((node) => {
    const fourth = node.querySelectorAll('.fb-message-list__item')[6];
    const line = node.getBoundingClientRect().top + node.clientHeight * 0.25;

    node.scrollTop += fourth.getBoundingClientRect().top - line + 4;
  });

  await expect(tick(page, 4)).toHaveAttribute('aria-current', 'true');
  await expect(rail(page).locator('[aria-current="true"]')).toHaveCount(1);

  await scroller(page).evaluate((node) => node.scrollTo({ top: 0 }));
  await expect(tick(page, 1)).toHaveAttribute('aria-current', 'true');
});

test('a send after a jump keeps the jumped turn in place', async ({ page }) => {
  await openTurns(page);
  await holdSend(page);
  await tick(page, 2).click();
  await settled(page);

  const before = await top(page, 2);

  await send(page, 'A follow-up while reading turn two');
  await settled(page);

  expect(Math.abs((await top(page, 2)) - before)).toBeLessThanOrEqual(2);
  expect(await fromBottom(page)).toBeGreaterThan(48);
  await expect(tick(page, 2)).toHaveAttribute('aria-current', 'true');
  await expect(jump(page)).toBeVisible();
});

test('a reply after jumping to the last turn does not re-follow', async ({ page }) => {
  await openTurns(page);

  const release = await holdSend(page);

  await tick(page, 6).click();
  await settled(page);
  await send(page, 'A follow-up while reading the last turn');
  await settled(page);

  const before = await top(page, 6);

  release(40);
  await expect(content(page)).toContainText('Reply line 40.');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden();
  await settled(page);

  expect(Math.abs((await top(page, 6)) - before)).toBeLessThanOrEqual(2);
  expect(await fromBottom(page)).toBeGreaterThan(48);
  await expect(jump(page)).toBeVisible();
});

test('the rail overlaps neither the column, the composer, the jump button nor the scrollbar', async ({
  page,
}) => {
  await openChat(page, 12, { classicScrollbars: true });
  await scroller(page).evaluate((node) => node.scrollTo({ top: 0 }));
  await expect(jump(page)).toBeVisible();

  const railBox = await box(rail(page));

  for (const other of [composer(page), jump(page), content(page)]) {
    expect(intersects(railBox, await box(other)), String(other)).toBe(false);
  }

  const strip = await scroller(page).evaluate(
    (node: HTMLElement) =>
      node.getBoundingClientRect().right - (node.offsetWidth - node.clientWidth) / 2,
  );

  expect(railBox.x + railBox.width).toBeLessThanOrEqual(strip);
});

test('the rail hides when the list is narrower than 640px', async ({ page }) => {
  await openTurns(page);
  await expect(rail(page)).toBeVisible();
  await page.addStyleTag({ content: '.fb-message-list { width: 600px; }' });
  await expect(rail(page)).toBeHidden();
});

test('the hover card stays open while the pointer moves onto it', async ({ page }) => {
  await openTurns(page);
  await tick(page, 3).hover();
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('button', { includeHidden: true })).toHaveCount(6);

  const cardBox = await box(card(page));

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + 8, { steps: 8 });
  await expect(expect(card(page)).toBeHidden({ timeout: 300 })).rejects.toThrow();

  await page.mouse.move(8, 400, { steps: 4 });
  await expect(card(page)).toBeHidden();
});
