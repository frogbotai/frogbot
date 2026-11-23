import path from 'node:path';

import { expect, type Locator, type Page, test } from '@playwright/test';

const created: number[] = [];
const shots = process.env.RECORD_PANEL_BODY_DIR;

const panel = (page: Page) => page.locator('.fb-record-panel');
const bar = (page: Page) => page.locator('.fb-record-panel-header');
const title = (page: Page) => page.locator('.fb-record-panel-title__input');
const subtasks = (page: Page) => panel(page).locator('.fb-panel-join');
const row = (page: Page, name: string) =>
  panel(page).locator('.fb-record-panel-properties__row', {
    has: page.locator(`#field-${name}, [id^="field-${name}"]`),
  });

async function todo(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post('/api/todos', { data });
  expect(response.ok()).toBe(true);
  const { doc } = (await response.json()) as { doc: { id: number } };
  created.push(doc.id);

  return doc.id;
}

async function readTodo(page: Page, id: number) {
  const response = await page.request.get(`/api/todos/${id}?depth=0`);

  return (await response.json()) as { done?: boolean; parent?: number; title: string };
}

async function openTodo(page: Page, id: number, name: string) {
  await page.goto(`/collections/todos?record=${id}`);
  await expect(title(page)).toHaveValue(name);
}

async function styleOf(locator: Locator) {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node);

    return { background: style.backgroundColor, border: style.borderTopColor };
  });
}

async function shoot(page: Page, name: string) {
  if (!shots) return;
  const clip = (await panel(page).boundingBox())!;
  await page.screenshot({ clip, path: path.join(shots, `${name}.png`) });
}

const transparent = 'rgba(0, 0, 0, 0)';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
});

test.afterEach(async ({ page }) => {
  for (const id of created.splice(0).reverse()) await page.request.delete(`/api/todos/${id}`);
});

test('property values are flat at rest, filled on hover, editable on click, and show errors', async ({
  page,
}) => {
  const id = await todo(page, { estimate: 3, title: 'Flat rows' });
  await openTodo(page, id, 'Flat rows');

  const estimate = row(page, 'estimate').locator('.form-input-group');
  const due = row(page, 'due').locator('input');
  await page.mouse.move(0, 0);
  expect(await styleOf(estimate)).toEqual({ background: transparent, border: transparent });
  expect(await styleOf(due)).toEqual({ background: transparent, border: transparent });
  await expect(row(page, 'owner').locator('.relationship-add-new')).toBeHidden();
  await expect(row(page, 'estimate').locator('.input-stepper')).toBeHidden();
  await shoot(page, 'flat-rest');

  await estimate.hover();
  await expect.poll(async () => (await styleOf(estimate)).background).not.toBe(transparent);
  expect((await styleOf(estimate)).border).toBe(transparent);
  await expect(row(page, 'estimate').locator('.input-stepper')).toBeVisible();
  await shoot(page, 'flat-hover');

  const priority = row(page, 'priority');
  await expect(priority.locator('.rs__indicators')).toBeHidden();
  await priority.locator('.rs__control').click();
  await expect(page.locator('.rs__menu')).toBeVisible();
  await page.locator('.rs__option', { hasText: 'high' }).click();
  await expect(priority.locator('.rs__single-value')).toHaveText('high');

  await estimate.locator('input').fill('-1');
  await bar(page).getByRole('button', { name: 'Save' }).click();
  await expect(row(page, 'estimate').locator('.field-type.error')).toBeVisible();
  expect((await styleOf(estimate)).border).not.toBe(transparent);
  await shoot(page, 'flat-error');
});

test('the done field is left out of the panel body, and Mark complete sets it', async ({
  page,
}) => {
  const id = await todo(page, { title: 'No double checkbox' });
  await openTodo(page, id, 'No double checkbox');

  await expect(panel(page).locator('#field-done')).toHaveCount(0);
  await bar(page).getByRole('button', { name: 'Mark complete' }).click();
  await expect.poll(async () => (await readTodo(page, id)).done).toBe(true);
});

test('subtasks: listed, opened in place with a way back, added inline with +, and checked in place', async ({
  page,
}) => {
  const parent = await todo(page, { title: 'Budget feature' });
  const child = await todo(page, { parent, title: 'Spec the cap rules' });

  await openTodo(page, parent, 'Budget feature');
  await expect(subtasks(page).getByRole('heading', { name: 'Subtasks' })).toBeVisible();
  await expect(subtasks(page).locator('.fb-panel-join__title')).toHaveText(['Spec the cap rules']);
  await expect(panel(page).locator('.relationship-table')).toHaveCount(0);
  await shoot(page, 'subtasks');

  await subtasks(page).getByRole('button', { name: 'Spec the cap rules' }).click();
  await expect(title(page)).toHaveValue('Spec the cap rules');
  const back = bar(page).getByRole('button', { name: 'Back to Budget feature' });
  await expect(back).toBeVisible();

  await back.click();
  await expect(title(page)).toHaveValue('Budget feature');

  await subtasks(page).getByRole('button', { name: 'Mark complete' }).click();
  await expect(subtasks(page).getByRole('button', { name: 'Completed' })).toBeVisible();
  await expect.poll(async () => (await readTodo(page, child)).done).toBe(true);

  await subtasks(page).getByRole('button', { name: 'Add todo' }).click();

  const draft = subtasks(page).getByRole('textbox', { name: 'New todo name' });
  await expect(draft).toBeFocused();
  await draft.fill('Price the tiers');
  await draft.press('Enter');
  await expect(draft).toHaveValue('');
  await expect(title(page)).toHaveValue('Budget feature');

  await expect(subtasks(page).locator('.fb-panel-join__title')).toHaveText([
    'Spec the cap rules',
    'Price the tiers',
  ]);

  const { docs } = (await (
    await page.request.get(`/api/todos?where[title][equals]=Price%20the%20tiers&depth=0`)
  ).json()) as { docs: { id: number; parent?: number }[] };

  created.push(docs[0].id);
  expect(docs[0].parent).toBe(parent);
});

test('subtasks stay a section after the parent is saved', async ({ page }) => {
  const parent = await todo(page, { title: 'Saved parent' });
  await todo(page, { parent, title: 'Still listed' });

  await openTodo(page, parent, 'Saved parent');
  await panel(page).locator('#field-notes').fill('Changed');
  await bar(page).getByRole('button', { name: 'Save' }).click();
  await expect(bar(page).locator('.fb-record-panel-header__save')).toHaveCount(0);

  await expect(subtasks(page).getByRole('button', { name: 'Still listed' })).toBeVisible();
  await expect(panel(page).locator('.relationship-table')).toHaveCount(0);
});

test('the edit page keeps Payload’s join table', async ({ page }) => {
  const parent = await todo(page, { title: 'Edit page parent' });
  await todo(page, { parent, title: 'Edit page child' });

  await page.goto(`/collections/todos/${parent}`);
  await expect(page.locator('.relationship-table')).toBeVisible();
  await expect(page.locator('.fb-panel-join')).toHaveCount(0);
});
