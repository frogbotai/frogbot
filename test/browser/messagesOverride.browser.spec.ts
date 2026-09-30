import { expect, test } from '@playwright/test';

import { createMessage, deleteMessage, type SavedMessage } from './__helpers/messages';
import { expandSidebar } from './__helpers/sidebar';
import { signIn } from './__helpers/signIn';
import { messagesSlug } from './fixtures/question/shared';

let saved: SavedMessage;

test.beforeEach(async ({ page }) => {
  await signIn(page);

  saved = await createMessage(page);
});

test.afterEach(async ({ page }) => {
  await deleteMessage(page, saved);
});

test('unhidden Messages appears directly under Collections with its icon', async ({ page }) => {
  await expandSidebar(page);

  const collections = page.locator('#frogbot-nav-section-collections');
  const messages = collections.getByRole('link', { name: 'Messages' });

  await expect(messages).toHaveAttribute('href', `/collections/${messagesSlug}`);
  await expect(messages.locator('svg')).toHaveCount(1);
  await expect(collections.locator('.frogbot-collections-section__group-label')).toHaveCount(0);
});

test('unhidden Messages list page opens', async ({ page }) => {
  await page.goto(`/collections/${messagesSlug}`);

  await expect(page.locator('.collection-list')).toBeVisible();
  await expect(page.locator('.not-found')).toHaveCount(0);
});

test('unhidden Messages document page opens', async ({ page }) => {
  await page.goto(`/collections/${messagesSlug}/${saved.messageId}`);

  await expect(page.locator('.collection-edit')).toBeVisible();
  await expect(page.locator('.not-found')).toHaveCount(0);
});
