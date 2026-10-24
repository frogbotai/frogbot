import { expect, type Locator, type Page, type Request, test } from '@playwright/test';

import { composerInput, expectComposerText } from './__helpers/composer';
import { agentSlug, chatsSlug, imageBase64, providerURL } from './fixtures/chat-assets/shared';

test.setTimeout(120_000);

test.beforeEach(async ({ page, request }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
  expect((await request.delete(`${providerURL}/requests`)).ok()).toBe(true);

  await page.goto(`/collections/${chatsSlug}/create`);
  await page.evaluate(() => window.localStorage.removeItem('frogbot:composer-history'));
  await page.reload();
  await expect(composerInput(page)).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

const isSend = (request: Request) =>
  new URL(request.url()).pathname === `/api/agents/${agentSlug}` && request.method() === 'POST';

const chips = (page: Page, form = '.fb-composer') => page.locator(`${form} .fb-composer-mention`);

function trackSends(page: Page) {
  const sends: Request[] = [];

  page.on('request', (request) => {
    if (isSend(request)) sends.push(request);
  });

  return sends;
}

async function sendWithEnter(page: Page): Promise<unknown[]> {
  const replies = page.getByRole('log').getByText(/^Received \d+ image attachment\.$/);
  const before = await replies.count();
  const response = page.waitForResponse((candidate) => isSend(candidate.request()));

  await page.keyboard.press('Enter');

  const sent = await response;

  await expect(replies).toHaveCount(before + 1);

  return sent.request().postDataJSON().messages.at(-1).parts;
}

async function pickMention(page: Page, query: string) {
  await page.keyboard.type(`@${query}`);
  await expect(page.getByRole('listbox', { name: 'Mentions' }).getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
}

async function arrows(page: Page, key: 'ArrowLeft' | 'Shift+ArrowLeft', count: number) {
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press(key);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  }
}

async function clickEdge(input: Locator, edge: 'start' | 'end') {
  const box = await input.boundingBox();

  if (!box) throw new Error('The input has no box');

  await input.click({ position: { x: edge === 'start' ? 2 : box.width - 2, y: box.height / 2 } });
}

function paste(page: Page, data: Record<string, string>, image = false) {
  return composerInput(page).evaluate(
    (input, { data, image, imageBase64 }) => {
      const clipboard = new DataTransfer();

      for (const [type, value] of Object.entries(data)) clipboard.setData(type, value);

      if (image) {
        const bytes = Uint8Array.from(atob(imageBase64), (character) => character.charCodeAt(0));

        clipboard.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
      }

      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });

      Object.defineProperty(event, 'clipboardData', { value: clipboard });
      input.dispatchEvent(event);
    },
    { data, image, imageBase64 },
  );
}

function enter(page: Page, keyCode: number, isComposing: boolean, before?: string) {
  return composerInput(page).evaluate(
    (input, { keyCode, isComposing, before }) => {
      if (before) input.dispatchEvent(new CompositionEvent(before, { bubbles: true, data: 'に' }));

      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        isComposing,
      });

      Object.defineProperty(event, 'keyCode', { value: keyCode });
      input.dispatchEvent(event);
    },
    { keyCode, isComposing, before },
  );
}

test('an IME Enter neither picks a mention nor sends', async ({ page }) => {
  const sends = trackSends(page);

  await composerInput(page).click();
  await page.keyboard.type('Say @pr');
  await expect(page.getByRole('listbox', { name: 'Mentions' })).toBeVisible();

  await enter(page, 229, false);
  await enter(page, 13, true);
  await enter(page, 229, true, 'compositionstart');
  await enter(page, 229, true, 'compositionend');

  await expect(chips(page)).toHaveCount(0);
  await expectComposerText(page, 'Say @pr');
  expect(sends).toHaveLength(0);
});

