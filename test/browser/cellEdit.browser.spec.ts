import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, type Locator, type Page, test } from '@playwright/test';

import { setAdminTheme } from './__helpers/adminTheme';
import { prepareView, themes, viewports } from './__helpers/viewShots';
import { timezoneId } from './fixtures/crm/shared';

test.use({ timezoneId });

const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-results', 'crm-views');

type Doc = Record<string, unknown> & { id: number | string };

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

async function create(page: Page, collection: string, data: Record<string, unknown>) {
  const response = await page.request.post(`/api/${collection}`, { data });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc as Doc;
}

async function stored(page: Page, collection: string, id: number | string) {
  const response = await page.request.get(`/api/${collection}/${id}?depth=0`);

  return (await response.json()) as Doc;
}

function cell(page: Page, title: string, column: string) {
  return page.locator('tbody tr', { hasText: title }).locator(`td.cell-${column}`);
}

function editor(target: Locator) {
  return target.locator('.fb-cell-editor');
}

function patches(page: Page) {
  const sent: string[] = [];

  page.on('request', (request) => {
    if (request.method() === 'PATCH' && new URL(request.url()).pathname.startsWith('/api/')) {
      sent.push(request.url());
    }
  });

  return sent;
}

async function openDeals(page: Page, search: string) {
  await prepareView(page);
  await page.goto(`/collections/deals?search=${encodeURIComponent(search)}&groupBy=`);
}

async function openTasks(page: Page, search: string) {
  await prepareView(page);
  await page.goto(`/collections/tasks?search=${encodeURIComponent(search)}`);
}

test('edits money, select, date and relationship cells, and Esc restores', async ({ page }) => {
  const name = `Cells ${stamp()}`;
  const company = await create(page, 'companies', { name: `Acme ${stamp()}` });
  const deal = await create(page, 'deals', { name, amount: 1000, stage: 'lead' });

  await openDeals(page, name);

  const amount = cell(page, name, 'amount');

  await amount.click();
  await expect(editor(amount).locator('input')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('2500');
  await page.keyboard.press('Enter');

  await expect(editor(amount)).toHaveCount(0);
  await expect(amount).toBeFocused();
  await expect.poll(async () => (await stored(page, 'deals', deal.id)).amount).toBe(2500);
  await expect(amount).toContainText('$2,500.00');

  const sent = patches(page);

  await amount.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('9');
  await page.keyboard.press('Escape');

  await expect(editor(amount)).toHaveCount(0);
  await expect(amount).toContainText('$2,500.00');
  expect(sent).toEqual([]);

  const stage = cell(page, name, 'stage');

  await stage.click();
  await page.keyboard.type('Won');
  await expect(page.locator('.rs__menu')).toContainText('Won');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await stored(page, 'deals', deal.id)).stage).toBe('won');
  await expect(stage).toContainText('Won');

  const closeDate = cell(page, name, 'closeDate');

  await closeDate.click();
  await editor(closeDate).locator('input').fill('Jun 20, 2026');
  await page.keyboard.press('Enter');
  await expect(editor(closeDate)).toHaveCount(0);

  await expect
    .poll(async () => String((await stored(page, 'deals', deal.id)).closeDate))
    .toMatch(/^2026-06-2[01]/);
  await expect(closeDate).toContainText('Jun 20, 2026');

  const relation = cell(page, name, 'company');

  await relation.click();
  await page.keyboard.type(String(company.name));
  await expect(page.locator('.rs__menu')).toContainText(String(company.name));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await stored(page, 'deals', deal.id)).company).toBe(company.id);
  await expect(relation).toContainText(String(company.name));
});

