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

const comments = (page: Page) => page.locator('.fb-comments');
const editor = (page: Page) => comments(page).locator('[contenteditable="true"]');

async function writeComment(page: Page) {
  await editor(page).click();
  await page.keyboard.type('Please check ');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('today');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type(' @');
  await page.keyboard.type(user.email.slice(0, 4));

  const option = page.locator('.slash-menu-popup__item', { hasText: user.email });

  await expect(option).toBeVisible();
  await option.click();
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
  await expect(item.locator('.mention')).toHaveText(`@${user.email}`);
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

  await comments(page).getByRole('button', { name: 'Delete' }).click();
  await expect(comments(page)).toContainText('No comments yet.');
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
