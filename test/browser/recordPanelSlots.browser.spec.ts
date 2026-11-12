import { expect, type Page, test } from '@playwright/test';

const created: Array<{ collection: string; id: number }> = [];

async function create(
  page: Page,
  collection: string,
  title: string,
  data: Record<string, unknown> = {},
) {
  const response = await page.request.post(`/api/${collection}`, { data: { ...data, title } });
  expect(response.ok()).toBe(true);
  const { doc } = (await response.json()) as { doc: { id: number } };
  created.push({ collection, id: doc.id });

  return doc.id;
}

const panel = (page: Page) => page.locator('.fb-record-panel');
const recordParam = (page: Page) => new URL(page.url()).searchParams.get('record');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async ({ page }) => {
  for (const { collection, id } of created.splice(0)) {
    await page.request.delete(`/api/${collection}/${id}`);
  }
});

test('panel: false opens rows on the edit page and redirects ?record there', async ({ page }) => {
  const id = await create(page, 'notes', 'No panel note');

  await page.goto(`/collections/notes?record=${id}`);
  await expect(page).toHaveURL(new RegExp(`/collections/notes/${id}$`));

  await page.goto('/collections/notes');
  await page.locator('tbody tr', { hasText: 'No panel note' }).getByRole('link').first().click();
  await expect(page).toHaveURL(new RegExp(`/collections/notes/${id}$`));
  await expect(panel(page)).toHaveCount(0);
});

