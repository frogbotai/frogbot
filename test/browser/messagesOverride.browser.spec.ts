import { expect, test } from '@playwright/test';

import { createMessage, deleteMessage, type SavedMessage } from './__helpers/messages';
import { collectionNavIcon, expandSidebar } from './__helpers/sidebar';
import { signIn } from './__helpers/signIn';
import { chatsSlug, messagesSlug } from './fixtures/question/shared';

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

test('sidebar gives Messages and Chats their own icons', async ({ page }) => {
  await expandSidebar(page);

  await expect(collectionNavIcon(page, messagesSlug)).toHaveClass(
    /\blucide-message-square-text-icon\b/,
  );
  await expect(collectionNavIcon(page, chatsSlug)).toHaveClass(/\blucide-bubble-chat-icon\b/);
});

for (const theme of ['light', 'dark']) {
  test(`sidebar chat icons inherit the text colour in the ${theme} theme`, async ({ page }) => {
    await expandSidebar(page);

    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme,
    );

    for (const slug of [chatsSlug, messagesSlug]) {
      const icon = collectionNavIcon(page, slug);

      await expect(icon).toHaveAttribute('stroke', 'currentColor');

      const colours = await icon.evaluate((svg) => ({
        stroke: getComputedStyle(svg).stroke,
        text: getComputedStyle(svg.parentElement!).color,
        paints: [...svg.querySelectorAll('[fill], [stroke]')].flatMap((element) => [
          element.getAttribute('fill'),
          element.getAttribute('stroke'),
        ]),
      }));

      expect(colours.stroke).toBe(colours.text);
      expect(
        colours.paints.filter(
          (paint) => paint !== null && paint !== 'none' && paint !== 'currentColor',
        ),
      ).toEqual([]);
    }
  });
}

test('collapsed rail omits collection icons and restores them when reopened', async ({ page }) => {
  await expandSidebar(page);

  await page.getByRole('button', { name: 'Close sidebar', exact: true }).click();

  await expect(page.locator('.frogbot-nav-shell')).toHaveAttribute(
    'data-nav-state',
    'desktop-nav-closed',
  );
  await expect(page.locator('#frogbot-nav-section-collections')).toHaveCount(0);
  await expect(collectionNavIcon(page, chatsSlug)).toHaveCount(0);
  await expect(collectionNavIcon(page, messagesSlug)).toHaveCount(0);

  await expandSidebar(page);

  await expect(collectionNavIcon(page, chatsSlug)).toHaveClass(/\blucide-bubble-chat-icon\b/);
  await expect(collectionNavIcon(page, messagesSlug)).toHaveClass(
    /\blucide-message-square-text-icon\b/,
  );
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