test('Enter during a reply queues the draft and sends it once the reply ends', async ({ page }) => {
  let release = () => {};

  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(`**/api/agents/${agentSlug}`, async (route) => {
    if (route.request().method() === 'POST') await held;

    await route.continue();
  });

  const sends = trackSends(page);
  const queued = page.getByRole('list', { name: 'Queued messages' }).getByRole('listitem');
  const replies = page.getByRole('log').getByText(/^Received \d+ image attachment\.$/);

  await composerInput(page).click();
  await page.keyboard.type('first');
  await page.keyboard.press('Enter');
  await expect.poll(() => sends.length).toBe(1);

  await page.keyboard.type('second');
  await page.keyboard.press('Enter');
  await expectComposerText(page, '');
  await expect(queued).toHaveCount(1);
  await expect(queued).toContainText('Queued');
  await expect(queued).toContainText('second');

  expect(sends).toHaveLength(1);

  const second = page.waitForResponse(
    (candidate) =>
      isSend(candidate.request()) &&
      candidate.request().postDataJSON().messages.at(-1).parts[0]?.text === 'second',
  );

  release();

  expect((await second).request().postDataJSON().messages.at(-1).parts).toEqual([
    { type: 'text', text: 'second' },
  ]);
  await expect(replies).toHaveCount(2);
  await expect(queued).toHaveCount(0);
  expect(sends).toHaveLength(2);
});

test('Stop with a draft only stops the reply and keeps the draft', async ({ page }) => {
  await page.route(`**/api/agents/${agentSlug}`, async (route) => {
    if (route.request().method() === 'POST') await new Promise(() => {});
  });

  const sends = trackSends(page);

  await composerInput(page).click();
  await page.keyboard.type('first');
  await page.keyboard.press('Enter');
  await expect.poll(() => sends.length).toBe(1);

  await page.keyboard.type('draft');
  await page.getByRole('button', { name: 'Stop' }).click();

  await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
  await expectComposerText(page, 'draft');
  await expect(page.getByRole('list', { name: 'Queued messages' })).toHaveCount(0);

  expect(sends).toHaveLength(1);
});

test('rich HTML pastes as its plain text, with no markup, script or style', async ({ page }) => {
  const pwned = () => page.evaluate(() => (window as { pwned?: number }).pwned);

  await composerInput(page).click();

  await paste(page, {
    'text/html':
      '<style>.fb-composer{display:none}</style><b>Bold</b><script>window.pwned=1</script>' +
      '<img src=x onerror="window.pwned=2"> <a href="https://example.com">link</a>',
    'text/plain': 'Bold link',
  });

  await expectComposerText(page, 'Bold link');
  await expect(composerInput(page).locator('b, a, img, script, style')).toHaveCount(0);
  await expect(page.locator('.fb-composer')).toBeVisible();

  await paste(page, { 'text/html': '<b>html only</b><img src=x onerror="window.pwned=3">' });

  await expectComposerText(page, 'Bold link');
  expect(await pwned()).toBeUndefined();
});

test('a 2 MB paste becomes one paste attachment, and an image with text attaches without the text', async ({
  page,
}) => {
  const cards = page.locator('.fb-composer').getByTestId('attachment-card');

  await composerInput(page).click();
  await page.keyboard.type('keep ');
  await paste(page, { 'text/plain': 'x'.repeat(2_000_000) });

  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAccessibleName('Pasted text, PASTED, ready');

  await paste(page, { 'text/plain': 'drop me', 'text/html': '<p>drop me</p>' }, true);

  await expect(cards).toHaveCount(2);
  await expectComposerText(page, 'keep ');
});

