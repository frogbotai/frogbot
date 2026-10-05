import { expect, type Locator, type Page, test } from '@playwright/test';

import { aiFieldName, aiFieldPath, tasksSlug } from './fixtures/question/shared';

type ID = number | string;

type AIState = {
  status: 'pending' | 'done' | 'error' | 'manual' | null;
  value?: string | null;
  error?: string | null;
};

type TaskData = { title: string; notes?: string; status?: string };

const statusPath = `_${aiFieldName}_status`;

const listPath = `/collections/${tasksSlug}?columns=${encodeURIComponent(
  JSON.stringify(['title', aiFieldName]),
)}`;

async function createTask(page: Page, data: TaskData): Promise<ID> {
  const response = await page.request.post(`/api/${tasksSlug}`, { data });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc.id;
}

async function setState(page: Page, id: ID, state: AIState): Promise<void> {
  const response = await page.request.post(`/api${aiFieldPath}`, { data: { id, ...state } });

  expect(response.ok()).toBe(true);
}

async function storedTask(page: Page, id: ID): Promise<Record<string, unknown>> {
  const response = await page.request.get(`/api/${tasksSlug}/${id}?depth=0`);

  expect(response.ok()).toBe(true);

  return response.json();
}

async function expectStoredStatus(page: Page, id: ID, status: string | null): Promise<void> {
  expect((await storedTask(page, id))[statusPath] ?? null).toBe(status);
}

function listRow(page: Page, title: string): Locator {
  return page.locator('tr', {
    has: page.locator('td.cell-title', { hasText: new RegExp(`^${title}$`) }),
  });
}

function listCell(page: Page, title: string): Locator {
  return listRow(page, title).locator(`td.cell-${aiFieldName}`);
}

function listPathWith(query: string): string {
  return `${listPath}&${query}`;
}

async function gotoList(page: Page, path: string = listPath): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('columnheader').getByRole('checkbox')).toBeEnabled();
}

function bulkEntry(page: Page): Locator {
  return page.getByRole('button', { name: 'Regenerate Summary…' });
}

async function openBulkDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'More options' }).click();
  await bulkEntry(page).click();

  const dialog = page.getByRole('dialog', { name: 'Regenerate Summary' });

  await expect(dialog).toBeVisible();

  return dialog;
}

async function confirmBulk(dialog: Locator, choice?: string): Promise<void> {
  if (choice) await dialog.getByRole('radio', { name: choice }).check();

  await dialog.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function markPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __aiMarker: number }).__aiMarker = 1;
  });
}

async function expectSamePage(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { __aiMarker?: number }).__aiMarker)).toBe(
    1,
  );
}

async function createNeverRun(page: Page, data: TaskData): Promise<ID> {
  const id = await createTask(page, data);

  await setState(page, id, { status: null });

  return id;
}

function boardSummary(page: Page, title: string): Locator {
  return page.locator('.frog-board__card', { hasText: title }).locator('.collection-board__field', {
    has: page.locator('.collection-board__field-label', { hasText: /^Summary$/ }),
  });
}

function statusLine(page: Page): Locator {
  return page.locator('.ai-field__status');
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test('a List cell that never ran shows Generate, and clicking it starts a run', async ({
  page,
}) => {
  const id = await createTask(page, { title: 'Order toner', notes: 'Two boxes, black only' });

  await setState(page, id, { status: null });
  await page.goto(listPath);

  const cell = listCell(page, 'Order toner');

  await cell.getByRole('button', { name: 'Generate' }).click();

  await expect(cell.getByRole('img', { name: 'Generating' })).toBeVisible();
  await expect(cell.getByRole('button', { name: 'Generate' })).toHaveCount(0);
  await expectStoredStatus(page, id, 'pending');
});

test('a List cell with empty inputs shows nothing', async ({ page }) => {
  await createTask(page, { title: 'Order toner' });
  await page.goto(listPath);

  const cell = listCell(page, 'Order toner');

  await expect(cell).toBeVisible();
  await expect(cell).toHaveText('');
  await expect(cell.getByRole('button')).toHaveCount(0);
});

test('a pending List cell shows the result without a reload', async ({ page }) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  await page.goto(listPath);

  const cell = listCell(page, 'Ship the order');

  await expect(cell.locator('.ai-cell--pending')).toBeVisible();
  await expect(cell.getByRole('img', { name: 'Generating' })).toBeVisible();

  await markPage(page);
  await setState(page, id, { status: 'done', value: 'Ships on Friday.' });

  await expect(cell).toHaveText('Ships on Friday.', { timeout: 10_000 });
  await expect(cell.getByRole('img', { name: 'Generating' })).toHaveCount(0);
  await expectSamePage(page);
});

test('a done List cell reveals Regenerate on hover, and clicking it starts a run', async ({
  page,
}) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  await setState(page, id, { status: 'done', value: 'Ships on Friday.' });
  await page.goto(listPath);

  const cell = listCell(page, 'Ship the order');
  const regenerate = cell.getByRole('button', { name: 'Regenerate' });

  await expect(cell).toHaveText('Ships on Friday.');
  await expect(regenerate).toHaveCSS('opacity', '0');

  await cell.getByText('Ships on Friday.').hover();

  await expect(regenerate).toHaveCSS('opacity', '1');

  await regenerate.click();

  await expect(cell.getByRole('img', { name: 'Generating' })).toBeVisible();
  await expectStoredStatus(page, id, 'pending');
});

