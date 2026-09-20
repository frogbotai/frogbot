import { expect, test } from '@playwright/test';

const user = { email: 'rich-text@example.com', password: 'browser-test-password' };

function getDocumentID(value: unknown): number | string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const directID = Reflect.get(value, 'id');

  if (typeof directID === 'number' || typeof directID === 'string') return directID;

  const doc = Reflect.get(value, 'doc');

  if (typeof doc !== 'object' || doc === null) return undefined;

  const docID = Reflect.get(doc, 'id');

  return typeof docID === 'number' || typeof docID === 'string' ? docID : undefined;
}

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

test('documented block components render and server blocks use req.frogbot', async ({ page }) => {
  await page.goto('/admin/login');
  await page.waitForURL(/\/admin\/(create-first-user|login)/);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)$/.test(url.pathname));

  await page.goto('/admin/collections/posts/create');
  await page.fill('input[name="title"]', 'Documented blocks');

  const editor = page.locator('[contenteditable="true"]').nth(1);

  await editor.click();
  await page.keyboard.insertText('/banner');
  await expect(page.locator('#slash-menu .slash-menu-popup')).toBeVisible();
  await page.getByRole('option', { name: 'Banner' }).click();

  const banner = editor.locator('.LexicalEditorTheme__block').first();

  await expect(banner).toContainText('info banner');
  await expect(banner).toContainText('Banner: Runtime banner');
  await expect(banner).toContainText('Persisted banner content');
  await expect(banner.locator('.LexicalEditorTheme__block__editButton')).toHaveCount(2);
  await expect(banner.locator('.LexicalEditorTheme__block__removeButton')).toHaveCount(1);

  await banner.locator('.LexicalEditorTheme__block__editButton').first().click();

  const bannerDrawer = page.locator('dialog[id^="drawer_1_lexical-blocks-create-"]').first();

  await expect(bannerDrawer).toBeVisible();
  await expect(bannerDrawer.locator('.shimmer-effect')).toHaveCount(0);
  await bannerDrawer.locator('input[name="title"]').fill('Persisted banner title');
  await bannerDrawer.locator('textarea[name="content"]').fill('Persisted banner body');
  await bannerDrawer.getByRole('button', { name: /save changes/i }).click();
  await expect(bannerDrawer).toBeHidden();
  await expect(banner).toContainText('Banner: Persisted banner title');
  await expect(banner).toContainText('Persisted banner body');

  await editor.locator('p').last().click();
  await page.keyboard.insertText('/mention');
  await expect(page.locator('#slash-menu .slash-menu-popup')).toBeVisible();
  await page.getByRole('option', { name: 'Mention' }).click();

  const mentionDrawer = page.locator('dialog').last();

  await expect(mentionDrawer).toBeVisible();
  await mentionDrawer.locator('input[name="username"]').fill('persistent-frog');
  await mentionDrawer.getByRole('button', { name: /save changes/i }).click();
  await expect(mentionDrawer).toBeHidden();

  const mention = editor.locator('.LexicalEditorTheme__inlineBlock').first();

  await expect(mention).toContainText('Mention: @persistent-frog');
  await expect(mention.locator('.LexicalEditorTheme__inlineBlock__editButton')).toHaveCount(1);
  await expect(mention.locator('.LexicalEditorTheme__inlineBlock__removeButton')).toHaveCount(1);

  await editor.locator('p').last().click();
  await page.keyboard.insertText('/calltoaction');
  await expect(page.locator('#slash-menu .slash-menu-popup')).toBeVisible();
  await page.getByRole('option', { name: 'Call To Action' }).click();
  await expect(editor).toContainText(user.email);
  await expect(editor).toContainText('0 files available');
  await expect(editor).toContainText('Editing _components');

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
  await expect(editor.locator('.LexicalEditorTheme__block')).toHaveCount(2);
  await expect(editor.locator('.LexicalEditorTheme__inlineBlock')).toHaveCount(1);
  await expect(editor).toContainText('Banner: Persisted banner title');
  await expect(editor).toContainText('Persisted banner body');
  await expect(editor).toContainText('Mention: @persistent-frog');
  await expect(editor).toContainText(user.email);
  await expect(editor).toContainText('0 files available');
  await expect(editor).toContainText('Editing _components');
});

test('controlled RenderLexical state resets and does not persist with the form', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.waitForURL(/\/admin\/(create-first-user|login)/);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)$/.test(url.pathname));

  await page.goto('/admin/collections/posts/create');
  await page.fill('input[name="title"]', 'On-demand editors');

  const editors = page.locator('[contenteditable="true"]');

  await expect(editors).toHaveCount(7);

  const requiredEditor = editors.first();
  const controlledEditor = editors.nth(3);

  await requiredEditor.click();
  await page.keyboard.insertText('Required content');
  await controlledEditor.click();
  await page.keyboard.insertText(' Temporary');
  await expect(controlledEditor).toContainText('Start writing. Temporary');
  await page.getByRole('button', { name: 'Reset editor' }).click();
  await expect(controlledEditor).toContainText('Start writing.');
  await expect(controlledEditor).not.toContainText('Temporary');

  const saveResponse = page.waitForResponse(
    (response) => response.url().includes('/api/posts') && response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: /save/i }).first().click();
  expect((await saveResponse).ok()).toBe(true);
  await page.waitForURL((url) => /\/admin\/collections\/posts\/[^/]+$/.test(url.pathname));
  await page.reload();
  await expect(controlledEditor).toContainText('Start writing.');
});

