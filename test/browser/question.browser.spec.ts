import { expect, type Page, test } from '@playwright/test';

import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel';
import { signIn } from './__helpers/signIn';
import { agentSlug, chatsSlug, messagesSlug, modelPort } from './fixtures/question/shared';

const questionCall = {
  id: 'call-1',
  name: 'question',
  input: {
    questions: [
      {
        header: 'Target',
        question: 'Where should this deploy?',
        options: [
          { label: 'Staging', description: 'Safe to try' },
          { label: 'Production', description: 'Live traffic' },
        ],
        custom: false,
      },
    ],
  },
};

const answer = { answers: [{ header: 'Target', selected: ['Staging'] }] };

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

function agentPosts(page: Page) {
  const posts: unknown[] = [];

  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === `/api/agents/${agentSlug}` &&
      request.method() === 'POST'
    ) {
      posts.push(request.postDataJSON());
    }
  });

  return posts;
}

async function storedAssistant(page: Page) {
  const response = await page.request.get(`/api/${messagesSlug}`, {
    params: { 'where[role][equals]': 'assistant', sort: 'createdAt', depth: 0 },
  });

  expect(response.ok()).toBe(true);

  return (await response.json()).docs[0] as
    | { parts: Array<Record<string, unknown>>; settlements?: Record<string, { outcome: string }> }
    | undefined;
}

test('answering a question persists the answer and continues the turn once', async ({ page }) => {
  const posts = agentPosts(page);

  model.respond({ toolCalls: [questionCall] }, { text: 'Deploying to staging.' });

  await send(page, 'Deploy it');

  const staging = page.getByRole('button', { name: /Staging/ });

  await expect(staging).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));

  await staging.dblclick();

  await expect(page.getByText('Deploying to staging.', { exact: true })).toBeVisible();
  await expect(page.locator('.fb-question-tool--answered')).toContainText('Staging');

  expect(posts).toHaveLength(2);
  expect(model.requests).toHaveLength(2);
  expect(model.requests[1]!.messages).toContainEqual(
    expect.objectContaining({ role: 'tool', tool_call_id: 'call-1' }),
  );

  await expect
    .poll(async () => (await storedAssistant(page))?.settlements?.['call-1']?.outcome)
    .toBe('answered');

  expect((await storedAssistant(page))?.parts).toContainEqual(
    expect.objectContaining({
      type: 'tool-question',
      toolCallId: 'call-1',
      state: 'output-available',
      output: answer,
    }),
  );
});

test('a pending question stays answerable after a reload', async ({ page }) => {
  model.respond({ toolCalls: [questionCall] }, { text: 'Deploying to staging.' });

  await send(page, 'Deploy it');

  await expect(page.getByRole('button', { name: /Staging/ })).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));

  await page.reload();

  await page.getByRole('button', { name: /Staging/ }).click();

  await expect(page.getByText('Deploying to staging.', { exact: true })).toBeVisible();
  expect(model.requests).toHaveLength(2);
});

test('dismissing a question closes it without another model call', async ({ page }) => {
  model.respond({ toolCalls: [questionCall] });

  await send(page, 'Deploy it');

  await expect(page.getByRole('button', { name: /Staging/ })).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));

  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();

  await expect(page.getByText('Dismissed by the user.', { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await storedAssistant(page))?.settlements?.['call-1']?.outcome)
    .toBe('dismissed');

  await page.reload();

  await expect(page.getByText('Dismissed by the user.', { exact: true })).toBeVisible();
  expect(model.requests).toHaveLength(1);
});

test('a message sent while a question is pending is queued and runs after the answer', async ({
  page,
}) => {
  model.respond(
    { toolCalls: [questionCall] },
    { text: 'Deploying to staging.' },
    { text: 'The logs are clean.' },
  );

  await send(page, 'Deploy it');

  const staging = page.getByRole('button', { name: /Staging/ });

  await expect(staging).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));

  await send(page, 'Also check the logs');

  const queued = page.locator('.fb-chat__queued');

  await expect(queued).toContainText('Queued');
  await expect(queued).toContainText('Also check the logs');

  await staging.click();

  await expect(page.getByText('Deploying to staging.', { exact: true })).toBeVisible();
  await expect(page.getByText('The logs are clean.', { exact: true })).toBeVisible();
  await expect(queued).toHaveCount(0);
  await expect(page.locator('.fb-message').getByText('Also check the logs')).toBeVisible();

  expect(model.requests).toHaveLength(3);
});
