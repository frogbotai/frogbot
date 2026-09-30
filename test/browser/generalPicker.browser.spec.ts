import { expect, test } from '@playwright/test';

import { signIn } from './__helpers/signIn';

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await signIn(page);

  await page.goto('/collections/chats/create');

  await expect(page.locator('.fb-composer textarea')).toBeVisible();
});

test('general selects the configured default model', async ({ page }) => {
  const trigger = page.locator('.fb-model-selector__trigger');

  await expect(trigger.locator('.fb-model-selector__name')).toHaveText('gpt-5.4-mini');

  await trigger.click();
  await page.locator('.fb-model-selector__model').click();

  await expect(page.getByRole('button', { name: 'gpt-5.4-mini', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('general offers multiple OpenAI models', async ({ page }) => {
  await page.locator('.fb-model-selector__trigger').click();
  await page.locator('.fb-model-selector__model').click();

  const models = page.locator('.fb-model-selector__option').filter({ hasText: /^gpt-/ });

  await expect.poll(() => models.count()).toBeGreaterThan(1);
});

test('general excludes embedding models from the picker', async ({ page }) => {
  await page.locator('.fb-model-selector__trigger').click();
  await page.locator('.fb-model-selector__model').click();

  const models = page.locator('.fb-model-selector__list');

  await expect(models.getByRole('button', { name: 'gpt-5.4-mini', exact: true })).toBeVisible();
  await expect(models.getByRole('button', { name: /text-embedding-/ })).toHaveCount(0);
});
