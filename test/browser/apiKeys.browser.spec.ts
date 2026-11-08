import { expect, type Page, request, test, type TestInfo } from '@playwright/test';

import { setAdminTheme } from './__helpers/adminTheme';
import { apiKeysSlug } from './fixtures/question/shared';

let consoleErrors: string[];

async function attach(page: Page, testInfo: TestInfo, name: string) {
  const file = testInfo.outputPath(`${name}.png`);

  await page.screenshot({ path: file });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

test.beforeEach(async ({ page }) => {
  consoleErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

const createButton = (page: Page) =>
  page.locator('.list-controls__actions').getByRole('button', { name: 'Create API key' });

test('puts Create API key in the toolbar where Create New sits', async ({ page }) => {
  await page.goto(`/collections/${apiKeysSlug}`);

  const button = createButton(page);

  await expect(button).toBeVisible();
  await expect(button).toHaveClass(/\bbtn--style-primary\b/);
  await expect(button).toHaveClass(/\bbtn--size-medium\b/);
  await expect(
    page.locator('.app-header').getByRole('button', { name: 'Create API key' }),
  ).toHaveCount(0);
  await expect(page.locator('#create-new-doc')).toHaveCount(0);

  const order = await page
    .locator('.list-controls__actions')
    .evaluate((actions) =>
      [...actions.children]
        .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
        .map((child) =>
          child.matches('.fb-create-button')
            ? 'create'
            : child.matches('.list-controls__popup')
              ? 'menu'
              : 'other',
        ),
    );

  expect(order.slice(-2)).toEqual(['create', 'menu']);
});

test('shows Create API key in the empty state', async ({ page }) => {
  await page.goto(`/collections/${apiKeysSlug}?where[name][equals]=no-such-key-${Date.now()}`);
  await page.request.delete(`/api/payload-preferences/collection-${apiKeysSlug}-view-list`);

  const empty = page.locator('.no-results');

  await expect(empty.getByRole('button', { name: 'Create API key' })).toBeVisible();
  await expect(empty.getByRole('link', { name: /Create New/ })).toHaveCount(0);
  await expect(createButton(page)).toHaveCount(1);
});

for (const theme of ['light', 'dark'] as const) {
  test(`creates, copies and revokes an API key in FrogBot's dialog (${theme})`, async ({
    page,
  }, testInfo) => {
    const name = `Browser dialog key ${theme} ${Date.now()}`;

    await setAdminTheme(page, theme);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/collections/${apiKeysSlug}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    await createButton(page).click();

    const create = page.getByRole('dialog', { name: 'Create API Key' });
    const keyName = create.getByLabel('Key name');

    await expect(create).toHaveClass(/\bfb-dialog__content\b/);
    await expect(keyName).toBeFocused();
    await attach(page, testInfo, `create-dialog-${theme}`);

    await keyName.fill(name);
    await create.getByRole('button', { name: 'Generate' }).click();

    const token = create.locator('code');

    await expect(token).toHaveText(/^\S{20,}$/);

    const copy = create.getByRole('button', { name: 'Copy API key', exact: true });

    await copy.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Copy');
    await copy.click();
    await expect(page.getByRole('tooltip')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await token.textContent(),
    );

    await attach(page, testInfo, `token-copied-${theme}`);

    await create.getByRole('button', { name: 'Close' }).click();
    await expect(create).toBeHidden();

    const row = page.getByRole('row').filter({ hasText: new RegExp(name) });

    await row.getByRole('button', { name: 'Revoke', exact: true }).click();

    const revoke = page.getByRole('dialog', { name: 'Revoke API Key' });

    await expect(revoke).toContainText(`This will immediately disable ${name}.`);
    await attach(page, testInfo, `revoke-dialog-${theme}`);

    await revoke.getByRole('button', { name: 'Revoke key' }).click();
    await expect(revoke).toBeHidden();
    await expect(row).toContainText('Revoked');
  });
}

test('revokes a key that made keys and keeps them when the box is cleared', async ({
  page,
}, testInfo) => {
  const stamp = Date.now();
  const name = `Browser parent key ${stamp}`;
  const childName = `Browser minted key ${stamp}`;
  const parentRow = () => page.getByRole('row').filter({ hasText: name, hasNotText: childName });

  await page.goto(`/collections/${apiKeysSlug}`);

  const minted = await page.request.post(`/api/${apiKeysSlug}/mint`, {
    data: { name, data: { canMint: true } },
  });

  expect(minted.status()).toBe(201);

  const parent = (await minted.json()) as { token: string };
  const asKey = await request.newContext({
    baseURL: new URL(page.url()).origin,
    extraHTTPHeaders: { Authorization: `Bearer ${parent.token}` },
  });

  const child = await asKey.post(`/api/${apiKeysSlug}/mint`, {
    data: { name: childName },
  });

  expect(child.status()).toBe(201);

  for (const [width, theme] of [
    [1280, 'light'],
    [375, 'light'],
    [375, 'dark'],
  ] as const) {
    await setAdminTheme(page, theme);
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width, height: 800 });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    await parentRow().getByRole('button', { name: 'Revoke', exact: true }).click();

    const revoke = page.getByRole('dialog', { name: 'Revoke API Key' });
    const cascade = revoke.getByRole('checkbox', { name: 'Also revoke the key it made' });

    await expect(cascade).toBeChecked();
    await attach(page, testInfo, `revoke-cascade-${width}-${theme}`);
    await revoke.getByRole('button', { name: 'Cancel' }).click();
    await expect(revoke).toBeHidden();
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await setAdminTheme(page, 'light');
  await page.reload();
  await parentRow().getByRole('button', { name: 'Revoke', exact: true }).click();

  const revoke = page.getByRole('dialog', { name: 'Revoke API Key' });

  await revoke.getByRole('checkbox', { name: 'Also revoke the key it made' }).click();
  await revoke.getByRole('button', { name: 'Revoke key' }).click();
  await expect(revoke).toBeHidden();

  await expect(parentRow()).toContainText('Revoked');
  expect((await asKey.get(`/api/${apiKeysSlug}`)).status()).toBe(403);

  const childToken = ((await child.json()) as { token: string }).token;
  const asChild = await request.newContext({
    baseURL: new URL(page.url()).origin,
    extraHTTPHeaders: { Authorization: `Bearer ${childToken}` },
  });

  expect((await asChild.get(`/api/${apiKeysSlug}`)).status()).toBe(200);
  await asChild.dispose();

  await page.reload();

  await expect(
    page.getByRole('row').filter({ hasText: childName }).getByRole('button', {
      name: 'Revoke',
      exact: true,
    }),
  ).toBeVisible();

  await asKey.dispose();
});

test('creates an API key with a monthly cap from the Limits section', async ({
  page,
}, testInfo) => {
  const name = `Browser capped key ${Date.now()}`;

  await page.goto(`/collections/${apiKeysSlug}`);
  await createButton(page).click();

  const create = page.getByRole('dialog', { name: 'Create API Key' });

  await create.getByLabel('Key name').fill(name);
  await expect(create.getByLabel('Monthly Cap (USD)')).toBeHidden();
  await create.getByRole('button', { name: 'Limits' }).click();
  await create.getByLabel('Monthly Cap (USD)').fill('5');
  await attach(page, testInfo, 'create-dialog-limits');

  await create.getByRole('button', { name: 'Generate' }).click();
  await expect(create.locator('code')).toHaveText(/^\S{20,}$/);
  await create.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('row').filter({ hasText: new RegExp(name) })).toContainText('$5.00');
});
