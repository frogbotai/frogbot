import { expect, test } from '@playwright/test';

const user = { email: 'rich-text@example.com', password: 'browser-test-password' };

test('edits, saves, reloads, and renders rich text through the generated import map', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.waitForURL(/\/admin\/(create-first-user|login)/);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)$/.test(url.pathname));

  await page.goto('/admin/collections/posts/create');
  await page.fill('input[name="title"]', 'Browser rich text');

  const editor = page.locator('[contenteditable="true"]').first();

  await editor.click();
  await editor.press('ControlOrMeta+b');
  await page.keyboard.insertText('Formatted browser content');
  await editor.press('ControlOrMeta+b');
  await expect(editor.locator('strong')).toContainText('Formatted browser content');

  await page.keyboard.press('Enter');
  await page.keyboard.insertText('/callout');

  const slashMenu = page.locator('#slash-menu .slash-menu-popup');

  await expect(slashMenu).toBeVisible();
  await slashMenu.getByRole('option', { name: 'Callout' }).click();

  const callout = page.locator('.LexicalEditorTheme__block').first();

  await expect(callout).toBeVisible();
  await expect(callout.locator('.shimmer-effect')).toHaveCount(0);

  const calloutTitle = callout.locator('.field-type.text input');

  await calloutTitle.fill('Nested browser callout');
  await expect(calloutTitle).toHaveValue('Nested browser callout');
  await calloutTitle.press('Tab');

  const nestedEditor = callout.locator('[contenteditable="true"]').first();

  await nestedEditor.click();
  await page.keyboard.insertText('Nested editor content');

  await editor.locator('p').last().click();
  await page.keyboard.insertText('/inlinebadge');
  await expect(slashMenu).toBeVisible();
  await slashMenu.getByRole('option', { name: 'Inline badge' }).click();

  const inlineBlockDrawer = page.locator('dialog[id^="drawer_1_lexical-inlineBlocks-create-"]');

  await expect(inlineBlockDrawer).toBeVisible();
  await expect(inlineBlockDrawer.locator('.shimmer-effect')).toHaveCount(0);
  const inlineBlockLabel = inlineBlockDrawer.locator('input[name="label"]');

  await inlineBlockLabel.fill('Browser badge');
  await inlineBlockLabel.press('Tab');
  await inlineBlockDrawer.getByRole('button', { name: /save changes/i }).click();
  await expect(inlineBlockDrawer).toBeHidden();

  const inlineBlock = editor.locator('.LexicalEditorTheme__inlineBlock');

  await expect(inlineBlock).toHaveCount(1);

  const inlineBlockContainer = inlineBlock.locator('.LexicalEditorTheme__inlineBlock__container');

  await inlineBlockContainer
    .locator('.LexicalEditorTheme__inlineBlock__editButton')
    .first()
    .click();

  const inlineBlockEditDrawer = page
    .locator('dialog[id^="drawer_1_lexical-inlineBlocks-create-"]')
    .first();

  await expect(inlineBlockEditDrawer).toBeVisible();
  await expect(inlineBlockEditDrawer.locator('input[name="label"]')).toHaveValue('Browser badge');
  await inlineBlockEditDrawer.locator('input[name="label"]').fill('Updated browser badge');
  await inlineBlockEditDrawer.locator('input[name="label"]').press('Tab');
  await inlineBlockEditDrawer.getByRole('button', { name: /save changes/i }).click();
  await expect(inlineBlockEditDrawer).toBeHidden();

  await inlineBlock.click();
  await page.keyboard.press('Backspace');
  await expect(editor.locator('.LexicalEditorTheme__inlineBlock')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor.locator('.LexicalEditorTheme__inlineBlock')).toHaveCount(1);

  const saveResponse = page.waitForResponse(
    (response) => response.url().includes('/api/posts') && response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: /save/i }).first().click();
  const response = await saveResponse;

  expect(response.ok(), await response.text()).toBe(true);
  await page.waitForURL(
    (url) =>
      /^\/admin\/collections\/posts\/[^/]+$/.test(url.pathname) &&
      !url.pathname.endsWith('/create'),
  );

  await page.reload();
  await expect(editor).toContainText('Formatted browser content');
  await expect(
    page.locator('.LexicalEditorTheme__block').first().locator('.field-type.text input'),
  ).toHaveValue('Nested browser callout');
  await expect(page.locator('.LexicalEditorTheme__block').first()).toContainText(
    'Nested editor content',
  );
  await expect(editor.locator('.LexicalEditorTheme__inlineBlock')).toHaveCount(1);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Browser rich text' })).toBeVisible();
  await expect(page.getByTestId('rendered-rich-text')).toContainText('Formatted browser content');
  await expect(page.getByTestId('rendered-rich-text').locator('strong')).toContainText(
    'Formatted browser content',
  );
  await expect(page.getByTestId('rendered-callout')).toContainText('Nested browser callout');
  await expect(page.getByTestId('rendered-callout')).toContainText('Nested editor content');
  await expect(page.getByTestId('rendered-inline-badge')).toContainText('Updated browser badge');
});

test('creates and persists an external link through the link drawer', async ({ page }) => {
  await page.goto('/admin/login');
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));

  await page.goto('/admin/collections/posts/create');
  await page.fill('input[name="title"]', 'Browser rich text link');

  const editor = page.locator('[contenteditable="true"]').first();

  await editor.click();
  await page.keyboard.insertText('Visit FrogBot docs');

  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('Shift+ArrowLeft');
  }

  const inlineToolbar = page.locator('.inline-toolbar-popup');

  await expect(inlineToolbar).toBeVisible();
  await inlineToolbar.locator('.toolbar-popup__button-link').click();

  const linkDrawer = page.locator('dialog[id^="drawer_1_lexical-rich-text-link-"]').first();

  await expect(linkDrawer).toBeVisible();
  await linkDrawer.locator('#field-url').fill('https://frogbot.ai/docs');
  await linkDrawer.locator('#field-url').press('Tab');
  await linkDrawer.getByRole('button', { name: /save changes/i }).click();
  await expect(linkDrawer).toBeHidden();

  const externalLink = editor.locator('a[href="https://frogbot.ai/docs"]').first();

  await expect(externalLink).toHaveText('docs');

  const saveResponse = page.waitForResponse(
    (response) => response.url().includes('/api/posts') && response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: /save/i }).first().click();
  expect((await saveResponse).ok()).toBe(true);
  await page.waitForURL(
    (url) =>
      /^\/admin\/collections\/posts\/[^/]+$/.test(url.pathname) &&
      !url.pathname.endsWith('/create'),
  );
  await page.reload();
  await expect(editor.locator('a[href="https://frogbot.ai/docs"]')).toHaveText('docs');
});
