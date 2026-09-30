import { expect, test } from '@playwright/test';

import { DEFAULT_MODEL_CATALOG } from '../../packages/gateway/src/providers/catalog.data.js';
import { signIn } from './__helpers/signIn';

const defaultModel = 'openai/gpt-5.4-mini';
const defaultModelName = DEFAULT_MODEL_CATALOG.get(defaultModel)!.name;

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await signIn(page);

  await page.goto('/collections/chats/create');

  await expect(page.locator('.fb-composer textarea')).toBeVisible();
});

test('general selects the configured default model', async ({ page }) => {
  const trigger = page.locator('.fb-model-selector__trigger');

  await expect(trigger.locator('.fb-model-selector__name')).toHaveText(defaultModelName);

  await trigger.click();
  await page.locator('.fb-model-selector__model').click();

  const current = page.getByRole('button', { name: defaultModelName, exact: true });

  await expect(current).toHaveAttribute('aria-current', 'true');
  await expect(current).toHaveAttribute('title', defaultModel);
});

test('general offers multiple OpenAI models', async ({ page }) => {
  await page.locator('.fb-model-selector__trigger').click();
  await page.locator('.fb-model-selector__model').click();

  const models = page.locator('.fb-model-selector__option[title^="openai/gpt-"]');

  await expect.poll(() => models.count()).toBeGreaterThan(1);
});

test('general excludes embedding models from the picker', async ({ page }) => {
  await page.locator('.fb-model-selector__trigger').click();
  await page.locator('.fb-model-selector__model').click();

  const models = page.locator('.fb-model-selector__list');

  await expect(models.getByRole('button', { name: defaultModelName, exact: true })).toBeVisible();
  await expect(models.locator('[title*="text-embedding-"]')).toHaveCount(0);
});
