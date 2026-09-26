import { expect, type Page, test } from '@playwright/test';

import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel';
import { signIn } from './__helpers/signIn';
import { channelQuestion, chatsSlug, messagesSlug, modelPort } from './fixtures/question/shared';

type StoredMessage = {
  role: string;
  parts: Array<Record<string, unknown>>;
};

let model: StubChatModel;
let chatId: string | number;

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

  const created = await page.request.post('/api/browser/channel-chat');

  expect(created.ok()).toBe(true);

  chatId = (await created.json()).chatId;

  await page.goto(`/collections/${chatsSlug}/${chatId}`);
  await expect(page.locator('.fb-channel-notice')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

async function storedMessages(page: Page, chat: string | number): Promise<StoredMessage[]> {
  const response = await page.request.get(`/api/${messagesSlug}`, {
    params: { 'where[chat][equals]': String(chat), sort: 'createdAt', depth: 0 },
  });

  expect(response.ok()).toBe(true);

  return (await response.json()).docs;
}

test('a channel conversation opens read-only with the channel named', async ({ page }) => {
  const waiting = page.locator('.fb-question-tool--waiting');

  await expect(page.locator('.fb-channel-notice')).toContainText(
    'This conversation happens in Slack.',
  );
  await expect(page.locator('.fb-composer')).toHaveCount(0);
  await expect(waiting).toContainText('Waiting for an answer in Slack');
  await expect(waiting).toContainText(channelQuestion.question);
  await expect(page.getByRole('button', { name: /Staging/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dismiss', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
});

function branchResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/frogbot/chat/branch' &&
      response.request().method() === 'POST',
  );
}

async function branch(page: Page): Promise<string | number> {
  const branched = branchResponse(page);

  await page.locator('.fb-channel-notice').getByRole('button', { name: 'Branch' }).click();

  const response = await branched;

  expect(response.ok()).toBe(true);

  return (await response.json()).chatId;
}

test('a channel conversation renders read-only from the server without loading the chat', async ({
  page,
}) => {
  const chatLoads: string[] = [];

  page.on('request', (request) => {
    if (new URL(request.url()).pathname === `/api/${chatsSlug}/${chatId}`) {
      chatLoads.push(request.url());
    }
  });

  await page.reload();

  await expect(page.locator('.fb-channel-notice')).toContainText(
    'This conversation happens in Slack.',
  );
  await expect(page.locator('.fb-composer')).toHaveCount(0);
  await expect(page.locator('.fb-question-tool--waiting')).toBeVisible();

  expect(chatLoads).toEqual([]);
});

test('Branch branches at the last message and opens the private chat', async ({ page }) => {
  const branched = branchResponse(page);

  await page.locator('.fb-channel-notice').getByRole('button', { name: 'Branch' }).click();

  const response = await branched;

  expect(response.request().postDataJSON()).toEqual({
    chatId: String(chatId),
    messageId: 'channel-assistant-1',
  });

  const branchId = (await response.json()).chatId;

  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/${branchId}$`));
  await expect(page.locator('.fb-composer textarea')).toBeVisible();
});

test('a branch continues privately without touching the channel conversation', async ({ page }) => {
  model.respond({ text: 'The thread asks where to deploy.' });

  const branchId = await branch(page);

  await page.goto(`/collections/${chatsSlug}/${branchId}`);

  await expect(page.locator('.fb-channel-notice')).toHaveCount(0);
  await expect(page.locator('.fb-question-tool--closed')).toContainText(
    'Interrupted before the tool call completed.',
  );

  await page.locator('.fb-composer textarea').fill('Summarize the thread');
  await page.locator('.fb-composer textarea').press('Enter');

  await expect(page.getByText('The thread asks where to deploy.', { exact: true })).toBeVisible();
  expect(model.requests).toHaveLength(1);

  const channelMessages = await storedMessages(page, chatId);

  expect(channelMessages).toHaveLength(2);
  expect(channelMessages[1]!.parts).toContainEqual(
    expect.objectContaining({ toolCallId: 'channel-call-1', state: 'input-available' }),
  );
});
