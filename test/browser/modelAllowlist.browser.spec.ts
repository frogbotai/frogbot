import { expect, type Page, test } from '@playwright/test';

import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel';
import { signIn } from './__helpers/signIn';
import { chatsSlug, modelPort, usersSlug } from './fixtures/question/shared';

let model: StubChatModel;

test.setTimeout(120_000);

test.beforeAll(async () => {
  model = await startStubChatModel(modelPort);
});

test.afterAll(async () => {
  await model.close();
});

async function setModelPolicy({
  page,
  modelAccess,
  models,
}: {
  page: Page;
  modelAccess: 'all' | 'selected';
  models: string[];
}) {
  const me = await page.request.get(`/api/${usersSlug}/me`);

  expect(me.ok()).toBe(true);

  const { user } = await me.json();

  expect(user?.id).toBeDefined();

  const response = await page.request.patch(`/api/${usersSlug}/${user.id}`, {
    data: { modelAccess, models },
  });

  expect(response.ok()).toBe(true);
  expect((await response.json()).doc).toMatchObject({ modelAccess, models });
}

test.beforeEach(async ({ page }) => {
  model.reset();

  await signIn(page);
  await setModelPolicy({ page, modelAccess: 'all', models: [] });

  await setModelPolicy({ page, modelAccess: 'selected', models: ['browser/thinker'] });

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  await page.goto(`/collections/${chatsSlug}/create`);
  await expect(page.locator('.fb-composer textarea')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  await setModelPolicy({ page, modelAccess: 'all', models: [] });

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test('a restricted user sees only the allowed model already selected and sends on it', async ({
  page,
}) => {
  const trigger = page.locator('.fb-model-selector__trigger');

  await expect(trigger).toHaveText('thinker · Default');

  await trigger.click();
  await page.locator('.fb-model-selector__model').click();

  const options = page.locator('.fb-model-selector__list .fb-model-selector__option');

  await expect(options).toHaveCount(1);
  await expect(options).toHaveText('thinker');
  await expect(options).toHaveAttribute('aria-current', 'true');

  await page.keyboard.press('Escape');

  model.respond({ text: 'Allowed model reply.' });

  await page.locator('.fb-composer textarea').fill('Answer with the allowed model');
  await page.locator('.fb-composer textarea').press('Enter');

  await expect(page.getByText('Allowed model reply.', { exact: true })).toBeVisible();

  expect(model.requests.at(-1)?.model).toBe('thinker');
});
