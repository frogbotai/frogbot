import { expect, type Page, test } from '@playwright/test';

import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel';
import { signIn } from './__helpers/signIn';
import {
  agentSlug,
  chatsSlug,
  modelPort,
  reportsPath,
  robotSettings,
  tasksSlug,
  usersSlug,
} from './fixtures/question/shared';

type MarkedWindow = Window & { breadcrumbsMarker?: string; breadcrumbsLabels?: string[] };

const threadTitle = 'Refund policy question';
const firstMessage = 'Summarize the quarterly refund requests from enterprise customers';
const placeholderTitle = 'Summarize the quarterly refund requests from en…';
const generatedTitle = 'Quarterly refund summary';
const secondMessage = 'Forecast next quarter';
const secondGeneratedTitle = 'Quarterly forecast';
const renamedTitle = 'Enterprise refunds';
const taskTitle = 'Write the launch notes';

let model: StubChatModel;

const releases: Array<() => void> = [];

test.setTimeout(120_000);

test.use({ viewport: { width: 1600, height: 900 } });

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
});

test.afterEach(async ({ page }) => {
  releases.splice(0).forEach((release) => release());

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

const stepNav = (page: Page) => page.locator('.app-header__step-nav');
const sidebar = (page: Page) => page.locator('.frogbot-nav-shell');
const recents = (page: Page) => page.locator('#frogbot-nav-section-recents');
const collectionsNav = (page: Page) => page.locator('#frogbot-nav-section-collections');
const settingsNav = (page: Page) => page.locator('.frogbot-settings-nav');
const viewSwitcher = (page: Page) => page.getByRole('navigation', { name: 'Collection views' });
const chatView = (page: Page) => page.locator('.frogbot-chat-view');
const threadPath = new RegExp(`/collections/${chatsSlug}/\\d+$`);

async function markChatView(page: Page) {
  await chatView(page).evaluate((element) => {
    element.setAttribute('data-breadcrumbs-marker', 'create');
  });
}

async function expectChatViewKept(page: Page) {
  await expect(chatView(page)).toHaveCount(1);
  await expect(chatView(page)).toHaveAttribute('data-breadcrumbs-marker', 'create');
}

async function chatCount(page: Page) {
  const response = await page.request.get(`/api/${chatsSlug}?depth=0`);

  expect(response.ok()).toBe(true);

  return (await response.json()).totalDocs as number;
}

async function expectLabel(page: Page, ...segments: string[]) {
  await expect(stepNav(page)).toHaveText(segments.length > 0 ? `/${segments.join('/')}` : '');
}

async function createChat(page: Page, title: string) {
  const response = await page.request.post(`/api/${chatsSlug}`, {
    data: { title, agent: agentSlug },
  });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc.id as number | string;
}

async function openFirstPage(page: Page, path: string) {
  await page.goto(path);
  await expect(sidebar(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');

  await page.evaluate(() => {
    (window as MarkedWindow).breadcrumbsMarker = 'first-load';
  });
}

async function expectNoReload(page: Page) {
  expect(await page.evaluate(() => (window as MarkedWindow).breadcrumbsMarker)).toBe('first-load');
}

async function recordLabels(page: Page) {
  await page.evaluate(() => {
    const marked = window as MarkedWindow;
    const labels: string[] = [];

    const record = () => {
      const label = document.querySelector('.app-header__step-nav')?.textContent ?? '';

      if (labels.at(-1) !== label) labels.push(label);
    };

    marked.breadcrumbsLabels = labels;

    record();

    new MutationObserver(record).observe(document.body, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  });
}

async function recordedLabels(page: Page) {
  return page.evaluate(() => (window as MarkedWindow).breadcrumbsLabels ?? []);
}

async function send(page: Page, text: string) {
  await page.locator('.fb-composer textarea').fill(text);
  await page.locator('.fb-composer textarea').press('Enter');
}

function isNavigationTo(url: string, path: string) {
  const { pathname, searchParams } = new URL(url);

  return pathname === path && searchParams.has('_rsc');
}

async function holdNavigation(page: Page, path: string, hold: Promise<void>) {
  let settle!: () => void;

  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });

  await page.route(
    (url) => isNavigationTo(url.href, path),
    async (route) => {
      await hold;
      await route.continue().catch(() => undefined);
      settle();
    },
  );

  return { settled };
}

function held() {
  let release!: () => void;

  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });

  releases.push(release);

  return { hold, release };
}

test('opening a chat from a collection list replaces the collection label with the thread', async ({
  page,
}) => {
  const chatId = await createChat(page, threadTitle);

  await openFirstPage(page, `/collections/${usersSlug}`);
  await expectLabel(page, 'Users');

  await recents(page).getByRole('link', { name: threadTitle, exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/${chatId}$`));
  await expect(page.locator('.fb-composer textarea')).toBeVisible();
  await expect(stepNav(page)).not.toContainText('Users');
  await expectLabel(page, 'Chats', threadTitle);
  await expect(stepNav(page).getByRole('link', { name: 'Chats', exact: true })).toHaveAttribute(
    'href',
    `/collections/${chatsSlug}`,
  );
  await expectNoReload(page);
});

test('moving through chat, Settings, and a board labels each page without a reload', async ({
  page,
}) => {
  await createChat(page, threadTitle);

  await openFirstPage(page, `/collections/${usersSlug}`);
  await expectLabel(page, 'Users');

  await recents(page).getByRole('link', { name: threadTitle, exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));
  await expectLabel(page, 'Chats', threadTitle);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/create$`));
  await expect(page.locator('.fb-composer textarea')).toBeVisible();
  await expectLabel(page);

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();

  await expect(page).toHaveURL(/\/settings\/collections$/);
  await expect(stepNav(page)).toHaveCount(0);

  await settingsNav(page).getByRole('link', { name: robotSettings.label, exact: true }).click();

  await expect(page.getByTestId('robot-settings')).toBeVisible();

  await settingsNav(page).getByRole('link', { name: 'Collections', exact: true }).click();

  await expect(page).toHaveURL(/\/settings\/collections$/);

  await page.locator(`#card-${tasksSlug} .card__click`).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${tasksSlug}(\\?|$)`));
  await expectLabel(page, 'Tasks');

  await viewSwitcher(page).getByRole('link', { name: 'Board', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${tasksSlug}/board(\\?|$)`));
  await expectLabel(page, 'Tasks');

  await viewSwitcher(page).getByRole('link', { name: 'List', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${tasksSlug}(\\?|$)`));
  await expectLabel(page, 'Tasks');
  await expectNoReload(page);
});

test('a custom view that sets no label shows only the logo', async ({ page }) => {
  await openFirstPage(page, `/collections/${usersSlug}`);
  await expectLabel(page, 'Users');

  await sidebar(page).getByRole('button', { name: 'Reports', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expectLabel(page);
  await expectNoReload(page);
});

test('saving a new task labels its edit page with the task title', async ({ page }) => {
  await openFirstPage(page, `/collections/${tasksSlug}`);
  await expectLabel(page, 'Tasks');

  await page.locator('.list-create-new-doc__create-new-button').click();
  await page.locator('#field-title').fill(taskTitle);
  await page.locator('#action-save').click();

  await expect(page).toHaveURL(new RegExp(`/collections/${tasksSlug}/\\d+$`));
  await expectLabel(page, 'Tasks', taskTitle);
  await expectNoReload(page);
});

test('a new chat label follows the placeholder, generated, and renamed titles', async ({
  page,
}) => {
  const reply = held();
  const title = held();

  model.respond({ text: 'Here is the summary.', hold: reply.hold });
  model.respondTitle({ text: generatedTitle, hold: title.hold });

  await openFirstPage(page, `/collections/${usersSlug}`);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();
  await expectLabel(page);

  await send(page, firstMessage);

  await expect(
    recents(page).getByRole('link', { name: placeholderTitle, exact: true }),
  ).toBeVisible();

  reply.release();

  await expect(page.getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));
  await expectLabel(page, 'Chats', placeholderTitle);

  title.release();

  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(stepNav(page)).toHaveText(`/Chats/${generatedTitle}`, { timeout: 1_000 });
  }).toPass();
  await expect(
    recents(page).getByRole('link', { name: generatedTitle, exact: true }),
  ).toBeVisible();

  const row = recents(page).locator('.fb-chat-row-actions__row', { hasText: generatedTitle });

  await row.hover();
  await row.getByRole('button', { name: 'Chat actions' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Chat title' }).fill(renamedTitle);
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(recents(page).getByRole('link', { name: renamedTitle, exact: true })).toBeVisible();
  await expectLabel(page, 'Chats', renamedTitle);
  await expectNoReload(page);
});

test('New Chat after a new thread clears the screen and sends the next message to another chat', async ({
  page,
}) => {
  const firstTitle = held();
  const secondTitle = held();

  model.respond({ text: 'Here is the summary.' }, { text: 'Here is the forecast.' });
  model.respondTitle(
    { text: generatedTitle, hold: firstTitle.hold },
    { text: secondGeneratedTitle, hold: secondTitle.hold },
  );

  await openFirstPage(page, `/collections/${usersSlug}`);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await send(page, firstMessage);

  await expect(page.getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));
  await expectLabel(page, 'Chats', placeholderTitle);

  const firstPath = new URL(page.url()).pathname;

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/create$`));
  await expect(page.getByText('Here is the summary.', { exact: true })).toHaveCount(0);
  await expectLabel(page);

  firstTitle.release();

  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      recents(page).getByRole('link', { name: generatedTitle, exact: true }),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await expectLabel(page);

  await send(page, secondMessage);

  await expect(page.getByText('Here is the forecast.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));
  await expect(page).not.toHaveURL(new RegExp(`${firstPath}$`));
  await expect(page.getByText(firstMessage, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Here is the summary.', { exact: true })).toHaveCount(0);
  await expectLabel(page, 'Chats', secondMessage);
  await expect(
    recents(page).getByRole('link', { name: generatedTitle, exact: true }),
  ).toHaveAttribute('href', firstPath);
  await expect(
    recents(page).getByRole('link', { name: secondMessage, exact: true }),
  ).toHaveAttribute('href', new URL(page.url()).pathname);
  await expectNoReload(page);
});

test('Back after New Chat from a new thread shows the first conversation again', async ({
  page,
}) => {
  const title = held();

  model.respond({ text: 'Here is the summary.' });
  model.respondTitle({ text: generatedTitle, hold: title.hold });

  await openFirstPage(page, `/collections/${usersSlug}`);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await send(page, firstMessage);

  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(threadPath);
  await expectLabel(page, 'Chats', placeholderTitle);

  const threadURL = page.url();

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/create$`));
  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toHaveCount(0);
  await expectLabel(page);

  await recordLabels(page);
  await page.goBack();

  await expect(page).toHaveURL(threadURL);
  await expect(chatView(page).getByText(firstMessage, { exact: true })).toBeVisible();
  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expectLabel(page, 'Chats', placeholderTitle);

  const shown = ['', '/Chats', `/Chats/${placeholderTitle}`];
  const labels = await recordedLabels(page);

  expect(labels.filter((label) => !shown.includes(label))).toEqual([]);
  expect(await chatCount(page)).toBe(1);
  await expectNoReload(page);
});

test('a navigation replaced before it finishes never shows its label', async ({ page }) => {
  const tasks = held();
  const tasksPath = `/collections/${tasksSlug}`;

  await openFirstPage(page, `/collections/${usersSlug}`);
  await expectLabel(page, 'Users');
  await recordLabels(page);

  const { settled } = await holdNavigation(page, tasksPath, tasks.hold);
  const tasksRequest = page.waitForRequest((request) => isNavigationTo(request.url(), tasksPath));

  await collectionsNav(page).getByRole('link', { name: 'Tasks', exact: true }).click();
  await tasksRequest;
  await sidebar(page).getByRole('button', { name: 'Reports', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expectLabel(page);

  tasks.release();
  await settled;

  await expect(page).toHaveURL(new RegExp(`${reportsPath}$`));
  await expectLabel(page);

  const labels = await recordedLabels(page);

  expect(labels[0]).toBe('/Users');
  expect(labels).not.toContainEqual(expect.stringContaining('Tasks'));
  await expectNoReload(page);
});

test('the first conversation stays on screen after a new chat moves to its thread page', async ({
  page,
}) => {
  model.respond({ text: 'Here is the summary.' });
  model.respondTitle({ text: generatedTitle });

  await openFirstPage(page, `/collections/${usersSlug}`);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await markChatView(page);
  await recordLabels(page);
  await send(page, firstMessage);

  await expect(page).toHaveURL(threadPath);
  await expectChatViewKept(page);
  await expect(chatView(page).getByText(firstMessage, { exact: true })).toBeVisible();
  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expectLabel(page, 'Chats', generatedTitle);
  await expect(
    recents(page).getByRole('link', { name: generatedTitle, exact: true }),
  ).toBeVisible();

  const shown = ['', '/Chats', `/Chats/${placeholderTitle}`, `/Chats/${generatedTitle}`];
  const labels = await recordedLabels(page);

  expect(labels.filter((label) => !shown.includes(label))).toEqual([]);
  await expectNoReload(page);
});

test('a message sent right after the first reply continues the same chat', async ({ page }) => {
  model.respond({ text: 'Here is the summary.' }, { text: 'Here is the forecast.' });

  await openFirstPage(page, `/collections/${usersSlug}`);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await markChatView(page);
  await send(page, firstMessage);

  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(threadPath);

  await send(page, secondMessage);

  await expect(chatView(page).getByText('Here is the forecast.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(threadPath);
  await expectChatViewKept(page);
  await expect(chatView(page).getByText(firstMessage, { exact: true })).toBeVisible();
  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expect(chatView(page).getByText(secondMessage, { exact: true })).toBeVisible();
  await expect(chatView(page).getByText('Here is the forecast.', { exact: true })).toBeVisible();
  expect(await chatCount(page)).toBe(1);
  await expectNoReload(page);
});

test('a reply streaming on the new thread page stays on screen until it finishes', async ({
  page,
}) => {
  const forecast = held();

  model.respond(
    { text: 'Here is the summary.' },
    { text: 'Here is the forecast.', hold: forecast.hold },
  );

  await openFirstPage(page, `/collections/${usersSlug}`);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await markChatView(page);
  await send(page, firstMessage);

  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(threadPath);

  await send(page, secondMessage);

  await expect.poll(() => model.requests.length).toBe(2);
  await expectChatViewKept(page);
  await expect(chatView(page).getByText(secondMessage, { exact: true })).toBeVisible();

  forecast.release();

  await expect(chatView(page).getByText('Here is the forecast.', { exact: true })).toBeVisible();
  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(threadPath);
  expect(await chatCount(page)).toBe(1);
});

test('stopping the first reply keeps the new chat and continues it with the next message', async ({
  page,
}) => {
  const summary = held();
  const title = held();

  model.respond(
    { text: 'Here is the summary.', hold: summary.hold },
    { text: 'Here is the forecast.' },
  );
  model.respondTitle({ text: generatedTitle, hold: title.hold });

  await openFirstPage(page, `/collections/${usersSlug}`);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await markChatView(page);
  await send(page, firstMessage);

  await expect.poll(() => model.requests.length).toBe(1);

  await page.getByRole('button', { name: 'Stop', exact: true }).click();

  await expect(page).toHaveURL(threadPath);
  await expectChatViewKept(page);
  await expect(chatView(page).getByText(firstMessage, { exact: true })).toBeVisible();
  await expectLabel(page, 'Chats', placeholderTitle);

  const stoppedPath = new URL(page.url()).pathname;

  summary.release();

  await send(page, secondMessage);

  await expect(chatView(page).getByText('Here is the forecast.', { exact: true })).toBeVisible();
  await expect(chatView(page).getByText(firstMessage, { exact: true })).toBeVisible();
  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${stoppedPath}$`));
  expect(await chatCount(page)).toBe(1);
  await expectNoReload(page);
});

test('Back from a new thread returns to the page before the new chat and Forward restores it', async ({
  page,
}) => {
  const title = held();

  model.respond({ text: 'Here is the summary.' });
  model.respondTitle({ text: generatedTitle, hold: title.hold });

  await openFirstPage(page, reportsPath);

  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await markChatView(page);
  await send(page, firstMessage);

  await expect(page).toHaveURL(threadPath);
  await expectChatViewKept(page);
  await expectLabel(page, 'Chats', placeholderTitle);

  const threadURL = page.url();

  await page.goBack();

  await expect(page).toHaveURL(new RegExp(`${reportsPath}$`));
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expectLabel(page);

  await page.goForward();

  await expect(page).toHaveURL(threadURL);
  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expectLabel(page, 'Chats', placeholderTitle);
  await expectNoReload(page);
});
