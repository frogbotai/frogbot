import { expect, type Page, test } from '@playwright/test';

import {
  box,
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

const sentRow = (page: Page) => content(page).locator('.fb-message-list__item').nth(12);

async function record(page: Page) {
  await scroller(page).evaluate((node) => {
    const log = { tops: [] as number[], jumped: false };

    Object.assign(window, { scrollLog: log });
    node.addEventListener('scroll', () => log.tops.push(node.scrollTop), { passive: true });

    new MutationObserver(() => {
      log.jumped ||= Boolean(
        node.parentElement?.querySelector('.fb-message-list__jump[data-shown]'),
      );
    }).observe(node.parentElement!, { attributes: true, childList: true, subtree: true });
  });

  return () =>
    page.evaluate(
      () => (window as unknown as { scrollLog: { tops: number[]; jumped: boolean } }).scrollLog,
    );
}

test('replies span the column and a long user bubble stops at min(82%, 64ch)', async ({ page }) => {
  await openChat(page, 12);
  await holdSend(page);
  await send(page, 'A long question that keeps going. '.repeat(12).trim());

  const column = await content(page).evaluate((node) => {
    const style = getComputedStyle(node);

    return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  });

  const reply = content(page).locator('.fb-message--assistant .fb-message__body').first();

  expect(Math.abs((await box(reply)).width - column)).toBeLessThanOrEqual(1);

  const bubble = sentRow(page).locator('.fb-message__body--user');

  const cap = await bubble.evaluate((node) => {
    const probe = document.createElement('div');

    probe.style.width = '64ch';
    node.append(probe);

    const ch64 = probe.getBoundingClientRect().width;

    probe.remove();

    return Math.min(0.82 * node.parentElement!.getBoundingClientRect().width, ch64);
  });

  expect(Math.abs((await box(bubble)).width - cap)).toBeLessThanOrEqual(1);
});

test('a send puts the message at the top once, and the reply fills in below it without moving the view', async ({
  page,
}) => {
  await openChat(page, 12);
  await settled(page);

  const release = await holdSend(page);
  const log = await record(page);

  await send(page, 'A question that should move to the top');

  const pinned = await settled(page);

  const offset = await pinOffset(page);

  expect(offset).toBeGreaterThan(0);
  expect(
    Math.abs((await box(sentRow(page))).y - (await box(scroller(page))).y - offset),
  ).toBeLessThanOrEqual(2);
  await expect(jump(page)).toBeHidden();

  release(40);
  await expect(content(page)).toContainText('Reply line 40.');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden();

  expect(Math.abs((await settled(page)) - pinned)).toBeLessThanOrEqual(1);

  const { tops } = await log();

  expect(tops.length).toBeGreaterThan(0);
  expect(tops.every((top, index) => index === 0 || top >= tops[index - 1] - 0.5)).toBe(true);
  await expect(jump(page)).toBeVisible();
});

test('the list’s own scroll never shows the jump button; a wheel away from the end does', async ({
  page,
}) => {
  await openChat(page, 12);
  await settled(page);
  await holdSend(page);

  const log = await record(page);

  await send(page, 'A question while the reply is held');
  await settled(page);

  expect((await log()).jumped).toBe(false);

  await scroller(page).hover();
  await page.mouse.wheel(0, -1200);
  await expect(jump(page)).toBeVisible();
});

test('the jump button fades, and a click lands on the end at once', async ({ page }) => {
  await openChat(page, 12);
  await settled(page);

  const release = await holdSend(page);

  await send(page, 'A question with a long reply');
  await settled(page);

  const button = page.locator('.fb-message-list__jump');

  await expect(button).toHaveCSS('opacity', '0');
  await expect(button).toHaveCSS('transition-duration', /0\.2s/);

  release(40);
  await expect(content(page)).toContainText('Reply line 40.');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden();
  await expect(jump(page)).toBeVisible();
  await expect(button).toHaveCSS('opacity', '1');

  const log = await record(page);

  await jump(page).click();
  await expect.poll(async () => (await log()).tops.length).toBeGreaterThan(0);

  const { tops } = await log();
  const end = await scroller(page).evaluate((node) => node.scrollHeight - node.clientHeight);

  expect(Math.abs(tops[0] - end)).toBeLessThanOrEqual(1);
  await expect(button).toHaveCSS('opacity', '0');
});

test('the jump button shows and hides without a fade under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openChat(page, 12);

  await expect(page.locator('.fb-message-list__jump')).toHaveCSS('transition-property', 'none');
});

test('the working logo pulses below the thread for the whole run and keeps its row when idle', async ({
  page,
}) => {
  await openChat(page, 12);
  await settled(page);

  const working = page.locator('.fb-working');
  const logo = working.locator('.fb-working__logo');
  const idle = await box(working);

  expect(idle.height).toBeGreaterThan(24);
  await expect(logo).toHaveCSS('visibility', 'hidden');
  await expect(logo).toHaveCSS('animation-name', 'none');

  const release = await holdSend(page);

  await send(page, 'A question that keeps the agent working');
  await expect(logo).toHaveCSS('visibility', 'visible');
  await expect(logo).toHaveCSS('animation-name', 'fb-working-pulse');
  await expect(logo).toHaveCSS('animation-duration', '1.6s');
  expect((await box(working)).height).toBe(idle.height);

  const size = await box(logo.locator('svg'));

  expect(Math.round(size.width / 0.88)).toBeLessThanOrEqual(32);

  release(4);
  await expect(content(page)).toContainText('Reply line 4.');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden();
  await expect(logo).toHaveCSS('visibility', 'hidden');
  await expect(logo).toHaveCSS('animation-name', 'none');
  await expect(working.getByRole('status')).toHaveText('');
  await expect(logo).toHaveAttribute('aria-hidden', 'true');
});

test('the working logo stays still under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openChat(page, 12);
  await settled(page);
  await holdSend(page);
  await send(page, 'A question under reduced motion');

  const logo = page.locator('.fb-working__logo');

  await expect(logo).toHaveCSS('visibility', 'visible');
  await expect(logo).toHaveCSS('animation-name', 'none');
});

test('opening a chat lands at the bottom on the first scroll, with no animation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const gaps: number[] = [];

    Object.assign(window, { scrollGaps: gaps });

    document.addEventListener(
      'scroll',
      (event) => {
        const node = event.target;

        if (node instanceof HTMLElement && node.classList.contains('fb-message-list__scroller')) {
          gaps.push(node.scrollHeight - node.clientHeight - node.scrollTop);
        }
      },
      { capture: true, passive: true },
    );
  });

  await openChat(page, 12);
  await settled(page);

  const gaps = await page.evaluate(
    () => (window as unknown as { scrollGaps: number[] }).scrollGaps,
  );

  expect(gaps.length).toBeGreaterThan(0);
  expect(gaps.every((gap) => gap < 1)).toBe(true);
});