test('a failed List cell shows the message on hover, and clicking it retries', async ({ page }) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  await setState(page, id, { status: 'error', error: 'Model refused' });
  await page.goto(listPath);

  const cell = listCell(page, 'Ship the order');
  const retry = cell.getByRole('button', { name: 'Retry' });

  await retry.hover();

  await expect(page.getByRole('tooltip')).toHaveText('Model refused');

  await retry.click();

  await expect(cell.getByRole('img', { name: 'Generating' })).toBeVisible();
  await expectStoredStatus(page, id, 'pending');
});

test('Board cards show the AI value with no actions', async ({ page }) => {
  const tasks = [
    { title: 'Done task', state: { status: 'done', value: 'All set.' } },
    { title: 'Pending task', state: { status: 'pending', value: 'Old summary.' } },
    { title: 'Failed task', state: { status: 'error', value: 'Kept summary.', error: 'Nope' } },
  ] as const;

  for (const { title, state } of tasks) {
    const id = await createTask(page, { title, status: 'backlog' });

    await setState(page, id, state);
  }

  await page.goto(`/collections/${tasksSlug}/board`);

  const done = boardSummary(page, 'Done task');
  const pending = boardSummary(page, 'Pending task');
  const failed = boardSummary(page, 'Failed task');

  await expect(done).toContainText('All set.');
  await expect(done.locator('.ai-cell--pending')).toHaveCount(0);

  await expect(pending).toContainText('Old summary.');
  await expect(pending.locator('.ai-cell--pending')).toBeVisible();
  await expect(pending.getByRole('img', { name: 'Generating' })).toHaveCount(0);

  await expect(failed).toContainText('Kept summary.');
  await expect(failed.getByRole('img', { name: 'Nope' })).toBeVisible();

  for (const card of [done, pending, failed]) {
    await expect(card.getByRole('button')).toHaveCount(0);
  }
});

test('the edit view shows the line for each state', async ({ page }) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  const lines: Array<[AIState, string]> = [
    [{ status: null }, 'Generate'],
    [{ status: 'pending' }, 'Generating…'],
    [{ status: 'done', value: 'Ships on Friday.' }, 'Regenerate'],
    [{ status: 'error', error: 'Model refused' }, 'Failed: Model refused · Retry'],
    [{ status: 'manual' }, "Edited by hand, won't update automatically · Regenerate"],
  ];

  for (const [state, line] of lines) {
    await setState(page, id, state);
    await page.goto(`/collections/${tasksSlug}/${id}`);

    await expect(statusLine(page)).toHaveText(line);
  }
});

test('a hand edit in the edit view is kept, and Regenerate starts a run', async ({ page }) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  await setState(page, id, { status: 'done', value: 'Ships on Friday.' });
  await page.goto(`/collections/${tasksSlug}/${id}`);

  await expect(statusLine(page)).toHaveText('Regenerate');

  await page.locator(`#field-${aiFieldName}`).fill('Courier on Friday, 9am.');

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname === `/api/${tasksSlug}/${id}`,
  );

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  expect((await saved).ok()).toBe(true);
  await expect(statusLine(page)).toHaveText(
    "Edited by hand, won't update automatically · Regenerate",
  );
  expect(await storedTask(page, id)).toMatchObject({
    [aiFieldName]: 'Courier on Friday, 9am.',
    [statusPath]: 'manual',
  });

  await statusLine(page).getByRole('button', { name: 'Regenerate' }).click();

  await expect(statusLine(page)).toHaveText('Generating…');
  await expectStoredStatus(page, id, 'pending');
});

test('an edit form opened while pending fills the result and saving does not regenerate', async ({
  page,
}) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  await page.goto(`/collections/${tasksSlug}/${id}`);

  await expect(statusLine(page)).toHaveText('Generating…');

  await setState(page, id, { status: 'done', value: 'Ready.' });

  await expect(page.locator(`#field-${aiFieldName}`)).toHaveValue('Ready.', { timeout: 10_000 });
  await expect(statusLine(page)).toHaveText('Regenerate');

  await page.locator('#field-title').fill('Ship the order today');

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname === `/api/${tasksSlug}/${id}`,
  );

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  expect((await saved).ok()).toBe(true);
  expect(await storedTask(page, id)).toMatchObject({
    title: 'Ship the order today',
    [aiFieldName]: 'Ready.',
    [statusPath]: 'done',
  });
});