test('undo and redo bring a chip back as a chip, with its offsets', async ({ page }) => {
  await composerInput(page).click();
  await page.keyboard.type('Ask ');
  await pickMention(page, 'pr');
  await page.keyboard.type('now');

  for (let index = 0; index < 10; index += 1) await page.keyboard.press('ControlOrMeta+z');

  await expectComposerText(page, '');

  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press('ControlOrMeta+Shift+z');
  }

  await expectComposerText(page, 'Ask @Pricing page now');
  await expect(chips(page)).toHaveCount(1);

  for (let index = 0; index < 5; index += 1) await page.keyboard.press('Backspace');

  await expect(chips(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(chips(page)).toHaveCount(1);
  await page.keyboard.type('!');

  expect(await sendWithEnter(page)).toEqual([
    { type: 'text', text: 'Ask @Pricing page!' },
    {
      type: 'data-mention',
      data: expect.objectContaining({ id: 'pricing', start: 4, end: 17 }) as unknown,
    },
  ]);
});

test('arrows step over a chip, and Delete, Backspace and a selection remove it whole', async ({
  page,
}) => {
  await composerInput(page).click();
  await pickMention(page, 'pr');
  await pickMention(page, 'do');
  await expectComposerText(page, '@Pricing page @Docs ');

  await arrows(page, 'ArrowLeft', 4);
  await page.keyboard.press('Delete');

  await expectComposerText(page, ' @Docs ');

  await arrows(page, 'ArrowLeft', 1);
  await page.keyboard.type('X');

  await expectComposerText(page, 'X @Docs ');

  await clickEdge(composerInput(page), 'end');
  await arrows(page, 'Shift+ArrowLeft', 2);
  await page.keyboard.type('Y');

  await expectComposerText(page, 'X Y');
  await expect(chips(page)).toHaveCount(0);

  await page.keyboard.type(' ');
  await pickMention(page, 'pr');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');

  await expectComposerText(page, '');
});

test('editing a sent message keeps its chip, takes a new one, and sends both offsets', async ({
  page,
}) => {
  await composerInput(page).click();
  await page.keyboard.type('Ask ');
  await pickMention(page, 'pr');
  await page.keyboard.type('about it');
  await sendWithEnter(page);

  const message = page.locator('.fb-message').filter({ hasText: 'Ask @Pricing page about it' });

  await message.hover();
  await message.getByRole('button', { name: 'Edit' }).click();

  const editor = page.getByRole('textbox', { name: 'Edit message' });

  await expect(editor).toHaveText('Ask @Pricing page about it');
  await expect(chips(page, '.fb-message-editor')).toHaveCount(1);

  await clickEdge(editor, 'start');
  await page.keyboard.type('Please ');
  await clickEdge(editor, 'end');
  await page.keyboard.type(' and ');
  await pickMention(page, 'do');

  await expect(chips(page, '.fb-message-editor')).toHaveCount(2);
  await expect(editor).toHaveText('Please Ask @Pricing page about it and @Docs ');

  const response = page.waitForResponse((candidate) => isSend(candidate.request()));

  await page.keyboard.press('Enter');

  expect((await response).request().postDataJSON().messages.at(-1).parts).toEqual([
    { type: 'text', text: 'Please Ask @Pricing page about it and @Docs ' },
    { type: 'data-mention', data: expect.objectContaining({ id: 'pricing', start: 11, end: 24 }) },
    { type: 'data-mention', data: expect.objectContaining({ id: 'docs', start: 38, end: 43 }) },
  ]);
});

test('history recalls a multiline prompt and a chip, across a reload', async ({ page }) => {
  const input = composerInput(page);
  const lines = () => input.evaluate((element: HTMLElement) => element.innerText);

  await input.click();
  await page.keyboard.type('Ask ');
  await pickMention(page, 'pr');
  await sendWithEnter(page);

  await page.keyboard.type('Line one');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Line two');
  await sendWithEnter(page);

  await page.keyboard.press('ArrowUp');
  expect(await lines()).toBe('Line one\nLine two');

  await page.keyboard.press('ArrowUp');
  await expectComposerText(page, 'Ask @Pricing page ');
  await expect(chips(page)).toHaveCount(1);

  await page.keyboard.press('ArrowDown');
  expect(await lines()).toBe('Line one\nLine two');

  await page.keyboard.press('ArrowDown');
  await expectComposerText(page, '');

  await page.reload();
  await input.click();
  await page.keyboard.press('ArrowUp');

  expect(await lines()).toBe('Line one\nLine two');
});
