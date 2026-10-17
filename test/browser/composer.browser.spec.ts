import { type APIRequestContext, expect, type Page, type Request, test } from '@playwright/test';

import { composerInput, expectComposerText } from './__helpers/composer';
import {
  agentSlug,
  assetsSlug,
  chatsSlug,
  imageBase64,
  providerURL,
} from './fixtures/chat-assets/shared';

type ProviderRequest = {
  messages: { role: string; content: string | { type: string; text?: string }[] }[];
};

type MessagePart = { type: string; [key: string]: unknown };

test.setTimeout(120_000);

test.beforeEach(async ({ page, request }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
  expect((await request.delete(`${providerURL}/requests`)).ok()).toBe(true);

  await page.goto(`/collections/${chatsSlug}/create`);
  await expect(composerInput(page)).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

function trackSends(page: Page) {
  const sends: Request[] = [];

  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === `/api/agents/${agentSlug}` &&
      request.method() === 'POST'
    ) {
      sends.push(request);
    }
  });

  return sends;
}

async function sendWithEnter(page: Page): Promise<MessagePart[]> {
  const response = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === `/api/agents/${agentSlug}` &&
      candidate.request().method() === 'POST',
  );

  await composerInput(page).press('Enter');

  const sent = await response;

  expect(sent.status()).toBe(200);
  await expect(page.getByRole('log').getByText(/^Received \d+ image attachment\.$/)).toBeVisible();

  return sent.request().postDataJSON().messages.at(-1).parts;
}

function paste(page: Page, data: { text?: string; image?: string }) {
  return composerInput(page).evaluate((input, { text, image }) => {
    const clipboard = new DataTransfer();

    if (text !== undefined) clipboard.setData('text/plain', text);

    if (image) {
      const bytes = Uint8Array.from(atob(image), (character) => character.charCodeAt(0));

      clipboard.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
    }

    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });

    Object.defineProperty(event, 'clipboardData', { value: clipboard });
    input.dispatchEvent(event);
  }, data);
}

async function modelTexts(request: APIRequestContext) {
  const requests: ProviderRequest[] = await (await request.get(`${providerURL}/requests`)).json();

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

function composerCard(page: Page) {
  return page.locator('.fb-composer').getByTestId('attachment-card');
}

test('Shift+Enter adds a line and Enter sends the typed text', async ({ page }) => {
  await composerInput(page).click();
  await page.keyboard.type('Line one');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Line two');

  expect(await composerInput(page).evaluate((input: HTMLElement) => input.innerText)).toBe(
    'Line one\nLine two',
  );

  const parts = await sendWithEnter(page);

  expect(parts).toEqual([{ type: 'text', text: 'Line one\nLine two' }]);
  await expectComposerText(page, '');
});

test('Enter during IME composition never sends', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'IME composition is driven through Chromium CDP');

  const sends = trackSends(page);
  const cdp = await page.context().newCDPSession(page);

  await composerInput(page).click();
  await page.keyboard.type('Say ');
  await cdp.send('Input.imeSetComposition', { text: 'にほん', selectionStart: 3, selectionEnd: 3 });

  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 229,
  });

  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
  await cdp.send('Input.insertText', { text: '日本' });

  await expectComposerText(page, 'Say 日本');
  expect(sends).toHaveLength(0);

  const parts = await sendWithEnter(page);

  expect(parts).toEqual([{ type: 'text', text: 'Say 日本' }]);
});

test('a pasted image becomes an attachment and drops the text beside it, and a 651-character paste a paste attachment', async ({
  page,
}) => {
  const upload = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/${assetsSlug}` &&
      response.request().method() === 'POST',
  );

  await paste(page, { image: imageBase64, text: 'Copied caption' });

  expect((await upload).status()).toBe(201);
  await expect(composerCard(page)).toHaveAccessibleName('shot.png, ready');
  await expectComposerText(page, '');

  await paste(page, { text: 'p'.repeat(651) });

  await expect(composerCard(page).nth(1)).toHaveAccessibleName('Pasted text, PASTED, ready');
  await expectComposerText(page, '');

  await composerInput(page).click();
  await page.keyboard.insertText('a'.repeat(650));

  await expectComposerText(page, 'a'.repeat(650));
  await expect(composerCard(page)).toHaveCount(2);
});

test('@ picks a mention chip, one Backspace removes it, and the sent message shows @label', async ({
  page,
  request,
}) => {
  const chip = page.locator('.fb-composer .fb-composer-mention');

  await composerInput(page).click();
  await page.keyboard.type('Ask @pr');

  const listbox = page.getByRole('listbox', { name: 'Mentions' });

  await expect(listbox.getByRole('option')).toHaveText(['Pricing page']);

  await page.keyboard.press('Enter');

  await expect(chip).toHaveText('@Pricing page');
  await expect(listbox).toBeHidden();

  await page.keyboard.press('Backspace');

  await expect(chip).toHaveCount(1);

  await page.keyboard.press('Backspace');

  await expect(chip).toHaveCount(0);
  await expectComposerText(page, 'Ask ');

  await page.keyboard.type('@pr');
  await page.keyboard.press('Tab');
  await page.keyboard.type('about it');

  const parts = await sendWithEnter(page);

  expect(parts).toEqual([
    { type: 'text', text: 'Ask @Pricing page about it' },
    {
      type: 'data-mention',
      data: {
        source: 'pages',
        id: 'pricing',
        label: 'Pricing page',
        data: { url: '/pricing' },
        start: 4,
        end: 17,
      },
    },
  ]);

  const message = page.locator('.fb-message').filter({ hasText: 'Ask @Pricing page about it' });

  await expect(message).toBeVisible();
  await expect(message.locator('[data-part="unknown"], .fb-data-part')).toHaveCount(0);
  expect(await modelTexts(request)).toContain('Ask @Pricing page about it');
});
