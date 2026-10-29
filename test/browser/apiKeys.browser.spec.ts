import { expect, type Page, test, type TestInfo } from '@playwright/test';

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

test('puts Create API key in the page header at its own width', async ({ page }) => {
  await page.goto(`/collections/${apiKeysSlug}`);

  const button = page.locator('.app-header').getByRole('button', { name: 'Create API key' });
  const controls = page.locator('.collection-list .list-controls');

  await expect(button).toBeVisible();
  await expect(
    page.locator('.collection-list').getByRole('button', { name: 'Create API key' }),
  ).toHaveCount(0);
  expect((await button.boundingBox())!.width).toBeLessThan(
    (await controls.boundingBox())!.width / 2,
  );

  const nextVisible = await controls.evaluate((element) => {
    let next = element.nextElementSibling;

    while (next?.classList.contains('sr-only')) next = next.nextElementSibling;

    return next?.className;
  });

  expect(nextVisible).toMatch(/^(table|no-results)\b/);
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

    await page.getByRole('button', { name: 'Create API key' }).click();

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

test('creates an API key with a monthly cap from the Limits section', async ({
  page,
}, testInfo) => {
  const name = `Browser capped key ${Date.now()}`;

  await page.goto(`/collections/${apiKeysSlug}`);
  await page.getByRole('button', { name: 'Create API key' }).click();

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
