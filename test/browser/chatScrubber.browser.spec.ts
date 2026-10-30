import { expect, type Page, test } from '@playwright/test';

import {
  box,
  composer,
  content,
  holdSend,
  jump,
  openChat,
  pinOffset,
  scroller,
  send,
  settled,
} from './__helpers/dojoChat';

test.use({ viewport: { width: 1280, height: 800 } });

const rail = (page: Page) => page.getByRole('navigation', { name: 'Conversation messages' });
const ticks = (page: Page) => rail(page).getByRole('button');
const tick = (page: Page, turn: number) => ticks(page).nth(turn - 1);
const card = (page: Page) => page.locator('.fb-message-list__scrubber-card');
const list = (page: Page) => page.locator('.fb-message-list');

const line = (page: Page, turn: number) =>
  tick(page, turn).locator('.fb-message-list__scrubber-line');

const centre = async (page: Page, turn: number) => {
  const { x, y, width, height } = await box(tick(page, turn));

  return { x: x + width / 2, y: y + height / 2 };
};

const turn = (page: Page, n: number) =>
  content(page)
    .locator('.fb-message-list__item')
    .nth(2 * n - 2);

async function openTurns(page: Page) {
  await openChat(page, 12);
  await expect(ticks(page)).toHaveCount(6);
}

type Box = { x: number; y: number; width: number; height: number };

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const top = async (page: Page, n: number) => (await box(turn(page, n))).y;

const fromBottom = (page: Page) =>
  scroller(page).evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);

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

test('a send after a jump puts the sent message at the top', async ({ page }) => {
  await openTurns(page);
  await holdSend(page);
  await tick(page, 2).click();
  await settled(page);
  await send(page, 'A follow-up while reading turn two');
  await settled(page);

  const view = (await box(scroller(page))).y + (await pinOffset(page));

  expect(Math.abs((await top(page, 7)) - view)).toBeLessThanOrEqual(2);
  await expect(tick(page, 7)).toHaveAttribute('aria-current', 'true');
  await expect(jump(page)).toBeHidden();
});

test('a reply after a send from the last turn stays put as it grows', async ({ page }) => {
  await openTurns(page);

  const release = await holdSend(page);

  await tick(page, 6).click();
  await settled(page);
  await send(page, 'A follow-up while reading the last turn');
  await settled(page);

  const before = await top(page, 7);

  release(40);
  await expect(content(page)).toContainText('Reply line 40.');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden();
  await settled(page);

  expect(Math.abs((await top(page, 7)) - before)).toBeLessThanOrEqual(2);
  expect(await fromBottom(page)).toBeGreaterThan(48);
  await expect(jump(page)).toBeVisible();
});

const layouts = [
  { classicScrollbars: false, width: 'auto' },
  { classicScrollbars: false, width: '640px' },
  { classicScrollbars: true, width: 'auto' },
  { classicScrollbars: true, width: '640px' },
];

for (const { classicScrollbars, width } of layouts) {
  test(`the rail sits left of the column, clear of the composer and jump button (classic scrollbars: ${classicScrollbars}, list width: ${width})`, async ({
    page,
  }) => {
    await openChat(page, 12, { classicScrollbars });
    await page.addStyleTag({ content: `.fb-message-list { width: ${width}; }` });
    await scroller(page).evaluate((node) => node.scrollTo({ top: 0 }));
    await expect(jump(page)).toBeVisible();
    await expect(rail(page)).toBeVisible();

    const railBox = await box(rail(page));

    for (const other of [composer(page), jump(page), content(page)]) {
      expect(intersects(railBox, await box(other)), String(other)).toBe(false);
    }

    expect(railBox.x + railBox.width).toBeLessThanOrEqual((await box(content(page))).x);
    expect(
      Math.abs((await box(line(page, 1))).x - (await box(list(page))).x - 16),
    ).toBeLessThanOrEqual(1);
  });
}

test('ticks sit at a 10px pitch', async ({ page }) => {
  await openTurns(page);

  for (let n = 1; n < 6; n++) {
    const gap = (await centre(page, n + 1)).y - (await centre(page, n)).y;

    expect(Math.abs(gap - 10), `ticks ${n} and ${n + 1}`).toBeLessThanOrEqual(0.5);
  }
});

test('hovering a tick magnifies it and its neighbours', async ({ page }) => {
  await openTurns(page);
  await tick(page, 3).hover();

  await expect
    .poll(async () =>
      Promise.all(
        [1, 2, 3, 4, 5, 6].map(async (n) => Math.round((await box(line(page, n))).width)),
      ),
    )
    .toEqual([14, 20, 26, 20, 14, 10]);
});

test('only the turns on screen are marked in view', async ({ page }) => {
  await openTurns(page);
  await scroller(page).evaluate((node) => node.scrollTo({ top: 0 }));

  await expect(tick(page, 1)).toHaveAttribute('data-in-view', 'true');
  await expect(tick(page, 6)).not.toHaveAttribute('data-in-view');
});

test('a click just above or below a tick jumps to that tick', async ({ page }) => {
  await openTurns(page);

  for (const offset of [-4, 4]) {
    await tick(page, 1).click();
    await expect(tick(page, 1)).toHaveAttribute('aria-current', 'true');

    const { x, y } = await centre(page, 4);

    await page.mouse.click(x, y + offset);
    await expect(tick(page, 4), `offset ${offset}`).toHaveAttribute('aria-current', 'true');
  }
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
  await expect(card(page).getByRole('button', { includeHidden: true })).toHaveCount(0);
  await expect(card(page)).toContainText('Message 5.');

  const reply = card(page).locator('.fb-message-list__scrubber-reply');
  const lineHeight = await reply.evaluate((node) => parseFloat(getComputedStyle(node).lineHeight));

  expect((await box(reply)).height).toBeLessThanOrEqual(3 * lineHeight + 1);

  const cardBox = await box(card(page));
  const railBox = await box(rail(page));

  expect(cardBox.x).toBeGreaterThan(railBox.x + railBox.width);

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + 8, { steps: 8 });
  await expect(expect(card(page)).toBeHidden({ timeout: 300 })).rejects.toThrow();

  await page.mouse.move(8, 400, { steps: 4 });
  await expect(card(page)).toBeHidden();
});

test('after a click, the card keeps the hovered turn while the pointer moves onto it', async ({
  page,
}) => {
  await openTurns(page);
  await tick(page, 2).click();
  await settled(page);
  await tick(page, 5).hover();
  await expect(card(page)).toContainText('Message 9.');

  const cardBox = await box(card(page));

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, {
    steps: 8,
  });

  await expect(
    expect(card(page)).not.toContainText('Message 9.', { timeout: 300 }),
  ).rejects.toThrow();

  await card(page).click();
  await expect(tick(page, 5)).toHaveAttribute('aria-current', 'true');
});

test('the card centres on the active tick and follows it', async ({ page }) => {
  await openTurns(page);

  for (const n of [2, 5]) {
    await tick(page, n).hover();

    const { y } = await centre(page, n);

    await expect
      .poll(async () => {
        const { y: top, height } = await box(card(page));

        return Math.abs(top + height / 2 - y);
      })
      .toBeLessThanOrEqual(1);
  }
});
