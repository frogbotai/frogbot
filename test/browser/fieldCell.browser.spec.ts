import { expect, type Locator, test } from '@playwright/test';

import { channelChat, chatsSlug, tasksSlug } from './fixtures/question/shared';

const day = '2026-01-15';

const marked = {
  title: 'Reply on Slack',
  status: 'backlog',
  channel: 'slack',
  dueAt: `${day}T12:00:00.000Z`,
};

const plain = { title: 'File the report', status: 'backlog', dueAt: `${day}T15:00:00.000Z` };

const calendarPath = `/collections/${tasksSlug}/calendar?mode=month&date=${day}T00:00:00.000Z`;

async function expectBadge(scope: Locator) {
  const badge = scope.locator('.channel-cell');

  await expect(badge).toHaveText('slack');
  await expect(badge).toHaveCSS('border-radius', '999px');
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  for (const data of [marked, plain]) {
    expect((await page.request.post(`/api/${tasksSlug}`, { data })).ok()).toBe(true);
  }
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test('a Board card grouped by a field in a row shows the channel badge', async ({ page }) => {
  await page.goto(`/collections/${tasksSlug}/board`);

  const backlog = page.locator('.frog-board__column', {
    has: page.locator('.frog-board__column-header', { hasText: 'Backlog' }),
  });

  const card = backlog.locator('.frog-board__card', { hasText: marked.title });

  await expectBadge(card);
  await expect(card.locator('.collection-board__field', { hasText: /^Status/ })).toContainText(
    'Backlog',
  );
});

test('a Board card without a channel shows no badge', async ({ page }) => {
  await page.goto(`/collections/${tasksSlug}/board`);

  const card = page.locator('.frog-board__card', { hasText: plain.title });

  await expect(card.locator('.collection-board__title')).toHaveText(plain.title);
  await expect(card.locator('.collection-board__field', { hasText: /^Status/ })).toContainText(
    'Backlog',
  );
  await expect(card.locator('.channel-cell')).toHaveCount(0);
});

test('a Calendar event shows the channel badge', async ({ page }) => {
  await page.goto(calendarPath);

  const event = page.locator('.frog-calendar__event', { hasText: marked.title });

  await expectBadge(event);
  await expect(event.locator('.collection-calendar__field', { hasText: /^Status/ })).toContainText(
    'Backlog',
  );
});

test('a Calendar event without a channel shows no badge', async ({ page }) => {
  await page.goto(calendarPath);

  const event = page.locator('.frog-calendar__event', { hasText: plain.title });

  await expect(event.locator('.collection-calendar__title')).toHaveText(plain.title);
  await expect(event.locator('.channel-cell')).toHaveCount(0);
});

test('the tasks List shows the channel badge only where a channel is set', async ({ page }) => {
  const columns = encodeURIComponent(JSON.stringify(['title', 'status', 'channel']));

  await page.goto(`/collections/${tasksSlug}?columns=${columns}`);

  const markedRow = page.getByRole('row', { name: new RegExp(marked.title) });
  const plainRow = page.getByRole('row', { name: new RegExp(plain.title) });

  await expectBadge(markedRow.locator('td.cell-channel'));
  await expect(plainRow.locator('td.cell-channel')).toHaveCount(1);
  await expect(plainRow.locator('td.cell-channel .channel-cell')).toHaveCount(0);
});

test('the chats List shows the channel badge', async ({ page }) => {
  expect((await page.request.post('/api/browser/channel-chat')).ok()).toBe(true);

  await page.goto(`/collections/${chatsSlug}`);

  const row = page.getByRole('row', { name: new RegExp(channelChat.title) });

  await expectBadge(row.locator('td.cell-channel'));
});