test('typing starts an edit, Tab saves and moves on, wrapping to the next row', async ({
  page,
}) => {
  const tag = stamp();
  const first = await create(page, 'deals', { name: `Tab A ${tag}`, amount: 1, stage: 'lead' });
  const second = await create(page, 'deals', { name: `Tab B ${tag}`, amount: 2, stage: 'lead' });

  await openDeals(page, tag);

  const amount = cell(page, String(first.name), 'amount');

  await amount.click();
  await page.keyboard.press('Escape');
  await expect(amount).toBeFocused();

  await page.keyboard.press('7');
  await expect(editor(amount).locator('input')).toHaveValue('7');
  await page.keyboard.press('Tab');

  const closeDate = cell(page, String(first.name), 'closeDate');

  await expect(editor(closeDate)).toHaveCount(1);
  await expect.poll(async () => (await stored(page, 'deals', first.id)).amount).toBe(7);

  await page.keyboard.press('Shift+Tab');
  await expect(editor(amount)).toHaveCount(1);
  await page.keyboard.press('Escape');

  const owner = cell(page, String(first.name), 'owner');
  const rows = page.locator('tbody tr');
  const firstRow = rows.filter({ hasText: String(first.name) });
  const nextRow = rows.nth(
    (await rows.allInnerTexts()).findIndex((text) => text.includes(String(first.name))) + 1,
  );

  await owner.click();
  await expect(editor(owner)).toHaveCount(1);
  await page.keyboard.press('Tab');

  await expect(editor(firstRow.locator('td'))).toHaveCount(0);
  await expect(editor(nextRow.locator('td.cell-company'))).toHaveCount(1);
  await page.keyboard.press('Escape');

  expect((await stored(page, 'deals', second.id)).amount).toBe(2);
});

test('arrows move between cells and Enter starts an edit', async ({ page }) => {
  const name = `Arrows ${stamp()}`;

  await create(page, 'deals', { name, amount: 5, stage: 'lead' });
  await openDeals(page, name);

  const amount = cell(page, name, 'amount');

  await amount.click();
  await page.keyboard.press('Escape');
  await expect(amount).toBeFocused();

  await page.keyboard.press('ArrowLeft');
  await expect(cell(page, name, 'stage')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, name, 'closeDate')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(editor(cell(page, name, 'closeDate'))).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(cell(page, name, 'closeDate')).toBeFocused();
});

test('a failed save shows the error and keeps the typed value', async ({ page }) => {
  const name = `Denied ${stamp()}`;
  const deal = await create(page, 'deals', { name, amount: 10, stage: 'lead' });

  await openDeals(page, name);

  await page.route(
    (url) => url.pathname === `/api/deals/${deal.id}`,
    (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            contentType: 'application/json',
            json: { errors: [{ message: 'You are not allowed to perform this action.' }] },
            status: 403,
          })
        : route.fallback(),
  );

  const amount = cell(page, name, 'amount');

  await amount.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('99');
  await page.keyboard.press('Enter');

  await expect(page.getByText('You are not allowed to perform this action.')).toBeVisible();
  await expect(editor(amount).locator('input')).toHaveValue('99');

  await page.keyboard.press('Escape');
  await expect(editor(amount)).toHaveCount(0);
  await expect(amount).toContainText('$10.00');
  expect((await stored(page, 'deals', deal.id)).amount).toBe(10);
});

test('clicking elsewhere saves, and the open panel shows the new value', async ({ page }) => {
  const name = `Panel ${stamp()}`;
  const deal = await create(page, 'deals', { name, amount: 100, stage: 'lead' });

  await openDeals(page, name);

  await page.locator('tbody tr', { hasText: name }).getByRole('link', { name }).click();
  await expect(page.locator('.fb-record-panel')).toBeVisible();

  const amount = cell(page, name, 'amount');

  await amount.click();
  await expect(page.locator('.fb-record-panel')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('321');
  await page.locator('.fb-record-panel').getByText('Amount', { exact: true }).click();

  await expect(editor(amount)).toHaveCount(0);
  await expect.poll(async () => (await stored(page, 'deals', deal.id)).amount).toBe(321);
  await expect(page.locator('.fb-record-panel input[name="amount"]')).toHaveValue('321');
});

test('select-all pressed while the editor loads selects the old value', async ({ page }) => {
  const name = `SelectAll ${stamp()}`;
  const deal = await create(page, 'deals', { name, amount: 100, stage: 'lead' });

  let release = () => undefined as void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await openDeals(page, name);

  await page.route(`**/api/deals/${deal.id}?*`, async (route) => {
    if (route.request().method() === 'GET') await held;
    await route.fallback();
  });

  const amount = cell(page, name, 'amount');

  await amount.click();
  await page.keyboard.press('ControlOrMeta+a');
  release();
  await expect(editor(amount).locator('input')).toBeFocused();
  await page.keyboard.type('321');
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await stored(page, 'deals', deal.id)).amount).toBe(321);
});

