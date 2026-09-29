import { expect, type Page, test } from '@playwright/test';

import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel';
import { signIn } from './__helpers/signIn';
import { chatsSlug, modelPort } from './fixtures/question/shared';

const keyFragment = 'sk-inval*****-key';

let model: StubChatModel;

test.setTimeout(120_000);

test.beforeAll(async () => {
  model = await startStubChatModel(modelPort);
});

test.afterAll(async () => {
  await model.close();
});

test.beforeEach(async ({ page }) => {
  model.reset();

  await signIn(page);

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  await page.goto(`/collections/${chatsSlug}/create`);
  await expect(page.locator('.fb-composer textarea')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

async function send(page: Page, text: string) {
  await page.locator('.fb-composer textarea').fill(text);
  await page.locator('.fb-composer textarea').press('Enter');
}

test('a rejected provider key shows an actionable toast without the provider message', async ({
  page,
}) => {
  model.respond({
    error: {
      status: 401,
      body: {
        error: {
          message: `Incorrect API key provided: ${keyFragment}.`,
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
    },
  });

  await send(page, 'Hello');

  await expect(
    page.getByText(
      'The AI provider rejected the API key. Check the API key configured for the browser provider.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator('.fb-chat__error')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(keyFragment);
});