test('a drafts-autosave collection saves without a Save button', async ({ page }) => {
  const id = await create(page, 'journal', 'Autosaved entry');

  await page.goto(`/collections/journal?record=${id}`);
  const title = page.locator('.fb-record-panel-title__input');
  await expect(title).toHaveValue('Autosaved entry');
  await expect(page.locator('.fb-record-panel-header__save')).toHaveCount(0);

  await title.fill('Autosaved entry changed');

  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/journal/${id}?draft=true`);

      return ((await response.json()) as { title?: string }).title;
    })
    .toBe('Autosaved entry changed');
});

test('renders the actions, beforeFields and afterFields slots in place', async ({ page }) => {
  const id = await create(page, 'journal', 'Slotted entry');

  await page.goto(`/collections/journal?record=${id}`);
  const header = page.locator('.fb-record-panel-header');
  const action = header.getByTestId('panel-action');
  await expect(action).toHaveAttribute('data-id', String(id));
  await expect(header.locator('.fb-record-panel-header__actions > *').first()).toHaveAttribute(
    'data-testid',
    'panel-action',
  );

  const before = page.getByTestId('panel-before');
  await expect(before).toHaveText('Before Slotted entry with payload');
  const order = await page
    .locator(
      '.fb-record-panel-title, [data-testid="panel-before"], .fb-record-panel-properties, [data-testid="panel-after"]',
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => node.className || node.getAttribute('data-testid')),
    );

  expect(order).toEqual([
    'fb-record-panel-title',
    'panel-before',
    'fb-record-panel-properties',
    'panel-after',
  ]);
  await expect(page.locator('.fb-record-panel-properties .field-label')).toHaveText([/Mood/]);
  await expect(page.getByTestId('panel-after')).toHaveText('After journal');

  await action.getByRole('button', { name: 'Slot close' }).click();
  await expect(panel(page)).toHaveCount(0);
  expect(recordParam(page)).toBeNull();

  await page.goto(`/collections/journal?record=${id}`);
  await page.getByTestId('panel-action').getByRole('button', { name: 'Slot expand' }).click();
  await expect(page).toHaveURL(new RegExp(`/collections/journal/${id}$`));
});

test('replaces the header, or the whole panel', async ({ page }) => {
  const memo = await create(page, 'memos', 'Header memo');
  const card = await create(page, 'cards', 'Whole card');

  await page.goto(`/collections/memos?record=${memo}`);
  await expect(page.getByTestId('panel-header')).toContainText(`Memo ${memo}`);
  await expect(page.locator('.fb-record-panel-header')).toHaveCount(0);
  await expect(page.locator('.fb-record-panel-title__input')).toHaveValue('Header memo');
  await page.getByRole('button', { name: 'Header close' }).click();
  await expect(panel(page)).toHaveCount(0);

  await page.goto(`/collections/cards?record=${card}`);
  await expect(page.getByTestId('panel-whole')).toContainText(`Card ${card}: Whole card`);
  await expect(page.locator('.fb-record-panel .collection-edit')).toHaveCount(0);
  await page.getByRole('button', { name: 'Whole close' }).click();
  await expect(panel(page)).toHaveCount(0);

  await page.goto(`/collections/cards?record=${card}`);
  await page.getByRole('button', { name: 'Whole expand' }).click();
  await expect(page).toHaveURL(new RegExp(`/collections/cards/${card}$`));
});

test('a collection tab opens beside Details and keeps unsaved edits', async ({ page }) => {
  const first = await create(page, 'journal', 'Tabbed entry');
  const second = await create(page, 'journal', 'Second entry');

  await page.goto(`/collections/journal?record=${first}`);
  const tabs = page.getByRole('tablist', { name: 'Record tabs' }).getByRole('tab');
  await expect(tabs).toHaveText(['Details', 'History', 'Document links']);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('panel-tab-history')).toBeHidden();

  const mood = page.locator('.fb-record-panel-properties input');
  await mood.fill('Unsaved mood');
  await mood.evaluate((input) => input.setAttribute('data-mounted', 'kept'));

  await tabs.nth(1).click();
  await expect(page.getByTestId('panel-tab-history')).toHaveText(`History of journal ${first}`);
  await expect(page.locator('.fb-record-panel-properties')).toBeHidden();
  await expect(page.getByTestId('panel-before')).toBeHidden();
  await expect(page.getByTestId('panel-after')).toBeHidden();
  await expect(page.locator('.fb-record-panel-title__input')).toBeVisible();
  expect(recordParam(page)).toBe(String(first));

  await tabs.nth(1).press('ArrowRight');
  await expect(tabs.nth(2)).toBeFocused();
  await expect(page.getByTestId('panel-tab-links')).toHaveText(
    'Links of Tabbed entry with payload',
  );

  await tabs.nth(2).press('Home');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(mood).toHaveValue('Unsaved mood');
  await expect(mood).toHaveAttribute('data-mounted', 'kept');

  await tabs.nth(1).click();
  await page.goto(`/collections/journal?record=${second}`);
  await expect(page.locator('.fb-record-panel-title__input')).toHaveValue('Second entry');
  await tabs.nth(1).click();
  await page.locator('tbody tr', { hasText: 'Tabbed entry' }).getByRole('link').first().click();
  await expect(page.locator('.fb-record-panel-title__input')).toHaveValue('Tabbed entry');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.fb-record-panel-properties')).toBeVisible();
});

test('reopening or switching back to a record opens Details, not the last tab', async ({
  page,
}) => {
  const first = await create(page, 'journal', 'Reopen entry');
  const second = await create(page, 'journal', 'Other entry');
  const tabs = page.getByRole('tablist', { name: 'Record tabs' }).getByRole('tab');
  const title = page.locator('.fb-record-panel-title__input');

  await page.goto('/collections/journal');
  await page.locator('tbody tr', { hasText: 'Reopen entry' }).getByRole('link').first().click();
  await expect(title).toHaveValue('Reopen entry');
  await tabs.nth(1).click();
  await expect(page.getByTestId('panel-tab-history')).toBeVisible();

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await page.locator('tbody tr', { hasText: 'Reopen entry' }).getByRole('link').first().click();
  await expect(title).toHaveValue('Reopen entry');
  expect(recordParam(page)).toBe(String(first));
  await expect(tabs.first(), 'close then reopen').toHaveAttribute('aria-selected', 'true');

  await tabs.nth(1).click();
  await page.locator('tbody tr', { hasText: 'Other entry' }).getByRole('link').first().click();
  await expect(title).toHaveValue('Other entry');
  expect(recordParam(page)).toBe(String(second));
  await page.locator('tbody tr', { hasText: 'Reopen entry' }).getByRole('link').first().click();
  await expect(title).toHaveValue('Reopen entry');
  await expect(tabs.first(), 'switch away and back').toHaveAttribute('aria-selected', 'true');
});

const recordTabs = (page: Page) =>
  page.getByRole('tablist', { name: 'Record tabs' }).getByRole('tab');

test('a tab hides the auth block of an auth collection', async ({ page }) => {
  const id = await create(page, 'members', 'Tabbed member', {
    email: `member-${Date.now()}@example.com`,
    password: 'password-123',
  });

  await page.goto(`/collections/members?record=${id}`);
  const email = page.locator('.fb-record-panel #field-email');
  await expect(email).toBeVisible();
  await recordTabs(page).nth(1).click();
  await expect(page.getByTestId('panel-tab-history')).toBeVisible();
  await expect(email).toBeHidden();
});

test('a tab hides the file manager of an upload collection', async ({ page }) => {
  const response = await page.request.post('/api/files', {
    multipart: {
      _payload: JSON.stringify({ title: 'Tabbed file' }),
      file: { buffer: Buffer.from('tabbed'), mimeType: 'text/plain', name: 'tabbed.txt' },
    },
  });

  expect(response.ok()).toBe(true);
  const { doc } = (await response.json()) as { doc: { id: number } };
  created.push({ collection: 'files', id: doc.id });

  await page.goto(`/collections/files?record=${doc.id}`);
  const upload = page.locator(
    '.fb-record-panel .collection-edit__main-wrapper > :not(.collection-edit__main)',
  );

  await expect(upload.first()).toBeVisible();
  await recordTabs(page).nth(1).click();
  await expect(page.getByTestId('panel-tab-history')).toBeVisible();
  await expect(upload.first()).toBeHidden();
});

test('a failed save with a tab open returns to Details and shows the invalid field', async ({
  page,
}) => {
  const id = await create(page, 'tasks', 'Invalid task', { body: 'Body' });

  await page.goto(`/collections/tasks?record=${id}`);
  const body = page.locator('.fb-record-panel #field-body');
  await body.fill('');
  await recordTabs(page).nth(1).click();
  await expect(body).toBeHidden();

  await page.locator('.fb-record-panel-header__save').click();
  await expect(page.locator('.payload-toast-container')).toContainText(/invalid/i);
  await expect(recordTabs(page).first()).toHaveAttribute('aria-selected', 'true');
  await expect(body).toBeVisible();
});

test('selecting a tab that does not exist leaves Details open', async ({ page }) => {
  const id = await create(page, 'tasks', 'Missing tab task', { body: 'Body' });

  await page.goto(`/collections/tasks?record=${id}`);
  const body = page.locator('.fb-record-panel #field-body');
  await expect(body).toBeVisible();
  await page.getByRole('button', { name: 'Select missing tab' }).click();
  await expect(body).toBeVisible();
  await expect(recordTabs(page).first()).toHaveAttribute('aria-selected', 'true');
  await expect(panel(page)).not.toHaveAttribute('data-tab');

  await page.locator('.fb-record-panel-header__menu .popup__trigger-wrap').click();
  await page.locator('#action-panel-create').click();
  await expect(recordTabs(page)).toHaveCount(0);
  await expect(body).toHaveValue('');
  await page.getByRole('button', { name: 'Select missing tab' }).click();
  await expect(body).toBeVisible();
});

test('every tab, Details included, controls a tab panel', async ({ page }) => {
  const id = await create(page, 'journal', 'Labelled entry');

  await page.goto(`/collections/journal?record=${id}`);
  const tabs = recordTabs(page);
  await expect(tabs).toHaveCount(3);

  for (const index of [0, 1, 2]) {
    const tab = tabs.nth(index);
    await expect(tab, `tab ${index}`).toHaveAttribute('aria-controls', /.+/);
    const tabPanel = page.locator(`[id="${(await tab.getAttribute('aria-controls')) ?? ''}"]`);
    await expect(tabPanel).toHaveAttribute('role', 'tabpanel');
    await expect(tabPanel).toHaveAttribute('aria-labelledby', (await tab.getAttribute('id')) ?? '');
  }
});
