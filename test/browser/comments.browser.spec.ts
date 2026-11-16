import { expect, type Page, test } from '@playwright/test';

import { user } from './__helpers/signIn';
import { prepareView } from './__helpers/viewShots';
import { timezoneId } from './fixtures/crm/shared';

test.use({ timezoneId });

type Deal = { id: number; name: string };

async function createDeal(page: Page, name: string) {
  const response = await page.request.post('/api/deals', {
    data: { name: `Comments spec ${name}` },
  });

  expect(response.ok()).toBe(true);

  return ((await response.json()) as { doc: Deal }).doc;
}

const name = 'Browser Tester';
const comments = (page: Page) => page.locator('.fb-comments');
const editor = (page: Page) => comments(page).locator('[contenteditable="true"]');

async function writeComment(page: Page) {
  await editor(page).click();
  await page.keyboard.type('Please check ');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('today');
  await page.keyboard.press('ControlOrMeta+b');
  const searched = page.waitForResponse(
    (response) => response.url().includes('/api/users?') && response.url().includes('brow'),
  );

  await page.keyboard.type(' @brow');
  await searched;

  const option = page.locator('.fb-mention-menu__item', { hasText: name });

  await expect(option).toBeVisible();
  await expect(option.locator('.fb-mention-menu__name strong')).toHaveText('Brow');
  await expect(option.locator('.fb-mention-menu__email')).toHaveText(user.email);
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(editor(page).locator('.fb-mention')).toHaveText(`@${name}`);
  await comments(page).getByRole('button', { name: 'Comment' }).click();
}

test.beforeEach(async ({ page }) => {
  await prepareView(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('posts a bold comment with a mention on the edit page, leaving the form clean', async ({
  page,
}) => {
  const deal = await createDeal(page, 'edit page');

  await page.goto(`/collections/deals/${deal.id}`);

  await expect(page.getByRole('tab', { name: 'Comments' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Activity' })).toBeVisible();
  await expect(comments(page).locator('.fb-panel-section__heading')).toHaveCount(0);
  await expect(comments(page)).toContainText('No comments yet.');

  await writeComment(page);

  const item = comments(page).locator('.fb-comments__item');

  await expect(item).toHaveCount(1);
  await expect(item.locator('strong', { hasText: 'today' })).toBeVisible();
  await expect(item.locator('.mention')).toHaveText(`@${name}`);
  await expect(item.locator('.fb-comments__meta')).toContainText(`${name}·Just now`);
  await expect(item.locator('.fb-user-avatar')).toBeVisible();
  await expect(editor(page)).not.toContainText('Please check');

  const stored = await page.request.get(
    `/api/comments?where[documentId][equals]=${deal.id}&where[collection][equals]=deals&depth=0`,
  );

  const { docs } = (await stored.json()) as { docs: { mentions: number[] }[] };

  expect(docs).toHaveLength(1);
  expect(docs[0].mentions).toHaveLength(1);

  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.locator('.fb-activity')).toContainText('created this');
  await expect(page.locator('.fb-activity .fb-panel-section__heading')).toHaveCount(0);

  await page.reload();
  await page.getByRole('tab', { name: 'Comments' }).click();
  await expect(comments(page).locator('.fb-comments__item')).toHaveCount(1);

  const posted = comments(page).locator('.fb-comments__item');

  await posted.hover();
  await posted.getByRole('button', { name: 'Comment options' }).click();
  await page.getByRole('menuitem', { name: 'Edit comment' }).click();
  await posted.locator('[contenteditable="true"]').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Thanks!');
  await posted.getByRole('button', { name: 'Save' }).click();
  await expect(posted.locator('.fb-comments__body')).toContainText('Thanks!');
  await expect(posted.locator('.fb-comments__edited')).toHaveText('(edited)');

  await posted.hover();
  await posted.getByRole('button', { name: 'Comment options' }).click();
  await page.getByRole('menuitem', { name: 'Delete comment' }).click();
  await expect(comments(page)).toContainText('No comments yet.');
});

test('says when nobody matches the mention', async ({ page }) => {
  const deal = await createDeal(page, 'no match');

  await page.goto(`/collections/deals/${deal.id}`);
  await editor(page).click();
  await page.keyboard.type('@zzqxw');
  await expect(page.locator('.fb-mention-menu__empty')).toHaveText('No people match');
  await expect(page.locator('.fb-mention-menu__item')).toHaveCount(0);
});

test('posts from the record panel without asking to discard edits', async ({ page }) => {
  const deal = await createDeal(page, 'panel');

  await page.goto(`/collections/deals/board?record=${deal.id}`);

  const panel = page.locator('.fb-record-panel');

  await expect(panel.locator('.fb-comments')).toBeVisible();

  await writeComment(page);
  await expect(panel.locator('.fb-comments__item')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('#fb-record-panel-leave')).toBeHidden();
  await expect(panel).toHaveCount(0);
});

test('shows initials on rows and chips, full names and emails in the menu, and keeps chips readable in dark mode', async ({
  page,
}) => {
  await page.request.post('/api/users', {
    data: { email: 'brownie@example.com', name: 'Brownie Two', password: 'brownie-password' },
  });

  const deal = await createDeal(page, 'people');

  await page.goto(`/collections/deals/${deal.id}`);
  await editor(page).click();

  const searched = page.waitForResponse(
    (response) => response.url().includes('/api/users?') && response.url().includes('brow'),
  );

  await page.keyboard.type('Hi @brow');
  await searched;

  const options = page.locator('.fb-mention-menu__item');

  await expect(options).toHaveCount(2);

  for (const part of ['.fb-mention-menu__name', '.fb-mention-menu__email']) {
    const cut = await options
      .locator(part)
      .evaluateAll(
        (elements) =>
          elements.filter((element) => element.scrollWidth > element.clientWidth).length,
      );

    expect(cut).toBe(0);
  }

  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');

  const chip = editor(page).locator('.fb-mention');

  await expect(chip.locator('.fb-mention__avatar')).toHaveText('BT');
  await comments(page).getByRole('button', { name: 'Comment' }).click();

  const item = comments(page).locator('.fb-comments__item');

  await expect(item.locator('.fb-comments__avatar')).toHaveText('BT');
  await expect(item.locator('.mention .fb-mention__avatar')).toHaveText('BT');

  await page.emulateMedia({ colorScheme: 'dark' });

  const colors = await item.locator('.mention').evaluate((element) => {
    const style = getComputedStyle(element);

    return { background: style.backgroundColor, color: style.color };
  });

  expect(colors.background).not.toBe(colors.color);
  expect(colors.background).not.toBe('rgb(255, 255, 255)');
});