test('selection, the row link and plain cells never start an edit', async ({ page }) => {
  const name = `Plain ${stamp()}`;

  await create(page, 'tasks', { title: name, status: 'todo' });
  await openTasks(page, name);

  const row = page.locator('tbody tr', { hasText: name });

  await row.locator('td.cell-_select input[type="checkbox"]').check();
  await expect(page.locator('.fb-cell-editor')).toHaveCount(0);
  await expect(row.locator('td.cell-title')).not.toHaveAttribute('data-cell-edit');
  await expect(row.locator('td.cell-deal')).not.toHaveAttribute('data-cell-edit');
  await expect(row.locator('td.cell-status')).toHaveAttribute('data-cell-edit', 'status');

  await row.locator('td.cell-deal').click();
  await expect(page.locator('.fb-record-panel')).toBeVisible();
  await expect(page.locator('.fb-cell-editor')).toHaveCount(0);
});

test('a checkbox cell shows a checkbox, and one click saves it in place', async ({ page }) => {
  const name = `Check ${stamp()}`;
  const task = await create(page, 'tasks', { title: name, completed: false });
  const sent = patches(page);

  await openTasks(page, name);

  const completed = cell(page, name, 'completed');
  const box = completed.getByRole('checkbox', { name: 'Completed' });

  await expect(box).not.toBeChecked();
  await expect(box).toBeEnabled();
  await expect(completed.locator('code')).toHaveCount(0);
  await expect(completed).not.toHaveAttribute('data-cell-edit');

  await box.click();
  await expect(box).toBeChecked();
  await expect(editor(completed)).toHaveCount(0);
  await expect.poll(async () => (await stored(page, 'tasks', task.id)).completed).toBe(true);
  expect(sent).toHaveLength(1);

  await page.reload();
  await expect(box).toBeChecked();

  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).not.toBeChecked();
  await expect.poll(async () => (await stored(page, 'tasks', task.id)).completed).toBe(false);
});

test('a failed checkbox save shows the error and puts the box back', async ({ page }) => {
  const name = `Check fail ${stamp()}`;

  await create(page, 'tasks', { title: name, completed: false });
  await openTasks(page, name);

  await page.route('**/api/tasks/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          body: JSON.stringify({ errors: [{ message: 'Tasks are frozen' }] }),
          contentType: 'application/json',
          status: 400,
        })
      : route.fallback(),
  );

  const box = cell(page, name, 'completed').getByRole('checkbox', { name: 'Completed' });

  await box.click();
  await expect(page.getByText('Tasks are frozen')).toBeVisible();
  await expect(box).not.toBeChecked();
});

test('a checkbox column the view does not edit shows a read-only checkbox', async ({ page }) => {
  const title = `All day ${stamp()}`;

  await create(page, 'activities', {
    allDay: true,
    end: '2026-03-02T10:00:00.000Z',
    start: '2026-03-02T09:00:00.000Z',
    title,
  });

  await prepareView(page);

  await page.goto(
    `/collections/activities?search=${encodeURIComponent(title)}&columns=${encodeURIComponent(JSON.stringify(['title', 'allDay']))}`,
  );

  const box = cell(page, title, 'allDay').getByRole('checkbox');

  await expect(box).toBeChecked();
  await expect(box).toBeDisabled();
  await expect(cell(page, title, 'allDay').locator('code')).toHaveCount(0);
});

