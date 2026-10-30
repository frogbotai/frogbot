import { expect, type Page, type Route, test } from '@playwright/test';

import { composerInput } from './__helpers/composer';
import { content, scroller, send, settled } from './__helpers/dojoChat';

test.use({ viewport: { width: 1280, height: 800 } });

test.setTimeout(120_000);

function reply(route: Route, turn: number) {
  const text = Array.from({ length: 12 }, (_, index) => `Reply ${turn} line ${index + 1}.`).join(
    '\n\n',
  );

  const chunks = [
    { type: 'start' },
    { type: 'text-start', id: 'text-0' },
    { type: 'text-delta', id: 'text-0', delta: text },
    { type: 'text-end', id: 'text-0' },
    { type: 'finish' },
  ];

  return route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
    body: `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
  });
}

async function answerTurns(page: Page) {
  let turn = 0;
  let holding = false;

  await page.route('**/api/agents/*', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();

    turn += 1;

    if (holding) return;

    await reply(route, turn);
  });

  return () => {
    holding = true;
  };
}

const pinGap = (page: Page) =>
  scroller(page).evaluate((node) => {
    const rows = [...node.querySelectorAll<HTMLElement>('.fb-message-list__item[data-message-id]')];
    const sent = rows.at(-1)!;

    return {
      gap: sent.getBoundingClientRect().top - node.getBoundingClientRect().top,
      offset: parseFloat(getComputedStyle(node).scrollPaddingTop),
      scrollerTop: node.getBoundingClientRect().top,
    };
  });

test('a sent message lands the pin offset below the top of the chat’s own scroller', async ({
  page,
}) => {
  const hold = await answerTurns(page);

  await page.goto('/collections/chats/create');
  await expect(composerInput(page)).toBeVisible();

  for (let turn = 1; turn <= 3; turn++) {
    await send(page, `Question ${turn}`);
    await expect(content(page)).toContainText(`Reply ${turn} line 12.`);
    await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden();
  }

  hold();
  await send(page, 'The pinned question');
  await settled(page);

  const { gap, offset, scrollerTop } = await pinGap(page);

  expect(scrollerTop, 'the admin header sits above the chat').toBeGreaterThan(0);
  expect(offset).toBeGreaterThan(0);
  expect(Math.abs(gap - offset)).toBeLessThanOrEqual(2);
});
