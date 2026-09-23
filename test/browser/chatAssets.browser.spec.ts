import { expect, test } from '@playwright/test';

import { signIn } from './__helpers/signIn';
import {
  agentSlug,
  assetsSlug,
  chatsSlug,
  filesSlug,
  imageBase64,
  messagesSlug,
  providerURL,
} from './fixtures/chat-assets/shared';

test.setTimeout(120_000);

test.beforeEach(async ({ page, request }) => {
  await signIn(page);

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
  expect((await request.delete(`${providerURL}/requests`)).ok()).toBe(true);

  await page.goto(`/collections/${chatsSlug}/create`);
  await expect(page.getByRole('button', { name: 'Add files', exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

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

  await expect(page.locator('.fb-composer').getByRole('img', { name: filename })).toBeVisible();
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
