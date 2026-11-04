import { expect, type Page, test } from '@playwright/test';

import { signedOut } from './__helpers/signIn';
import { leadsSlug } from './fixtures/forms/shared';

const viewport = { width: 1440, height: 900 };

async function pickCollection(page: Page, slug: string) {
  await page.locator('#field-collection .rs__control').click();
  await page.locator('.rs__option', { hasText: slug }).click();
}

function questionKeys(page: Page) {
  return page
    .locator('.fb-form__question')
    .evaluateAll((questions) =>
      questions.map((question) => question.getAttribute('data-question')),
    );
}

async function addQuestion(page: Page, step: number, label: string) {
  const scope = page.locator('.fb-form-builder__step').nth(step);

  await scope.getByRole('button', { name: 'Add question' }).click();
  await scope.getByRole('button', { name: new RegExp(`^${label}`) }).click();
  await expect(scope.locator('.fb-form-builder__question-label', { hasText: label })).toBeVisible();
}

async function startLeadsForm(page: Page, slug: string) {
  await page.goto('/collections/forms/create');
  await page.locator('#field-title').fill('Built in the admin');
  await page.locator('#field-slug').fill(slug);
  await pickCollection(page, leadsSlug);
}

test.use({ viewport });

async function saveEmailForm(page: Page, slug: string) {
  await startLeadsForm(page, slug);
  await expect(page.getByText('Save the form to see it in Live Preview.')).toBeVisible();
  await addQuestion(page, 0, 'Email');
  await addQuestion(page, 0, 'Name');
  await page.locator('#action-save').click();
  await expect(page).toHaveURL(/\/collections\/forms\/\d+/);
}

test('a saved form opens with the preview, which shows unsaved changes as the admin types', async ({
  page,
}) => {
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));
  await saveEmailForm(page, `preview-${Date.now()}`);

  await expect(page.locator('#live-preview-toggler')).toHaveClass(/live-preview-toggler--active/);
  await expect
    .poll(() => page.locator('#live-preview-iframe').getAttribute('src'))
    .toMatch(/\/forms-preview$/);

  const frame = page.frameLocator('#live-preview-iframe');

  await expect(frame.getByText('Preview: nothing is sent.')).toBeVisible();
  await expect(frame.getByRole('heading', { name: 'Built in the admin' })).toBeVisible();
  await expect(frame.getByLabel('Email')).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.locator('#field-steps__0__questions__0__label').fill('Work email');
  await expect(frame.getByLabel('Work email')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Phone size makes the preview 390 px wide, with one column', async ({ page }) => {
  await saveEmailForm(page, `phone-${Date.now()}`);

  await page.getByRole('button', { name: 'Responsive' }).click();
  await page.getByRole('menuitemradio', { name: 'Phone' }).click();

  const frame = page.frameLocator('#live-preview-iframe');

  await expect
    .poll(async () => (await page.locator('#live-preview-iframe').boundingBox())?.width)
    .toBe(390);

  await expect(frame.locator('.fb-form__question')).toHaveCount(2);

  const [email, name] = await frame.locator('.fb-form__question').evaluateAll((questions) =>
    questions.map((question) => {
      const { bottom, left, right, top } = question.getBoundingClientRect();

      return { bottom, left, right, top };
    }),
  );

  expect(email?.left).toBeGreaterThan(0);
  expect(name?.left).toBe(email?.left);
  expect(name?.top).toBeGreaterThanOrEqual(email?.bottom ?? Infinity);
  expect(email?.right).toBeLessThanOrEqual(390);
});

test('an admin builds a two-step form, moves a question by keyboard, and visitors get that order', async ({
  browser,
  page,
}) => {
  const slug = `built-${Date.now()}`;

  await startLeadsForm(page, slug);

  await expect(page.getByText('Saving will be refused: add Email')).toBeVisible();

  await addQuestion(page, 0, 'Email');
  await expect(page.getByText('Saving will be refused: add Email')).toHaveCount(0);
  await addQuestion(page, 0, 'Name');

  await page.getByRole('button', { name: 'Add step' }).click();
  await expect(page.locator('.fb-form-builder__step')).toHaveCount(2);
  await addQuestion(page, 1, 'Interest');

  const handle = page.getByRole('button', { name: 'Move Name', exact: true });

  await handle.focus();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');

  await expect(async () => {
    await page.keyboard.press('ArrowDown');

    await expect(
      page.getByRole('status').filter({ hasText: 'moved over droppable area step:' }),
    ).toHaveCount(1, { timeout: 1000 });
  }).toPass();

  await page.keyboard.press('Space');

  await expect(
    page.locator('.fb-form-builder__step').nth(1).locator('.fb-form-builder__question-label'),
  ).toHaveText(['Name', 'Interest']);

  await page.locator('#action-save').click();
  await expect(page).toHaveURL(/\/collections\/forms\/\d+/);

  const visitor = await browser.newContext({ storageState: signedOut });
  const form = await visitor.newPage();

  await form.goto(`/forms/${slug}`);
  await expect(form.getByText('Step 1 of 2')).toBeVisible();
  await expect.poll(() => questionKeys(form)).toEqual(['email']);

  await form.getByLabel('Email').fill(`${slug}@example.com`);
  await form.getByRole('button', { name: 'Next' }).click();

  await expect(form.getByText('Step 2 of 2')).toBeVisible();
  await expect.poll(() => questionKeys(form)).toEqual(['name', 'interest']);

  await visitor.close();
});