test.describe('bulk regenerate', () => {
  test('a selection with "Only failed" queues only the failed row', async ({ page }) => {
    const failed = await createTask(page, { title: 'Failed task', notes: 'Call the courier' });
    const done = await createTask(page, { title: 'Done task', notes: 'Book the van' });
    const neverRun = await createNeverRun(page, { title: 'Fresh task', notes: 'Pack the boxes' });

    await setState(page, failed, { status: 'error', error: 'Model refused' });
    await setState(page, done, { status: 'done', value: 'Van booked.' });
    await gotoList(page);
    await listRow(page, 'Failed task').getByRole('checkbox').check();
    await listRow(page, 'Done task').getByRole('checkbox').check();
    await markPage(page);

    await confirmBulk(await openBulkDialog(page), 'Only failed');

    await expect(page.getByText('Queued 1 run', { exact: true })).toBeVisible();
    await expect(
      listCell(page, 'Failed task').getByRole('img', { name: 'Generating' }),
    ).toBeVisible();
    await expect(listCell(page, 'Done task').getByRole('img', { name: 'Generating' })).toHaveCount(
      0,
    );
    await expect(listCell(page, 'Fresh task').getByRole('img', { name: 'Generating' })).toHaveCount(
      0,
    );

    for (const title of ['Failed task', 'Done task', 'Fresh task']) {
      await expect(listRow(page, title).getByRole('checkbox')).not.toBeChecked();
    }

    await expectSamePage(page);
    await expectStoredStatus(page, failed, 'pending');
    await expectStoredStatus(page, done, 'done');
    await expectStoredStatus(page, neverRun, null);
  });

  test('with nothing selected, "All in view" covers the filtered List', async ({ page }) => {
    const first = await createNeverRun(page, { title: 'Alpha one', notes: 'Order paper' });
    const second = await createNeverRun(page, { title: 'Alpha two', notes: 'Order ink' });
    const other = await createNeverRun(page, { title: 'Beta', notes: 'Order pens' });

    await gotoList(page, listPathWith('where[title][like]=Alpha'));

    await expect(listRow(page, 'Beta')).toHaveCount(0);

    const dialog = await openBulkDialog(page);

    await expect(dialog.getByRole('radio', { name: 'All in view' })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Only never generated' })).toBeChecked();

    await confirmBulk(dialog);

    await expect(page.getByText('Queued 2 runs', { exact: true })).toBeVisible();
    await expectStoredStatus(page, first, 'pending');
    await expectStoredStatus(page, second, 'pending');
    await expectStoredStatus(page, other, null);
  });

  test('"Select all" covers every page', async ({ page }) => {
    const ids: ID[] = [];

    for (let index = 1; index <= 7; index += 1) {
      ids.push(await createNeverRun(page, { title: `Task ${index}`, notes: `Step ${index}` }));
    }

    await gotoList(page, listPathWith('limit=5'));
    await page.getByRole('columnheader').getByRole('checkbox').check();
    await page.getByRole('button', { name: /^Select all \(7\)/ }).click();

    const dialog = await openBulkDialog(page);

    await expect(dialog.getByRole('radio', { name: 'All selected' })).toBeVisible();

    await confirmBulk(dialog);

    await expect(page.getByText('Queued 7 runs', { exact: true })).toBeVisible();

    for (const id of ids) {
      await expectStoredStatus(page, id, 'pending');
    }
  });

  test('"All in view" replaces hand-edited values', async ({ page }) => {
    const manual = await createTask(page, { title: 'Manual task', notes: 'Call the courier' });
    const done = await createTask(page, { title: 'Done task', notes: 'Book the van' });

    await setState(page, manual, { status: 'manual', value: 'Written by hand.' });
    await setState(page, done, { status: 'done', value: 'Van booked.' });
    await gotoList(page);

    const dialog = await openBulkDialog(page);
    const all = dialog.getByRole('radio', { name: 'All in view' });

    await expect(all).toHaveAccessibleDescription('Also replaces values edited by hand.');

    await confirmBulk(dialog, 'All in view');

    await expect(page.getByText('Queued 2 runs', { exact: true })).toBeVisible();
    await expectStoredStatus(page, manual, 'pending');
    await expectStoredStatus(page, done, 'pending');
  });

  test('a record with empty inputs is skipped and counted', async ({ page }) => {
    const withNotes = await createNeverRun(page, { title: 'With notes', notes: 'Order paper' });
    const withoutNotes = await createTask(page, { title: 'Without notes' });

    await gotoList(page);
    await confirmBulk(await openBulkDialog(page));

    await expect(
      page.getByText(
        'Queued 1 run · 1 record skipped (no inputs, no permission, being edited, or changed)',
        { exact: true },
      ),
    ).toBeVisible();
    await expectStoredStatus(page, withNotes, 'pending');
    await expectStoredStatus(page, withoutNotes, null);
  });

  test('the dialog replaces the menu, and Escape closes it without changes', async ({ page }) => {
    const id = await createNeverRun(page, { title: 'Fresh task', notes: 'Pack the boxes' });

    await gotoList(page);

    const dialog = await openBulkDialog(page);

    await expect(bulkEntry(page)).toBeHidden();
    await expect(dialog.locator(':focus')).toHaveCount(1);

    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expectStoredStatus(page, id, null);

    await page.getByRole('button', { name: 'More options' }).click();

    await expect(bulkEntry(page)).toBeVisible();
  });
});
