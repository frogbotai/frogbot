import { expect, type Page, test } from '@playwright/test';

import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel';
import { fetchMetadata, metadataValues } from './__helpers/metadata';
import { signIn } from './__helpers/signIn';
import {
  agentSlug,
  chatsSlug,
  hiddenSettings,
  insightsPath,
  modelPort,
  reportsPath,
  robotSettings,
  tasksSlug,
  usersSlug,
} from './fixtures/question/shared';

type MarkedWindow = Window & {
  breadcrumbsMarker?: string;
  breadcrumbsLabels?: string[];
  breadcrumbsTitles?: string[];
  breadcrumbsTitleObserver?: MutationObserver;
};

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

async function expectTabTitle(page: Page, text: string) {
  await expect.soft(page).toHaveTitle(`${text} - FrogBot`);
}

async function expectExactTabTitle(page: Page, title: string) {
  await expect.soft(page).toHaveTitle(title);
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

async function recordTitles(page: Page) {
  await page.evaluate(() => {
    const marked = window as MarkedWindow;
    const titles: string[] = [];

    marked.breadcrumbsTitleObserver?.disconnect();

    const record = () => {
      const title = document.title;

      if (titles.at(-1) !== title) titles.push(title);
    };

    marked.breadcrumbsTitles = titles;

    record();

    const observer = new MutationObserver(record);

    marked.breadcrumbsTitleObserver = observer;

    observer.observe(document.head, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  });
}

async function recordedTitles(page: Page) {
  return page.evaluate(() => (window as MarkedWindow).breadcrumbsTitles ?? []);
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

  await expectTabTitle(page, 'Users');
  await recordTitles(page);

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

  await expectTabTitle(page, threadTitle);
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Users - FrogBot');
});

test('moving through chat, Settings, and a board labels each page without a reload', async ({
  page,
}) => {
  await createChat(page, threadTitle);

  await openFirstPage(page, `/collections/${usersSlug}`);
  await expectLabel(page, 'Users');

  await expectTabTitle(page, 'Users');

  await recordTitles(page);

  await recents(page).getByRole('link', { name: threadTitle, exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));
  await expectLabel(page, 'Chats', threadTitle);

  await expectTabTitle(page, threadTitle);
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Users - FrogBot');
  await recordTitles(page);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/create$`));
  await expect(page.locator('.fb-composer textarea')).toBeVisible();
  await expectLabel(page);

  await expectTabTitle(page, 'Creating - Chat');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain(`${threadTitle} - FrogBot`);

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();

  await expect(page).toHaveURL(/\/settings\/collections$/);
  await expect(stepNav(page)).toHaveCount(0);

  await expectTabTitle(page, 'Collections');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain(`${threadTitle} - FrogBot`);

  await settingsNav(page).getByRole('link', { name: robotSettings.label, exact: true }).click();

  await expect(page.getByTestId('robot-settings')).toBeVisible();
  await expect(stepNav(page)).toHaveCount(0);

  await expectTabTitle(page, robotSettings.label);

  await settingsNav(page).getByRole('link', { name: 'Collections', exact: true }).click();

  await expect(page).toHaveURL(/\/settings\/collections$/);

  await expectTabTitle(page, 'Collections');
  await recordTitles(page);

  await page.locator(`#card-${tasksSlug} .card__click`).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${tasksSlug}(\\?|$)`));
  await expectLabel(page, 'Tasks');

  await expectTabTitle(page, 'Tasks');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Collections - FrogBot');

  await viewSwitcher(page).getByRole('link', { name: 'Board', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${tasksSlug}/board(\\?|$)`));
  await expectLabel(page, 'Tasks');

  await expectTabTitle(page, 'Tasks');

  await viewSwitcher(page).getByRole('link', { name: 'List', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${tasksSlug}(\\?|$)`));
  await expectLabel(page, 'Tasks');
  await expectNoReload(page);

  await expectTabTitle(page, 'Tasks');
});

test('a custom view that sets no label shows only the logo', async ({ page }) => {
  await openFirstPage(page, `/collections/${usersSlug}`);
  await expectLabel(page, 'Users');
  await expectTabTitle(page, 'Users');
  await recordTitles(page);

  await sidebar(page).getByRole('button', { name: 'Reports', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expectLabel(page);
  await expectNoReload(page);

  await expectExactTabTitle(page, 'FrogBot');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Users - FrogBot');
});

test('a labelled custom view follows its label and clears it on an unlabelled view', async ({
  page,
}) => {
  await openFirstPage(page, `/collections/${usersSlug}`);
  await expectLabel(page, 'Users');
  await expectTabTitle(page, 'Users');
  await recordTitles(page);

  await sidebar(page).getByRole('button', { name: 'Insights', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${insightsPath}$`));
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
  await expectLabel(page, 'Insights');
  await expectTabTitle(page, 'Insights');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Users - FrogBot');

  await recordTitles(page);
  await sidebar(page).getByRole('button', { name: 'Reports', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${reportsPath}$`));
  await expectLabel(page);
  await expectExactTabTitle(page, 'FrogBot');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Insights - FrogBot');
  await expectNoReload(page);
});

test('moving between threads follows the new label despite identical server metadata', async ({
  page,
}) => {
  const firstId = await createChat(page, threadTitle);
  const secondId = await createChat(page, secondGeneratedTitle);

  await openFirstPage(page, `/collections/${chatsSlug}/${firstId}`);
  await expectLabel(page, 'Chats', threadTitle);
  await expectTabTitle(page, threadTitle);
  await recordTitles(page);

  await recents(page).getByRole('link', { name: secondGeneratedTitle, exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/${secondId}$`));
  await expectLabel(page, 'Chats', secondGeneratedTitle);
  await expectTabTitle(page, secondGeneratedTitle);
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain(`${threadTitle} - FrogBot`);
  await expectNoReload(page);
});

test('saving a new task labels its edit page with the task title', async ({ page }) => {
  await openFirstPage(page, `/collections/${tasksSlug}`);
  await expectLabel(page, 'Tasks');

  await page.locator('.list-create-new-doc__create-new-button').click();

  await expectTabTitle(page, 'Create New');
  await recordTitles(page);

  await page.locator('#field-title').fill(taskTitle);
  await page.locator('#action-save').click();

  await expect(page).toHaveURL(new RegExp(`/collections/${tasksSlug}/\\d+$`));
  await expectLabel(page, 'Tasks', taskTitle);
  await expectNoReload(page);

  await expectTabTitle(page, taskTitle);
  await expect(page.locator('head title:not([data-frogbot-tab-title])').first()).toHaveJSProperty(
    'textContent',
    'Editing - Task - FrogBot',
  );
  await expectTabTitle(page, taskTitle);
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Create New - FrogBot');
});

test('a new chat label follows the placeholder, generated, and renamed titles', async ({
  page,
}) => {
  const reply = held();
  const title = held();
  const chatDocument = held();
  const chatDocumentPath = new RegExp(`/api/${chatsSlug}/\\d+\\?depth=0$`);

  model.respond({ text: 'Here is the summary.', hold: reply.hold });
  model.respondTitle({ text: generatedTitle, hold: title.hold });

  await openFirstPage(page, `/collections/${usersSlug}`);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();
  await expectLabel(page);

  await expectTabTitle(page, 'Creating - Chat');
  await recordTitles(page);

  await page.route(chatDocumentPath, async (route) => {
    await chatDocument.hold;
    await route.continue().catch(() => undefined);
  });

  await send(page, firstMessage);

  await expect(
    recents(page).getByRole('link', { name: placeholderTitle, exact: true }),
  ).toBeVisible();

  const chatDocumentRequest = page.waitForRequest(chatDocumentPath);

  reply.release();
  await chatDocumentRequest;

  await expectLabel(page, 'Chats');
  await expectTabTitle(page, 'Chats');

  chatDocument.release();

  await expect(page.getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));
  await expectLabel(page, 'Chats', placeholderTitle);

  await page.unroute(chatDocumentPath);

  await expectTabTitle(page, placeholderTitle);

  title.release();

  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(stepNav(page)).toHaveText(`/Chats/${generatedTitle}`, { timeout: 1_000 });
  }).toPass();
  await expect(
    recents(page).getByRole('link', { name: generatedTitle, exact: true }),
  ).toBeVisible();

  await expectTabTitle(page, generatedTitle);

  const row = recents(page).locator('.fb-chat-row-actions__row', { hasText: generatedTitle });

  await row.hover();
  await row.getByRole('button', { name: 'Chat actions' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Chat title' }).fill(renamedTitle);
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(recents(page).getByRole('link', { name: renamedTitle, exact: true })).toBeVisible();
  await expectLabel(page, 'Chats', renamedTitle);
  await expectNoReload(page);

  await expectTabTitle(page, renamedTitle);
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Creating - Chat - FrogBot');

  await recordTitles(page);
  await collectionsNav(page).getByRole('link', { name: 'Users', exact: true }).click();

  await expectLabel(page, 'Users');
  await expectTabTitle(page, 'Users');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain(`${renamedTitle} - FrogBot`);

  await recordTitles(page);
  await sidebar(page).getByRole('button', { name: 'Insights', exact: true }).click();

  await expectLabel(page, 'Insights');
  await expectTabTitle(page, 'Insights');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Users - FrogBot');
  await expectNoReload(page);
});

for (const title of ['', ' \n\t ']) {
  test(`a chat with the blank title ${JSON.stringify(title)} uses Untitled in the tab`, async ({
    page,
  }) => {
    const chatId = await createChat(page, title);

    await openFirstPage(page, `/collections/${chatsSlug}/${chatId}`);
    await recordTitles(page);

    await expectLabel(page, 'Chats', 'Untitled');
    await expectTabTitle(page, 'Untitled');
    expect(await recordedTitles(page)).not.toContain(' - FrogBot');
  });
}

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

  await expectTabTitle(page, placeholderTitle);
  await recordTitles(page);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/create$`));
  await expect(page.getByText('Here is the summary.', { exact: true })).toHaveCount(0);
  await expectLabel(page);

  await expectTabTitle(page, 'Creating - Chat');

  firstTitle.release();

  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      recents(page).getByRole('link', { name: generatedTitle, exact: true }),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await expectLabel(page);

  await expectTabTitle(page, 'Creating - Chat');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain(`${generatedTitle} - FrogBot`);
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain(`${placeholderTitle} - FrogBot`);

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

  await expectTabTitle(page, secondMessage);
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

  await expectTabTitle(page, placeholderTitle);
  await recordTitles(page);

  await sidebar(page).getByRole('button', { name: 'New Chat', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/create$`));
  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toHaveCount(0);
  await expectLabel(page);

  await expectTabTitle(page, 'Creating - Chat');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain(`${placeholderTitle} - FrogBot`);

  await recordLabels(page);
  await recordTitles(page);

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

  await expectTabTitle(page, placeholderTitle);

  await expect(page.locator('head title:not([data-frogbot-tab-title])').first()).toHaveJSProperty(
    'textContent',
    'Editing - Chat - FrogBot',
  );
  await expectTabTitle(page, placeholderTitle);
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Creating - Chat - FrogBot');
});

test('a navigation replaced before it finishes never shows its label', async ({ page }) => {
  const tasks = held();
  const tasksPath = `/collections/${tasksSlug}`;

  await openFirstPage(page, `/collections/${usersSlug}`);
  await expectLabel(page, 'Users');
  await recordLabels(page);
  await recordTitles(page);

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

  await expectExactTabTitle(page, 'FrogBot');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Tasks - FrogBot');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('Users - FrogBot');
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

  await expectTabTitle(page, placeholderTitle);
  await recordTitles(page);

  await page.goBack();

  await expect(page).toHaveURL(new RegExp(`${reportsPath}$`));
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expectLabel(page);

  await expectExactTabTitle(page, 'FrogBot');
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain(`${placeholderTitle} - FrogBot`);

  await recordTitles(page);

  await page.goForward();

  await expect(page).toHaveURL(threadURL);
  await expect(chatView(page).getByText('Here is the summary.', { exact: true })).toBeVisible();
  await expectLabel(page, 'Chats', placeholderTitle);
  await expectNoReload(page);

  await expectTabTitle(page, placeholderTitle);

  await expect(page.locator('head title:not([data-frogbot-tab-title])').first()).toHaveJSProperty(
    'textContent',
    'Editing - Chat - FrogBot',
  );
  await expectTabTitle(page, placeholderTitle);
  expect.soft((await recordedTitles(page)).slice(1)).not.toContain('FrogBot');
});

test.describe('server titles', () => {
  const pages = [
    { path: '/settings/collections', text: 'Collections', title: 'Collections - FrogBot' },
    {
      path: `/settings/${robotSettings.path}`,
      text: robotSettings.label,
      title: `${robotSettings.label} - FrogBot`,
    },
    { path: `/settings/${hiddenSettings.path}`, text: 'Settings', title: 'Settings - FrogBot' },
    { path: '/settings/does-not-exist', text: 'Settings', title: 'Settings - FrogBot' },
    { path: reportsPath, text: 'FrogBot', title: 'FrogBot' },
    { path: insightsPath, text: 'FrogBot', title: 'FrogBot' },
  ];

  for (const { path, text, title } of pages) {
    test(`${path} serves the title ${title} with matching metadata`, async ({ page }) => {
      const metadata = await fetchMetadata(page.request, path);

      expect(metadata.titles).toEqual([title]);
      expect(metadata).toMatchObject({ ogTitle: text, description: text, keywords: text });
    });
  }

  test('Settings and custom views serve no Payload in their titles or metadata', async ({
    page,
  }) => {
    const values = await Promise.all(
      pages.map(async ({ path }) => metadataValues(await fetchMetadata(page.request, path))),
    );

    expect(values.flat().filter((value) => value.includes('Payload'))).toEqual([]);
  });

  test('a Settings entry the user cannot open keeps its label out of the metadata', async ({
    page,
  }) => {
    const metadata = await fetchMetadata(page.request, `/settings/${hiddenSettings.path}`);

    const leaked = metadataValues(metadata).filter((value) => value.includes(hiddenSettings.label));

    expect(leaked).toEqual([]);
  });

  test('a signed-out request for a Settings entry reveals neither its label nor Payload', async ({
    baseURL,
    playwright,
  }) => {
    const request = await playwright.request.newContext({ baseURL });
    const metadata = await fetchMetadata(request, `/settings/${robotSettings.path}`);

    await request.dispose();

    expect(metadata.titles).toHaveLength(1);

    const leaked = metadataValues(metadata).filter(
      (value) => value.includes(robotSettings.label) || value.includes('Payload'),
    );

    expect(leaked).toEqual([]);
  });
});

for (const path of [`/settings/${hiddenSettings.path}`, '/settings/does-not-exist']) {
  test(`opening ${path} shows Page not found under a Settings tab title`, async ({ page }) => {
    await page.goto(path);

    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.locator('.frogbot-settings-template__header')).toHaveText('Settings');
    await expectTabTitle(page, 'Settings');
  });
}