test('form-backed RenderLexical content persists with the form', async ({ page }) => {
  await page.goto('/admin/login');
  await page.waitForURL(/\/admin\/(create-first-user|login)/);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)$/.test(url.pathname));

  await page.goto('/admin/collections/posts/create');
  await page.fill('input[name="title"]', 'Persisted on-demand editor');

  const requiredEditor = page.locator('[data-field-path="content"] [contenteditable="true"]');
  const formEditor = page.locator('[data-field-path="previewContent"] [contenteditable="true"]');

  await requiredEditor.fill('Required content');
  await formEditor.fill('Persisted preview content');

  const saveResponse = page.waitForResponse(
    (response) => response.url().includes('/api/posts') && response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: /save/i }).first().click();
  expect((await saveResponse).ok()).toBe(true);
  await page.waitForURL((url) => /\/admin\/collections\/posts\/[^/]+$/.test(url.pathname));

  const persistedResponse = await page.request.get(
    '/api/posts?where[title][equals]=Persisted%20on-demand%20editor&sort=-createdAt&limit=1',
  );

  expect(persistedResponse.ok()).toBe(true);
  await expect(persistedResponse.json()).resolves.toMatchObject({
    docs: [
      {
        previewContent: {
          root: {
            children: [
              {
                children: [{ text: 'Persisted preview content' }],
              },
            ],
          },
        },
      },
    ],
  });
});

test('RenderLexical omits the editor when its schema path does not resolve', async ({ page }) => {
  await page.goto('/admin/login');
  await page.waitForURL(/\/admin\/(create-first-user|login)/);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)$/.test(url.pathname));

  await page.goto('/admin/collections/schema-mismatches/create');
  await expect(page.getByRole('heading', { name: '[Untitled]' })).toBeVisible();
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
});

test('CodeBlock exposes the documented TypeScript language in the editor', async ({ page }) => {
  await page.goto('/admin/login');
  await page.waitForURL(/\/admin\/(create-first-user|login)/);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)$/.test(url.pathname));

  await page.goto('/admin/collections/posts/create');

  const editors = page.locator('[contenteditable="true"]');

  await expect(editors).toHaveCount(7);

  const editor = editors.nth(5);

  await editor.click();
  await page.keyboard.insertText('/code');
  await expect(page.locator('#slash-menu .slash-menu-popup')).toBeVisible();
  await page.getByRole('option', { name: 'Code' }).click();
  await expect(editor.getByText('TypeScript')).toBeVisible();
});

test('divider inserts from the slash menu and typed Markdown', async ({ page }) => {
  await page.goto('/admin/login');
  await page.waitForURL(/\/admin\/(create-first-user|login)/);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)$/.test(url.pathname));

  await page.goto('/admin/collections/posts/create');

  const editors = page.locator('[contenteditable="true"]');

  await expect(editors).toHaveCount(7);

  const editor = editors.nth(6);

  await editor.click();
  await page.keyboard.insertText('/divider');
  await expect(page.locator('#slash-menu .slash-menu-popup')).toBeVisible();
  await page.getByRole('option', { name: 'Divider' }).click();
  await expect(editor.getByRole('separator', { name: 'Divider' })).toHaveCount(1);

  await editor.locator('p').last().click();
  await page.keyboard.insertText('+++');
  await page.keyboard.press('Space');
  await expect(editor.getByRole('separator', { name: 'Divider' })).toHaveCount(2);

  await editor.locator('p').last().click();
  await page.locator('.fixed-toolbar__group-add:visible').getByRole('button').click();
  await page.getByRole('button', { name: 'Divider' }).click();
  await expect(editor.getByRole('separator', { name: 'Divider' })).toHaveCount(3);
});

test('view selection preserves saved content and safely renders editor nodes', async ({ page }) => {
  await page.goto('/admin/login');
  await page.waitForURL(/\/admin\/(create-first-user|login)/);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)$/.test(url.pathname));

  const paragraph = {
    children: [
      {
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
        text: 'View paragraph',
        type: 'text',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    type: 'paragraph',
    version: 1,
  };
  const root = {
    children: [paragraph],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  };
  const createResponse = await page.request.post('/api/posts', {
    data: {
      title: 'Documented views',
      content: { root },
      viewContent: {
        root: {
          ...root,
          children: [
            paragraph,
            {
              fields: {
                blockName: '',
                blockType: 'banner',
                id: 'view-banner',
                message: 'View banner',
              },
              format: '',
              type: 'block',
              version: 2,
            },
          ],
        },
      },
    },
  });
  const created: unknown = await createResponse.json();
  const documentID = getDocumentID(created);

  expect(createResponse.ok()).toBe(true);
  expect(documentID).toBeDefined();

  await page.goto(`/admin/collections/posts/${documentID}`);

  const editors = page.locator('[contenteditable="true"]');

  await expect(editors).toHaveCount(7);

  const viewEditor = editors.nth(4);

  await expect(viewEditor).toContainText('View paragraph');
  await page.locator('.lexical-view-selector__button').click();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('.lexical-view-selector__label')).toHaveText('Preview');
  await expect(viewEditor).toContainText('View paragraph');
  await expect(viewEditor.locator('.post-preview-banner')).toHaveCount(1);
  await page.reload();
  await expect(viewEditor).toContainText('View paragraph');

  await page.goto('/');
  await expect(page.getByTestId('rendered-view-content')).toContainText('View paragraph');
  await expect(
    page.getByTestId('rendered-view-content').locator('.post-preview-banner'),
  ).toContainText('View banner');
});
