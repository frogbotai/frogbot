import {
  type APIRequestContext,
  expect,
  type FilePayload,
  type Locator,
  type Page,
  type Request,
  test,
} from '@playwright/test';

import { signIn } from './__helpers/signIn';
import {
  agentSlug,
  assetsSlug,
  chatsSlug,
  filesSlug,
  imageBase64,
  messagesSlug,
  providerURL,
  textReaderName,
} from './fixtures/chat-assets/shared';

type ProviderMessage = {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
};

type ProviderRequest = { model: string; messages: ProviderMessage[] };

type MessagePart = { type: string; [key: string]: unknown };

const createChatPath = `/collections/${chatsSlug}/create`;

const photo = {
  name: 'photo.png',
  mimeType: 'image/png',
  buffer: Buffer.from(imageBase64, 'base64'),
};

const docx = {
  name: 'report.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  buffer: Buffer.concat([Buffer.from('PK\u0003\u0004', 'latin1'), Buffer.alloc(64)]),
};

test.setTimeout(120_000);

test.beforeEach(async ({ page, request }) => {
  await signIn(page);

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
  expect((await request.delete(`${providerURL}/requests`)).ok()).toBe(true);

  await page.goto(createChatPath);
  await expect(page.getByRole('button', { name: 'Add files', exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

function trackUploads(page: Page) {
  const uploads: Request[] = [];

  page.on('request', (request) => {
    const upload =
      new URL(request.url()).pathname === `/api/${assetsSlug}` && request.method() === 'POST';

    if (upload) uploads.push(request);
  });

  return uploads;
}

function waitForUpload(page: Page) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/${assetsSlug}` &&
      response.request().method() === 'POST',
  );
}

async function pickFiles({ page, files }: { page: Page; files: FilePayload[] }) {
  const chooser = page.waitForEvent('filechooser');

  await page.getByRole('button', { name: 'Add files', exact: true }).click();
  await (await chooser).setFiles(files);
}

async function send({ page, prompt }: { page: Page; prompt: string }): Promise<MessagePart[]> {
  await page.locator('.fb-composer textarea').fill(prompt);

  const agentResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/agents/${agentSlug}` &&
      response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: 'Send', exact: true }).click();

  const sent = await agentResponse;

  expect(sent.status()).toBe(200);

  await expect(page.getByText(/^Received \d+ image attachment\.$/)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));

  return sent.request().postDataJSON().messages.at(-1).parts;
}

async function providerUserTexts(request: APIRequestContext) {
  const response = await request.get(`${providerURL}/requests`);

  expect(response.ok()).toBe(true);

  const requests: ProviderRequest[] = await response.json();

  return requests.flatMap(({ messages }) =>
    messages
      .filter(({ role }) => role === 'user')
      .flatMap(({ content }) =>
        typeof content === 'string'
          ? [content]
          : content.flatMap((part) => (part.type === 'text' && part.text ? [part.text] : [])),
      ),
  );
}

async function selectModel({ page, id, name }: { page: Page; id: string; name: string }) {
  await page.locator('.fb-model-selector__trigger').click();
  await page.locator('.fb-model-selector__model').click();
  await page.locator(`.fb-model-selector__option[title="${id}"]`).click();
  await page.keyboard.press('Escape');

  await expect(page.locator('.fb-model-selector__trigger .fb-model-selector__name')).toHaveText(
    name,
  );
}

function composerCard(page: Page) {
  return page.locator('.fb-composer').getByTestId('attachment-card');
}

function composerStatus(page: Page) {
  return page.locator('.fb-composer .fb-attachments__status');
}

function readCardColors(card: Locator) {
  return card.evaluate((element) => {
    const color = (selector: string) => getComputedStyle(element.querySelector(selector)!).color;
    const probe = document.createElement('span');

    probe.style.color = 'var(--theme-base-900)';
    element.append(probe);

    const base = getComputedStyle(probe).color;

    probe.remove();

    const style = getComputedStyle(element);

    return {
      border: style.borderTopColor,
      background: style.backgroundColor,
      base,
      icon: color('.fb-attachment-card__icon'),
      text: [
        color('.fb-attachment-card__name'),
        color('.fb-attachment-card__status'),
        color('.fb-attachment-card__reason'),
      ],
    };
  });
}

function srgbChannels(color: string) {
  const srgb = color.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/);

  if (srgb) return srgb.slice(1, 4).map(Number);

  const rgb = color.match(/^rgba?\((\d+), (\d+), (\d+)/);

  expect(rgb, `an rgb() or color(srgb) value, got ${color}`).not.toBeNull();

  return rgb!.slice(1, 4).map((value) => Number(value) / 255);
}

function luminance(color: string) {
  const [red, green, blue] = srgbChannels(color).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast({ text, background }: { text: string; background: string }) {
  const [light, dark] = [luminance(text), luminance(background)].sort((a, b) => b - a);

  return (light + 0.05) / (dark + 0.05);
}

test('composer uploads a private chat asset, sends its bytes, and restores the attachment after reload', async ({
  page,
  request,
}) => {
  const filename = 'browser-attachment.png';
  const prompt = 'Describe this uploaded image.';
  const image = Buffer.from(imageBase64, 'base64');
  const uploadResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/${assetsSlug}` &&
      response.request().method() === 'POST',
  );

  const chooserPromise = page.waitForEvent('filechooser');

  await page.getByRole('button', { name: 'Add files', exact: true }).click();

  const chooser = await chooserPromise;

  await chooser.setFiles({ name: filename, mimeType: 'image/png', buffer: image });

  const uploaded = await uploadResponse;

  expect(uploaded.status()).toBe(201);

  const { doc: asset } = await uploaded.json();

  expect(asset).toMatchObject({ filename, mimeType: 'image/png', filesize: image.length });
  expect(asset.owner).toBeTruthy();
  expect(asset.chat).toBeFalsy();

  await expect(
    page.locator('.fb-composer').getByRole('img', { name: filename, exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(`Uploading ${filename}`, { exact: true })).toHaveCount(0);

  const filesBeforeSend = await page.request.get(`/api/${filesSlug}`);

  expect(filesBeforeSend.ok()).toBe(true);
  expect(await filesBeforeSend.json()).toMatchObject({ totalDocs: 0 });

  const anonymousDraft = await request.get(`/api/${assetsSlug}/${asset.id}`);
  const anonymousDownload = await request.get(asset.url);

  expect([401, 403, 404]).toContain(anonymousDraft.status());
  expect([401, 403, 404]).toContain(anonymousDownload.status());

  await page.locator('.fb-composer textarea').fill(prompt);

  const agentResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/agents/${agentSlug}` &&
      response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: 'Send', exact: true }).click();

  const sent = await agentResponse;

  expect(sent.status()).toBe(200);
  expect(sent.request().postDataJSON().messages[0].parts).toContainEqual({
    type: 'file-reference',
    id: asset.id,
    filename,
    mediaType: 'image/png',
  });

  await expect(page.getByText('Received 1 image attachment.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));
  await expect(page.getByRole('button', { name: `Remove ${filename}`, exact: true })).toHaveCount(
    0,
  );

  const chatId = Number(new URL(page.url()).pathname.split('/').at(-1));
  const providerRequests = await (await request.get(`${providerURL}/requests`)).json();

  expect(providerRequests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'image_url',
                image_url: expect.objectContaining({ url: `data:image/png;base64,${imageBase64}` }),
              }),
            ]),
          }),
        ]),
      }),
    ]),
  );

  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/${messagesSlug}`, {
        params: { 'where[chat][equals]': chatId, depth: 0 },
      });

      expect(response.ok()).toBe(true);

      return (await response.json()).totalDocs;
    })
    .toBe(2);

  const storedAsset = await page.request.get(`/api/${assetsSlug}/${asset.id}?depth=0`);

  expect(storedAsset.ok()).toBe(true);
  expect(await storedAsset.json()).toMatchObject({ id: asset.id, chat: chatId, filename });

  const storedMessages = await page.request.get(`/api/${messagesSlug}`, {
    params: { 'where[chat][equals]': chatId, depth: 0 },
  });

  expect((await storedMessages.json()).docs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        parts: expect.arrayContaining([
          { type: 'file-reference', id: asset.id, filename, mediaType: 'image/png' },
          { type: 'text', text: prompt },
        ]),
      }),
    ]),
  );

  await expect.soft(page.locator('.fb-message').getByRole('img', { name: filename })).toBeVisible();

  await page.reload();

  await expect(page.getByText(prompt, { exact: true })).toBeVisible();
  await expect(page.getByText('Received 1 image attachment.', { exact: true })).toBeVisible();

  const download = await page.request.get(asset.url);

  expect(download.ok()).toBe(true);
  expect(download.headers()['content-type']).toContain('image/png');
  expect(await download.body()).toEqual(image);

  const anonymousAttached = await request.get(`/api/${assetsSlug}/${asset.id}`);
  const anonymousAttachedDownload = await request.get(asset.url);

  expect([401, 403, 404]).toContain(anonymousAttached.status());
  expect([401, 403, 404]).toContain(anonymousAttachedDownload.status());

  const filesAfterReload = await page.request.get(`/api/${filesSlug}`);
  const assetsAfterReload = await page.request.get(`/api/${assetsSlug}`);

  expect(await filesAfterReload.json()).toMatchObject({ totalDocs: 0 });
  expect(await assetsAfterReload.json()).toMatchObject({ totalDocs: 1 });

  const restoredImage = page.locator('.fb-message').getByRole('img', { name: filename });

  await expect(restoredImage).toBeVisible();
  await expect
    .poll(() => restoredImage.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
});

test('an unsupported file shows a red card, is never uploaded, and the message sends without it', async ({
  page,
  request,
}) => {
  const uploads = trackUploads(page);

  await pickFiles({ page, files: [docx] });

  const card = composerCard(page);

  await expect(card).toHaveAttribute('data-state', 'refused');
  await expect(card).toHaveAccessibleName("report.docx, DOCX, won't be sent");
  await expect(card).toHaveAccessibleDescription("Won't be sent. This file type isn't supported.");
  await expect(composerStatus(page)).toHaveText(
    "report.docx won't be sent: this file type isn't supported",
  );

  const parts = await send({ page, prompt: 'Summarise the report.' });

  expect(parts).toEqual([{ type: 'text', text: 'Summarise the report.' }]);
  expect(uploads).toHaveLength(0);

  await expect(composerCard(page)).toHaveCount(0);

  const texts = await providerUserTexts(request);

  expect(texts).toContain('Summarise the report.');
  expect(texts.join('\n')).not.toContain('report.docx');
});

test('a code file becomes a JS text card that opens, and the agent receives it under its real name', async ({
  page,
  request,
}) => {
  const contents = 'export const answer = 42;\n';
  const uploadResponse = waitForUpload(page);

  await pickFiles({
    page,
    files: [{ name: 'app.js', mimeType: 'text/javascript', buffer: Buffer.from(contents) }],
  });

  const uploaded = await uploadResponse;

  expect(uploaded.status()).toBe(201);

  const { doc: asset } = await uploaded.json();

  expect(asset).toMatchObject({ filename: 'app.js.txt', mimeType: 'text/plain' });

  const card = composerCard(page);

  await expect(card).toHaveAttribute('data-state', 'text');
  await expect(card).toHaveAccessibleName('app.js, JS, ready');
  await expect(card.locator('.fb-attachment-card__tag')).toHaveText('JS');
  await expect(composerStatus(page)).toHaveText('app.js attached as text');

  await card.getByRole('button', { name: 'Open app.js', exact: true }).click();

  const viewer = page.getByRole('dialog', { name: 'app.js' });

  await expect(viewer).toBeVisible();
  await expect(viewer.locator('pre')).toHaveText(contents);

  await viewer.getByRole('button', { name: 'Close', exact: true }).click();

  await expect(viewer).toHaveCount(0);

  const parts = await send({ page, prompt: 'Review this code.' });

  expect(parts).toContainEqual({
    type: 'file-reference',
    id: asset.id,
    filename: 'app.js',
    mediaType: 'text/plain',
  });

  expect(await providerUserTexts(request)).toContain(`Attached file "app.js":\n${contents}`);

  const sentCard = page.locator('.fb-message').getByTestId('attachment-card');

  await expect(sentCard).toHaveAttribute('data-state', 'text');
  await expect(sentCard).toHaveAccessibleName('app.js, JS, ready');
  await expect(sentCard.getByRole('button', { name: 'Remove app.js' })).toHaveCount(0);
});

test('long pasted text is stored as a text asset and reaches the agent as pasted text', async ({
  page,
  request,
}) => {
  const pasted = 'A pasted line of meeting notes.\n'.repeat(25);
  const uploadResponse = waitForUpload(page);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((text) => navigator.clipboard.writeText(text), pasted);
  await page.locator('.fb-composer textarea').focus();
  await page.keyboard.press('ControlOrMeta+V');

  const uploaded = await uploadResponse;

  expect(uploaded.status()).toBe(201);

  const { doc: asset } = await uploaded.json();

  expect(asset.filename).toMatch(/^pasted-\d+\.txt$/);

  const card = composerCard(page);

  await expect(card).toHaveAttribute('data-state', 'text');
  await expect(card).toHaveAccessibleName('Pasted text, PASTED, ready');
  await expect(page.locator('.fb-composer textarea')).toHaveValue('');

  const parts = await send({ page, prompt: 'Summarise my notes.' });

  expect(parts).toContainEqual({
    type: 'file-reference',
    id: asset.id,
    filename: 'Pasted text',
    mediaType: 'text/plain',
    origin: 'paste',
  });

  expect(await providerUserTexts(request)).toContain(`Pasted text:\n${pasted}`);
});

test('a model that reads only text refuses an image and leaves images out of the picker', async ({
  page,
}) => {
  const uploads = trackUploads(page);

  await selectModel({ page, id: 'browser/text-reader', name: textReaderName });

  const accept = await page.locator('.fb-composer input[type="file"]').getAttribute('accept');

  expect(accept?.split(',')).toEqual(expect.arrayContaining(['text/*', '.md', '.js']));
  expect(accept?.split(',')).not.toContain('image/png');

  await pickFiles({ page, files: [photo] });

  const card = composerCard(page);

  await expect(card).toHaveAttribute('data-state', 'refused');
  await expect(card).toHaveAccessibleName("photo.png, PNG, won't be sent");
  await expect(card).toHaveAccessibleDescription(
    `Won't be sent. ${textReaderName} can't read images.`,
  );
  await expect(composerStatus(page)).toHaveText(
    `photo.png won't be sent: ${textReaderName} can't read images`,
  );

  expect(uploads).toHaveLength(0);
});

test('a file over 10 MB shows the large-file tag with its explanation', async ({ page }) => {
  const hint =
    'Large file (11.0 MB). In long chats, older files may be left out to keep requests small.';
  const buffer = Buffer.alloc(11_000_000);
  const uploadResponse = waitForUpload(page);

  buffer.write('%PDF-1.4\n');

  await pickFiles({ page, files: [{ name: 'big.pdf', mimeType: 'application/pdf', buffer }] });

  expect((await uploadResponse).status()).toBe(201);

  const card = composerCard(page);

  await expect(card).toHaveAttribute('data-state', 'ready');
  await expect(card).toHaveClass(/fb-attachment-card--large/);
  await expect(card).toHaveAccessibleDescription(hint);

  const warning = await card.evaluate((element) => {
    const probe = document.createElement('span');

    probe.style.color = 'var(--color-warning)';
    element.append(probe);

    const color = getComputedStyle(probe).color;

    probe.remove();

    return color;
  });

  await expect(card).toHaveCSS('border-top-color', warning);

  await card.getByText('Large file', { exact: true }).hover();

  await expect(page.getByRole('tooltip')).toHaveText(hint);
});

test('a text card and its viewer work with the keyboard alone', async ({ page }) => {
  const contents = '# Notes\n\nShip the attachment card.\n';
  const uploadResponse = waitForUpload(page);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  await pickFiles({
    page,
    files: [{ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from(contents) }],
  });

  expect((await uploadResponse).status()).toBe(201);

  const card = composerCard(page);
  const open = card.getByRole('button', { name: 'Open notes.md', exact: true });
  const remove = card.getByRole('button', { name: 'Remove notes.md', exact: true });

  await expect(card).toHaveAttribute('data-state', 'text');

  await page.locator('.fb-composer textarea').focus();
  await page.keyboard.press('Shift+Tab');

  await expect(remove).toBeFocused();

  await page.keyboard.press('Shift+Tab');

  await expect(open).toBeFocused();

  await page.keyboard.press('Enter');

  const viewer = page.getByRole('dialog', { name: 'notes.md' });
  const text = viewer.locator('pre');
  const close = viewer.getByRole('button', { name: 'Close', exact: true });
  const copy = viewer.getByRole('button', { name: 'Copy', exact: true });

  await expect(viewer).toBeVisible();
  await expect(text).toHaveText(contents);
  await expect(text).toBeFocused();

  await page.keyboard.press('Tab');

  await expect(close).toBeFocused();

  await page.keyboard.press('Tab');

  await expect(copy).toBeFocused();

  await page.keyboard.press('Enter');

  await expect(viewer.getByRole('status')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(contents);

  await page.keyboard.press('Tab');

  await expect(text).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(viewer).toHaveCount(0);
  await expect(open).toBeFocused();

  await page.keyboard.press('Tab');

  await expect(remove).toBeFocused();

  await page.keyboard.press('Enter');

  await expect(composerCard(page)).toHaveCount(0);
  await expect(composerStatus(page)).toHaveText('notes.md removed');
});

for (const theme of ['light', 'dark'] as const) {
  test(`a red card in the ${theme} admin theme has a red border and readable base text`, async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'frogbot-theme', value: theme, domain: 'localhost', path: '/' }]);
    await page.goto(createChatPath);

    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    await pickFiles({ page, files: [docx] });

    const card = composerCard(page);

    await expect(card).toHaveAttribute('data-state', 'refused');

    const colors = await readCardColors(card);

    expect(colors.border).toBe('rgb(231, 72, 96)');
    expect(colors.icon).toBe('rgb(231, 72, 96)');
    expect(colors.text).toEqual([colors.base, colors.base, colors.base]);
    expect(contrast({ text: colors.base, background: colors.background })).toBeGreaterThanOrEqual(
      4.5,
    );
  });
}
