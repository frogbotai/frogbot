import { expect, type Page, test } from '@playwright/test';

import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel';
import { signIn } from './__helpers/signIn';
import { agentSlug, chatPicksPreference, chatsSlug, modelPort } from './fixtures/question/shared';

const questionCall = {
  id: 'call-1',
  name: 'question',
  input: {
    questions: [
      {
        header: 'Target',
        question: 'Where should this deploy?',
        options: [{ label: 'Staging' }, { label: 'Production' }],
        custom: false,
      },
    ],
  },
};

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

function trigger(page: Page) {
  return page.locator('.fb-model-selector__trigger');
}

function slider(page: Page) {
  return page.getByRole('slider', { name: 'Reasoning' });
}

async function send(page: Page, text: string) {
  await page.locator('.fb-composer textarea').fill(text);
  await page.locator('.fb-composer textarea').press('Enter');
}

async function chooseModel(page: Page, name: string) {
  await trigger(page).click();
  await page.locator('.fb-model-selector__model').click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.keyboard.press('Escape');
}

async function chooseLevel(page: Page, key: 'Home' | 'End') {
  await trigger(page).click();
  await slider(page).press(key);
  await page.keyboard.press('Escape');
}

async function savedPicks(page: Page) {
  const response = await page.request.get(`/api/payload-preferences/${chatPicksPreference}`);

  return response.ok() ? (await response.json()).value : undefined;
}

function choices() {
  return model.requests.map((request) => [request.model, request.reasoning_effort]);
}

test('the slider steps through the model levels with the keyboard', async ({ page }) => {
  await chooseModel(page, 'thinker');

  await expect(trigger(page)).toHaveText('thinker · Default');

  await trigger(page).click();

  const reasoning = slider(page);

  await reasoning.press('End');
  await expect(reasoning).toHaveAttribute('aria-valuetext', 'High');
  await expect(trigger(page)).toHaveText('thinker · High');

  await reasoning.press('ArrowLeft');
  await expect(reasoning).toHaveAttribute('aria-valuetext', 'Low');

  await reasoning.press('Home');
  await expect(reasoning).toHaveAttribute('aria-valuetext', 'Default');

  await reasoning.press('ArrowRight');
  await expect(reasoning).toHaveAttribute('aria-valuetext', 'Low');
  await expect(trigger(page)).toHaveText('thinker · Low');
});

test('the chosen level reaches the model on every message', async ({ page }) => {
  await chooseModel(page, 'thinker');
  await chooseLevel(page, 'End');

  await expect(trigger(page)).toHaveText('thinker · High');

  model.respond({ text: 'Thought hard.' });

  await send(page, 'Think about it');

  await expect(page.getByText('Thought hard.', { exact: true })).toBeVisible();

  expect(choices()).toEqual([['thinker', 'high']]);
});

test('a model without levels hides the slider and sends none, and switching back restores its level', async ({
  page,
}) => {
  await chooseModel(page, 'thinker');
  await chooseLevel(page, 'End');
  await chooseModel(page, 'questioner');

  await expect(trigger(page)).toHaveText('questioner');

  await trigger(page).click();

  await expect(page.locator('.fb-model-selector__model')).toBeVisible();
  await expect(slider(page)).toHaveCount(0);

  await page.keyboard.press('Escape');

  model.respond({ text: 'Plain reply.' });

  await send(page, 'Answer plainly');

  await expect(page.getByText('Plain reply.', { exact: true })).toBeVisible();

  await chooseModel(page, 'thinker');

  await expect(trigger(page)).toHaveText('thinker · High');

  model.respond({ text: 'Deep reply.' });

  await send(page, 'Now think');

  await expect(page.getByText('Deep reply.', { exact: true })).toBeVisible();

  expect(choices()).toEqual([
    ['questioner', undefined],
    ['thinker', 'high'],
  ]);
  expect(model.requests[0]).not.toHaveProperty('reasoning_effort');
});

test('reloading a chat shows the choice of its latest message, and a new chat the saved one', async ({
  page,
}) => {
  await chooseModel(page, 'thinker');
  await chooseLevel(page, 'Home');
  await trigger(page).click();
  await slider(page).press('ArrowRight');
  await page.keyboard.press('Escape');

  model.respond({ text: 'Light reply.' });

  await send(page, 'Think a little');

  await expect(page.getByText('Light reply.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));

  await chooseLevel(page, 'End');

  await expect(trigger(page)).toHaveText('thinker · High');
  await expect
    .poll(() => savedPicks(page))
    .toMatchObject({ model: 'browser/thinker', reasoning: { 'browser/thinker': 'high' } });

  await page.reload();

  await expect(trigger(page)).toHaveText('thinker · Low');

  await page.goto(`/collections/${chatsSlug}/create`);

  await expect(trigger(page)).toHaveText('thinker · High');
  expect(choices()).toEqual([['thinker', 'low']]);
});

test('a saved level the model no longer offers shows Default and is not sent', async ({ page }) => {
  const saved = await page.request.post(`/api/payload-preferences/${chatPicksPreference}`, {
    data: {
      value: {
        agent: 'questioner',
        model: 'browser/thinker',
        reasoning: { 'browser/thinker': 'max' },
      },
    },
  });

  expect(saved.ok()).toBe(true);

  await page.reload();

  await expect(trigger(page)).toHaveText('thinker · Default');

  model.respond({ text: 'Default reply.' });

  await send(page, 'Go');

  await expect(page.getByText('Default reply.', { exact: true })).toBeVisible();

  expect(choices()).toEqual([['thinker', undefined]]);
  expect(model.requests[0]).not.toHaveProperty('reasoning_effort');
});

test('a message queued behind a question runs with the choice it was sent with', async ({
  page,
}) => {
  const posts: Array<{ model?: string; reasoning?: string }> = [];

  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === `/api/agents/${agentSlug}` &&
      request.method() === 'POST'
    ) {
      posts.push(request.postDataJSON());
    }
  });

  model.respond(
    { toolCalls: [questionCall] },
    { text: 'Deploying to staging.' },
    { text: 'The logs are clean.' },
  );

  await chooseModel(page, 'thinker');
  await chooseLevel(page, 'End');
  await send(page, 'Deploy it');

  const staging = page.getByRole('button', { name: /Staging/ });

  await expect(staging).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));

  await chooseModel(page, 'questioner');
  await send(page, 'Also check the logs');

  await expect(page.locator('.fb-chat__queued')).toContainText('Also check the logs');

  await staging.click();

  await expect(page.getByText('The logs are clean.', { exact: true })).toBeVisible();

  expect(choices()).toEqual([
    ['thinker', 'high'],
    ['thinker', 'high'],
    ['questioner', undefined],
  ]);
  expect(posts.map(({ model, reasoning }) => [model, reasoning])).toEqual([
    ['browser/thinker', 'high'],
    ['browser/questioner', undefined],
    ['browser/questioner', undefined],
  ]);
});