async function pickPriority(page: Page, target: Locator, label: string) {
  await target.click();
  await expect(page.locator('.rs__menu')).toBeVisible();
  await page.locator('.rs__menu .rs__option', { hasText: label }).click();
  await page.keyboard.press('Enter');
  await expect(editor(target)).toHaveCount(0);
}

test('a cell edit on the record open in the panel with unsaved edits asks first', async ({
  page,
}) => {
  const title = `PanelGuard ${stamp()}`;
  const task = await create(page, 'tasks', { title, priority: 'low', notes: 'old' });

  await openTasks(page, title);
  await page.locator('tbody tr', { hasText: title }).getByRole('link', { name: title }).click();

  const panel = page.locator('.fb-record-panel');
  const notes = panel.locator('textarea[name="notes"], #field-notes').first();
  const modal = page.locator('#fb-record-panel-leave');
  const priority = cell(page, title, 'priority');

  await notes.fill('new notes');
  await priority.click();
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Stay on this page' }).click();
  await expect(editor(priority)).toHaveCount(0);
  await expect(notes).toHaveValue('new notes');

  await priority.click();
  await modal.getByRole('button', { name: 'Leave anyway' }).click();
  await expect(page.locator('.rs__menu')).toBeVisible();
  await page.locator('.rs__menu .rs__option', { hasText: 'High' }).click();
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await stored(page, 'tasks', task.id)).priority).toBe('high');
  await expect(notes).toHaveValue('old');
  await expect(panel).toContainText('High');
  await expect(page.locator('#document-stale-data')).toHaveCount(0);

  await notes.fill('newer notes');
  await panel.locator('.fb-record-panel-header__save').click();
  await expect.poll(async () => (await stored(page, 'tasks', task.id)).notes).toBe('newer notes');
  expect((await stored(page, 'tasks', task.id)).priority).toBe('high');
});

test('saving a cell keeps the row selected', async ({ page }) => {
  const title = `Select ${stamp()}`;
  const task = await create(page, 'tasks', { title, priority: 'low' });

  await openTasks(page, title);

  const select = page
    .locator('tbody tr', { hasText: title })
    .locator('td.cell-_select input[type="checkbox"]');

  await select.check();
  await pickPriority(page, cell(page, title, 'priority'), 'High');
  await expect.poll(async () => (await stored(page, 'tasks', task.id)).priority).toBe('high');
  await expect(cell(page, title, 'priority')).toContainText('High');
  await expect(select).toBeChecked();
});

async function shootEditing(page: Page, target: Locator, file: string, open?: Locator) {
  await target.scrollIntoViewIfNeeded();
  await target.click();
  await expect(editor(target).locator('input').first()).toBeFocused();
  if (open) await expect(open).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: path.join(shots, file) });
}

test('shoots the deals list editing a money and a select cell', async ({ page }) => {
  test.setTimeout(90_000);

  await prepareView(page);

  for (const colorScheme of themes) {
    await setAdminTheme(page, colorScheme);
    await page.emulateMedia({ colorScheme });

    for (const viewport of viewports) {
      const suffix = `${colorScheme}-${viewport.width}.png`;

      await page.setViewportSize(viewport);
      await page.goto('/collections/deals');

      const row = page
        .locator('tbody tr')
        .filter({ has: page.locator('td.cell-amount') })
        .first();

      const amount = row.locator('td.cell-amount');
      const stage = row.locator('td.cell-stage');

      await shootEditing(page, amount, `deals-cell-edit-amount-${suffix}`);
      await page.keyboard.press('Escape');
      await expect(editor(amount)).toHaveCount(0);

      await shootEditing(page, stage, `deals-cell-edit-stage-${suffix}`, page.locator('.rs__menu'));
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(editor(stage)).toHaveCount(0);
    }
  }
});
