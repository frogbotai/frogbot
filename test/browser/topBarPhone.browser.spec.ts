import { expect, type Locator, type Page, test } from '@playwright/test';

import { agentSlug, chatsSlug, tasksSlug } from './fixtures/question/shared';

const chatTitle = 'Quarterly enterprise refund requests and customer support follow-up planning';
const taskTitle = 'Prepare the quarterly enterprise launch notes and customer support handover';

test.setTimeout(120_000);

test.use({ viewport: { width: 375, height: 667 } });

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

const bounds = (locator: Locator) =>
  locator.evaluate((element) => {
    const { left, right, top, bottom, width } = element.getBoundingClientRect();

    return { left, right, top, bottom, width };
  });

async function expectPhoneTopBar(page: Page, title: string) {
  const stepNav = page.locator('.app-header__step-nav');
  const leaf = stepNav.locator(':scope > .step-nav__last');
  const ancestors = stepNav.locator(':scope > :not(.step-nav__last)');
  const toggle = page.locator('.frogbot-mobile-nav-toggle');

  await expect(page.locator('.frogbot-nav-shell')).toHaveAttribute(
    'data-nav-state',
    'mobile-nav-closed',
  );
  await expect(leaf).toHaveText(title);
  await leaf.waitFor({ state: 'visible' });
  await toggle.waitFor({ state: 'visible' });

  expect(await ancestors.count()).toBeGreaterThan(0);

  await expect.soft(leaf).toBeVisible();

  for (const ancestor of await ancestors.all()) {
    await expect.soft(ancestor).toBeHidden();
  }

  await expect.soft(toggle).toHaveCSS('position', 'fixed');
  await expect.soft(leaf).toHaveCSS('max-width', 'none');

  const [leafBox, toggleBox, controlsRight, viewport] = await Promise.all([
    bounds(leaf),
    bounds(toggle),
    page.locator('.app-header__controls-wrapper').evaluate((element) => {
      const box = element.getBoundingClientRect();
      const paddingRight = parseFloat(getComputedStyle(element).paddingRight);

      return box.right - paddingRight;
    }),
    page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    })),
  ]);

  const overlapsToggle =
    leafBox.left < toggleBox.right &&
    leafBox.right > toggleBox.left &&
    leafBox.top < toggleBox.bottom &&
    leafBox.bottom > toggleBox.top;

  const availableWidth = Math.min(controlsRight, viewport.innerWidth) - toggleBox.right;

  expect.soft(overlapsToggle, 'the leaf label clears the fixed menu button').toBe(false);
  expect
    .soft(leafBox.left - toggleBox.right, 'the label leaves a gap after the toggle')
    .toBeGreaterThanOrEqual(12);
  expect.soft(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
  expect
    .soft(availableWidth, 'the phone header has more than 160px for its label')
    .toBeGreaterThan(160);
  expect.soft(leafBox.width, 'the long leaf label uses more than 160px').toBeGreaterThan(160);
}

test('the phone chat top bar shows only the long thread title clear of the menu button', async ({
  page,
}) => {
  const response = await page.request.post(`/api/${chatsSlug}`, {
    data: { title: chatTitle, agent: agentSlug },
  });

  expect(response.ok()).toBe(true);

  const chatId = (await response.json()).doc.id as number | string;

  await page.goto(`/collections/${chatsSlug}/${chatId}`);
  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await expectPhoneTopBar(page, chatTitle);
});

test('the phone task edit top bar shows only the long task title clear of the menu button', async ({
  page,
}) => {
  const response = await page.request.post(`/api/${tasksSlug}`, {
    data: { title: taskTitle, status: 'backlog' },
  });

  expect(response.ok()).toBe(true);

  const taskId = (await response.json()).doc.id as number | string;

  await page.goto(`/collections/${tasksSlug}/${taskId}`);
  await expect(page.locator('#field-title')).toHaveValue(taskTitle);

  await expectPhoneTopBar(page, taskTitle);
});

