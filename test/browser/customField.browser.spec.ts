import { expect, type Page, test } from '@playwright/test';

const user = { email: 'custom-field@example.com', password: 'browser-test-password' };

async function signIn(page: Page) {
  await page.goto('/');
  await page.waitForURL(/\/(create-first-user|login)/);
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    const response = await page.request.post('/api/users/first-register', { data: user });

    expect(response.ok()).toBe(true);
    await page.goto('/');

    return;
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)/.test(url.pathname));
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('renders a user-local client field built with useField and saves its value', async ({
  page,
}) => {
  await page.goto('/collections/posts/create');
  await page.getByLabel('Title').fill('Color report');
  await page.getByLabel('Color').fill('violet');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.waitForURL((url) => /^\/collections\/posts\/(?!create$)[^/]+$/.test(url.pathname));
  await page.reload();

  await expect(page.getByLabel('Color')).toHaveValue('violet');
});

test('gives server field components req.frogbot on the create view', async ({ page }) => {
  await page.goto('/collections/posts/create');
  await page.getByLabel('Title').fill('Visible owner note');

  const ownerNote = page.getByTestId('owner-note');

  await expect(ownerNote).toBeVisible();
  await expect.poll(async () => Number(await ownerNote.textContent())).toBeGreaterThanOrEqual(2);
});

test('keeps req.frogbot after a form-state rebuild', async ({ page }) => {
  await page.goto('/collections/posts/create');

  const title = page.getByLabel('Title');
  const ownerNote = page.getByTestId('owner-note');

  await title.fill('First render');
  await expect(ownerNote).toBeVisible();

  const collectionCount = await ownerNote.textContent();

  await title.clear();
  await expect(ownerNote).toBeHidden();
  await title.fill('Rebuilt render');

  await expect(ownerNote).toHaveText(collectionCount || '');
});

test('renders the registered Reports view with the issued req.frogbot', async ({ page }) => {
  await page.goto('/reports');

  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByTestId('reports-collections').textContent()))
    .toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Reports' })).toBeVisible();
});

test('renders typed default widgets with req.frogbot through the modular dashboard', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByTestId('welcome-widget')).toContainText('Default dashboard');
  await expect(page.getByTestId('activity-widget')).toContainText('Recent activity');
  await expect
    .poll(async () => Number(await page.getByTestId('welcome-widget-collections').textContent()))
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(async () => Number(await page.getByTestId('activity-widget-collections').textContent()))
    .toBeGreaterThanOrEqual(2);
});

test('edits, persists, and resets the modular dashboard layout', async ({ page }) => {
  await page.goto('/');

  const stepNav = page.locator('.app-header__step-nav-wrapper');

  await stepNav.locator('button').click();
  await stepNav.getByText('Edit Dashboard', { exact: true }).click();
  await page.getByRole('button', { exact: true, name: 'Edit welcome-0' }).click();

  const widgetEditor = page.getByRole('dialog', { name: /^widget-editor-/ });

  await expect(widgetEditor.getByRole('heading', { name: 'Edit Welcome summary' })).toBeVisible();
  await expect(widgetEditor.getByRole('textbox')).toHaveValue(/Default dashboard/);
  await widgetEditor.getByRole('textbox').fill('Saved dashboard heading');
  await widgetEditor.getByRole('button', { name: 'Save changes' }).click();
  await expect(widgetEditor).toBeHidden();
  await expect(page.getByTestId('welcome-widget')).toContainText('Saved dashboard heading');
  await stepNav.getByRole('button', { name: 'Save changes' }).click();

  await page.reload();

  await expect(page.getByTestId('welcome-widget')).toContainText('Saved dashboard heading');

  await stepNav.locator('button').click();
  await stepNav.getByText('Reset Layout', { exact: true }).click();

  await expect(page.getByTestId('welcome-widget')).toContainText('Default dashboard');

  await page.reload();

  await expect(page.getByTestId('welcome-widget')).toContainText('Default dashboard');
});
