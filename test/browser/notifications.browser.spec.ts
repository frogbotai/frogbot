import { expect, type Page, test } from '@playwright/test';

import { prepareView } from './__helpers/viewShots';
import { timezoneId } from './fixtures/crm/shared';

test.use({ timezoneId });

type Doc = { id: number };

const sam = { email: 'sam.notifications@example.com', password: 'sam-notifications-password' };

function mentionBody(id: number, label: string, text: string) {
  return {
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          children: [
            { type: 'mention', version: 1, value: id, relationTo: 'users', label },
            { type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' },
          ],
        },
      ],
    },
  };
}

async function samId(page: Page) {
  const found = await page.request.get(`/api/users?where[email][equals]=${sam.email}&depth=0`);
  const { docs } = (await found.json()) as { docs: Doc[] };

  if (docs[0]) return docs[0].id;

  const created = await page.request.post('/api/users', { data: { ...sam, name: 'Sam' } });

  expect(created.ok()).toBe(true);

  return ((await created.json()) as { doc: Doc }).doc.id;
}

test.beforeEach(async ({ page }) => {
  await prepareView(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('a mention lights the bell; opening it in the inbox marks it read and opens the record', async ({
  browser,
  page,
}) => {
  const id = await samId(page);
  const deal = await page.request.post('/api/deals', {
    data: { name: 'Notifications spec deal' },
  });

  const dealId = ((await deal.json()) as { doc: Doc }).doc.id;
  const comment = await page.request.post('/api/comments', {
    data: {
      collection: 'deals',
      documentId: String(dealId),
      body: mentionBody(id, 'Sam', ' can you check the logs?'),
    },
  });

  expect(comment.ok()).toBe(true);

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const samPage = await context.newPage();
  const login = await samPage.request.post('/api/users/login', { data: sam });

  expect(login.ok()).toBe(true);

  await samPage.goto('/');

  const bell = samPage.locator('.fb-bell');

  await expect(bell).toHaveAttribute('aria-label', /Notifications, \d+ unread/);

  const before = Number((await bell.locator('.fb-bell__badge').textContent()) ?? '0');

  await bell.click();
  await samPage.waitForURL(/\/notifications$/);

  const item = samPage
    .locator('.fb-inbox__item', { hasText: '@Sam can you check the logs?' })
    .first();

  await expect(item).toHaveClass(/fb-inbox__item--unread/);
  await expect(item).toContainText('mentioned you in a comment');

  await item.click();
  await samPage.waitForURL(new RegExp(`/collections/deals/${dealId}$`));

  await expect(samPage.locator('.fb-bell')).toHaveAttribute(
    'aria-label',
    before > 1 ? `Notifications, ${before - 1} unread` : 'Notifications',
  );

  await context.close();
});