test('the phone create-chat top bar keeps the home icon clear of the menu button', async ({
  page,
}) => {
  await page.goto(`/collections/${chatsSlug}/create`);
  await expect(page.locator('.fb-composer textarea')).toBeVisible();
  await expect(page.locator('.frogbot-nav-shell')).toHaveAttribute(
    'data-nav-state',
    'mobile-nav-closed',
  );

  const home = page.locator('.app-header__step-nav .step-nav__home');
  const toggle = page.locator('.frogbot-mobile-nav-toggle');

  await expect(page.locator('.app-header__step-nav .step-nav__last')).toHaveCount(0);
  await expect(home).toBeVisible();
  await expect(toggle).toBeVisible();

  const [homeBox, toggleBox] = await Promise.all([bounds(home), bounds(toggle)]);

  expect(homeBox.left - toggleBox.right).toBeGreaterThanOrEqual(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

test('an unbroken 80-character phone title uses ellipsis without sideways scrolling', async ({
  page,
}) => {
  const title = 'X'.repeat(80);
  const response = await page.request.post(`/api/${chatsSlug}`, {
    data: { title, agent: agentSlug },
  });

  expect(response.ok()).toBe(true);

  const chatId = (await response.json()).doc.id as number | string;

  await page.goto(`/collections/${chatsSlug}/${chatId}`);
  await expect(page.locator('.fb-composer textarea')).toBeVisible();
  await expectPhoneTopBar(page, title);

  const leaf = page.locator('.app-header__step-nav .step-nav__last');

  await expect(leaf).toHaveCSS('text-overflow', 'ellipsis');
  await expect(leaf).toHaveCSS('overflow', 'hidden');
  await expect(leaf).toHaveCSS('white-space', 'nowrap');
  expect(await leaf.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});

test('opening the phone menu restores the full trail without moving the page body', async ({
  page,
}) => {
  const response = await page.request.post(`/api/${tasksSlug}`, {
    data: { title: taskTitle, status: 'backlog' },
  });

  expect(response.ok()).toBe(true);

  const taskId = (await response.json()).doc.id as number | string;

  await page.goto(`/collections/${tasksSlug}/${taskId}`);
  await expect(page.locator('#field-title')).toHaveValue(taskTitle);
  await expectPhoneTopBar(page, taskTitle);

  const content = page.locator('.template-default__wrap');
  const closedBox = await bounds(content);
  const ancestors = page.locator('.app-header__step-nav > :not(.step-nav__last)');

  await page.locator('.frogbot-mobile-nav-toggle').click();
  await expect(page.locator('.frogbot-nav-shell')).toHaveAttribute(
    'data-nav-state',
    'mobile-nav-open',
  );

  await expect(page.locator('.app-header__controls-wrapper')).toHaveCSS('padding-left', '0px');
  await expect(page.locator('.step-nav__last')).toHaveCSS('max-width', '160px');

  for (const ancestor of await ancestors.all()) {
    await expect(ancestor).toBeVisible();
  }

  expect(await bounds(content)).toEqual(closedBox);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);

  await page.keyboard.press('Escape');
  await expectPhoneTopBar(page, taskTitle);

  expect(await bounds(content)).toEqual(closedBox);
});

test('resizing to 1280px restores the unchanged desktop trail', async ({ page }) => {
  const response = await page.request.post(`/api/${tasksSlug}`, {
    data: { title: taskTitle, status: 'backlog' },
  });

  expect(response.ok()).toBe(true);

  const taskId = (await response.json()).doc.id as number | string;

  await page.goto(`/collections/${tasksSlug}/${taskId}`);
  await expect(page.locator('#field-title')).toHaveValue(taskTitle);
  await expectPhoneTopBar(page, taskTitle);

  const trail = await page.locator('.app-header__step-nav > *').allTextContents();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.frogbot-nav-shell')).toHaveAttribute(
    'data-nav-state',
    /desktop-nav-(open|closed)/,
  );

  await expect(page.locator('.frogbot-mobile-nav-toggle')).toHaveCount(0);
  await expect(page.locator('.app-header__controls-wrapper')).toHaveCSS('padding-left', '0px');
  await expect(page.locator('.step-nav__last')).toHaveCSS('max-width', '160px');
  expect(await page.locator('.app-header__step-nav > *').allTextContents()).toEqual(trail);

  for (const part of await page.locator('.app-header__step-nav > *').all()) {
    await expect(part).toBeVisible();
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);

  await page.setViewportSize({ width: 375, height: 667 });

  await expectPhoneTopBar(page, taskTitle);
  expect(await page.locator('.app-header__step-nav > *').allTextContents()).toEqual(trail);
});
